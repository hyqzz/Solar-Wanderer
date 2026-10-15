// 时间系统：UTC → 儒略日 → 地球力学时(TT)，以及可加速/暂停/回溯的仿真时钟。
// 星历的自变量统一使用 jdTT（TT 儒略日）。

export const J2000 = 2451545.0;
export const DAY_SECONDS = 86400;

/** UTC Date → 儒略日（UT）。Date.getTime 基于 Unix 纪元 1970-01-01T00:00Z = JD 2440587.5 */
export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/**
 * ΔT = TT − UT1（秒）。分三段，各自的误差量级完全不同：
 *
 *   ① 1972-01-01 起：闰秒表 + 32.184s 常数差。
 *      注意严格说 TT−UT1 = (32.184 + TAI−UTC) − (UT1−UTC)，而 UTC 的定义保证
 *      |UT1−UTC| < 0.9s，所以这一段是"有界近似"，误差 ≤0.9 s（月球位置 0.5″、
 *      地球自转 0.004°，可忽略）。
 *
 *   ② 1972 之前：Espenak & Meeus 分段多项式（每段各有自己的定义域与零点年）。
 *      此前这里误用了只在 2005–2050 有效的单条多项式，导致历史时刻严重偏差：
 *      1800 年 +208 s、1900 年 +89 s、公元 1000 年 +0.06 天、公元前 3000 年 +1.6 天。
 *      而"站在任意历史时刻看真实的天空"正是本项目的核心功能，所以这是必须修的错误。
 *
 *   ③ 表尾（最后一次闰秒）之后：闰秒停止后没有权威值，只能外推。
 *      近几十年 ΔT 处于平台期（2016 起一直 ≈69.2 s），所以最初几年沿用表尾值
 *      仍然在 ±0.9 s 界内；再往后用一个明确标注为"预测"的缓变式，并在 2150 年后
 *      收敛到 Espenak 长期抛物线，避免常数外推在几个世纪尺度上无界偏小。
 *      ⚠ 新增闰秒时只需在 steps 表尾追加一行。
 */
const LEAP_SECONDS = (() => {
  // [UTC 生效日期, TAI−UTC]
  const steps = [
    ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
    ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
    ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
    ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
    ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
    ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
    ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
  ];
  return steps.map(([d, v]) => [dateToJD(new Date(d + 'T00:00:00Z')), v]);
})();

/** Horner 法求值，系数从常数项开始排列 */
function poly(t, coeffs) {
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * t + coeffs[i];
  return r;
}

/**
 * Espenak & Meeus 分段多项式。每项 [起始年（含）, 系数表, 零点年, 自变量缩放]，
 * 自变量 t = (year − 零点年) / 缩放 —— 早期各段的公式原以世纪为单位，缩放不可省。
 * 顺序查找：取最后一个 startYear ≤ year 的段。
 */
const DELTA_T_SEGMENTS = [
  [-Infinity, [-20, 0, 32], 1820, 100],                              // u = (y−1820)/100
  [-500, [10583.6, -1014.41, 33.78311, -5.952053, -0.1798452,
    0.022174192, 0.0090316521], 0, 100],                             // u = y/100
  [500, [1574.2, -556.01, 71.23472, 0.319781, -0.8503463,
    -0.005050998, 0.0083572073], 1000, 100],                         // u = (y−1000)/100
  [1600, [120, -0.9808, -0.01532, 1 / 7129], 1600, 1],
  [1700, [8.83, 0.1603, -0.0059285, 0.00013336, -1 / 1174000], 1700, 1],
  [1800, [13.72, -0.332447, 0.0068612, 0.0041116, -0.00037436,
    0.0000121272, -0.0000001699, 0.000000000875], 1800, 1],
  [1860, [7.62, 0.5737, -0.251754, 0.01680668, -0.0004473624, 1 / 233174], 1860, 1],
  [1900, [-2.79, 1.494119, -0.0598939, 0.0061966, -0.000197], 1900, 1],
  [1920, [21.20, 0.84493, -0.076100, 0.0020936], 1920, 1],
  [1941, [29.07, 0.407, -1 / 233, 1 / 2547], 1950, 1],
  [1961, [45.45, 1.067, -1 / 260, -1 / 718], 1975, 1],
];

function deltaTBefore1972(year) {
  let seg = DELTA_T_SEGMENTS[0];
  for (const s of DELTA_T_SEGMENTS) if (year >= s[0]) seg = s;
  return poly((year - seg[2]) / seg[3], seg[1]);
}

/** 闰秒表尾之后的预测：2035 年前视为落在 ±0.9 s 界内，此后平滑接向长期抛物线 */
const LEAP_TAIL_YEAR = 2017;
const DELTA_T_DRIFT_FROM = 2035;
const DELTA_T_LONG_TERM_YEAR = 2150;

function deltaTAfterLeapTable(year, exact) {
  if (year <= DELTA_T_DRIFT_FROM) return exact;
  const u = (year - 1820) / 100;
  const longTerm = -20 + 32 * u * u;
  const k = Math.min(1, (year - DELTA_T_DRIFT_FROM) / (DELTA_T_LONG_TERM_YEAR - DELTA_T_DRIFT_FROM));
  return exact + (longTerm - exact) * k * k;
}

export function deltaT(jd) {
  const year = 2000 + (jd - J2000) / 365.25;
  if (jd < LEAP_SECONDS[0][0]) return deltaTBefore1972(year);
  // 查表：闰秒表是阶梯函数，取最后一个不晚于 jd 的值
  let taiUtc = LEAP_SECONDS[0][1];
  for (const [jdStart, v] of LEAP_SECONDS) {
    if (jd >= jdStart) taiUtc = v; else break;
  }
  const exact = 32.184 + taiUtc;
  return jd >= LEAP_SECONDS[LEAP_SECONDS.length - 1][0]
    ? deltaTAfterLeapTable(year, exact)
    : exact;
}

/** ΔT 的当前不确定度（秒），供 HUD / 验证脚本标注置信度用 */
export function deltaTUncertainty(jd) {
  const year = 2000 + (jd - J2000) / 365.25;
  if (jd < LEAP_SECONDS[0][0]) return 2.5;                    // 分段多项式：1–2 s 量级
  if (year <= DELTA_T_DRIFT_FROM) return 0.9;                 // |UT1−UTC| 的上界
  const k = Math.min(1, (year - DELTA_T_DRIFT_FROM) / (DELTA_T_LONG_TERM_YEAR - DELTA_T_DRIFT_FROM));
  return 0.9 + 150 * k * k;                                   // 远期纯属预测
}

/** UT 儒略日 → TT 儒略日 */
export function jdUTtoTT(jdUT) {
  return jdUT + deltaT(jdUT) / DAY_SECONDS;
}

/** J2000 起的儒略世纪数 */
export function centuriesTT(jdTT) {
  return (jdTT - J2000) / 36525;
}

/** 仿真时钟：以 TT 儒略日推进，支持倍率（含负）、暂停、回到现在 */
export class SimClock {
  constructor() {
    this._rate = 1;       // 当前倍率（平滑后的实际值）
    this._rateTarget = 1; // 目标倍率（UI 阶梯改这个，_rate 指数趋近）
    this.paused = false;
    this._wallMs = Date.now();
    this._lagSec = 0;     // 后台/睡眠积压的仿真秒（追赶池，快速放完而非瞬移）
    this.setNow();
  }

  /** 当前倍率。直接赋值 = 瞬时切换（测试/兼容路径），同时重置目标值 */
  get rate() { return this._rate; }
  set rate(v) { this._rate = v; this._rateTarget = v; }
  /** 目标倍率：UI 改这里，实际倍率平滑趋近 */
  get rateTarget() { return this._rateTarget; }
  set rateTarget(v) { this._rateTarget = v; }

  setNow() {
    this.jdTT = jdUTtoTT(dateToJD(new Date()));
    this._wallMs = Date.now();
    this._lagSec = 0;
  }

  /** 跳转到指定 TT 儒略日（书签/导览/课堂同步还原用） */
  set(jdTT) {
    this.jdTT = jdTT;
    this._wallMs = Date.now();
    this._lagSec = 0;
  }

  /**
   * 正常帧用 dtReal；倍率按指数趋近 rateTarget（τ≈0.12s，避免瞬间换向的生硬感）。
   * 若 wallElapsed 比 dtReal 多出 1 秒以上（tab 后台、系统睡眠恢复），差额进入追赶池，
   * 以 min(1000×, 当前倍率×2) 的速度快速放完——天体滑到正确时刻而非瞬移。
   */
  tick(dtReal) {
    const nowMs = Date.now();
    const k = 1 - Math.exp(-Math.max(dtReal, 0) / 0.12);
    this._rate += (this._rateTarget - this._rate) * k; // 直接写 _rate，避免 setter 重置目标
    if (!this.paused) {
      const wallElapsed = (nowMs - this._wallMs) / 1000;
      if (wallElapsed > dtReal + 1) {
        this._lagSec += Math.max(0, wallElapsed - dtReal) * this._rate;
      }
      let adv = dtReal * this._rate;
      if (this._lagSec !== 0) {
        const cap = dtReal * Math.max(1000, Math.abs(this._rate) * 2);
        const bleed = Math.abs(this._lagSec) > cap ? Math.sign(this._lagSec) * cap : this._lagSec;
        adv += bleed;
        this._lagSec -= bleed;
      }
      this.jdTT += adv / DAY_SECONDS;
    } else {
      this._lagSec = 0;
    }
    this._wallMs = nowMs;
    return this.jdTT;
  }

  /** 当前仿真时刻对应的 UTC Date（用于 HUD 显示） */
  toDate() {
    const jdUT = this.jdTT - deltaT(this.jdTT) / DAY_SECONDS;
    return jdToDate(jdUT);
  }

  /** 星历有效性提示：Standish 元素表标称 1800–2050 年 */
  inHighAccuracyRange() {
    const year = 2000 + (this.jdTT - J2000) / 365.25;
    return year >= 1800 && year <= 2050;
  }
}
