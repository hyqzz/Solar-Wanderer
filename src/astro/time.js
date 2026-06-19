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
 * 2017 年起闰秒冻结：TT − UTC = 32.184 + 37 = 69.184s（精确值，直到下一次闰秒）。
 * 2017 年前使用 Espenak & Meeus 多项式近似（历史回溯模式，游戏精度足够）。
 */
export function deltaT(jd) {
  const year = 2000 + (jd - J2000) / 365.25;
  if (year >= 2017) return 69.184;
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
