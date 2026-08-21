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
 * ΔT = TT − UTC（秒）。
 * 1972–2017：完整闰秒表（TAI−UTC 逐年精确值 + 32.184s 常数差）；
 * 1972 前：Espenak & Meeus 多项式近似（历史回溯）；
 * 2017 后：TT − UTC = 69.184s（截至 2026-08 无新闰秒；下次闰秒公告后需更新表尾）。
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

export function deltaT(jd) {
  if (jd >= LEAP_SECONDS[0][0]) {
    // 查表：闰秒表是阶梯函数，取最后一个不晚于 jd 的值
    let taiUtc = LEAP_SECONDS[0][1];
    for (const [jdStart, v] of LEAP_SECONDS) {
      if (jd >= jdStart) taiUtc = v; else break;
    }
    return 32.184 + taiUtc;
  }
  const year = 2000 + (jd - J2000) / 365.25;
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
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
    this.rate = 1; // 仿真秒 / 真实秒
    this.paused = false;
    this._wallMs = Date.now();
    this.setNow();
  }

  setNow() {
    this.jdTT = jdUTtoTT(dateToJD(new Date()));
    this._wallMs = Date.now();
  }

  /** 跳转到指定 TT 儒略日（书签/导览/课堂同步还原用） */
  set(jdTT) {
    this.jdTT = jdTT;
    this._wallMs = Date.now();
  }

  /**
   * 正常帧用 dtReal；若 wallElapsed 比 dtReal 多出 1 秒以上（tab 后台、系统睡眠/休眠恢复），
   * 则用完整挂钟经过时间追赶，确保左上角仿真时刻始终与真实流逝时间严格同步。
   */
  tick(dtReal) {
    const nowMs = Date.now();
    if (!this.paused) {
      const wallElapsed = (nowMs - this._wallMs) / 1000;
      const elapsed = wallElapsed > dtReal + 1 ? wallElapsed : dtReal;
      this.jdTT += (elapsed * this.rate) / DAY_SECONDS;
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
