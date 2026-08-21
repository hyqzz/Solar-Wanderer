// VSOP87 截断版行星星历：J2000 日心黄道坐标。
// 完整 VSOP87 数据达数 MB，这里截断振幅 < 0.001" 的项，保留约 50-100KB，
// 精度 < 0.1° vs JPL Horizons（-3000 到 +3000 年）。
//
// VSOP87 原始 L/B/R 序列在"瞬时平黄道"（dynamical ecliptic of date）中，
// 需施加岁差旋转才能转回 J2000 黄道系（与 planets.js 的 Standish 元素同框）。
// 这里用 IAU 1976 岁差角 + 三维旋转矩阵完成转换。
//
// 参考：
//   Francou, G., Berthier, M., 1998, "VSOP87 solutions"
//   Meeus, J., "Astronomical Algorithms", 2nd ed., Ch. 25/31

import { centuriesTT } from './time.js';
import { KM_PER_AU } from './kepler.js';

// ── VSOP87 截断数据（tools/fetch-vsop87.mjs 自动生成，astronomia 官方转录） ──
import { VSOP87_DATA } from './vsop87Data.js';

// 冥王星不在 VSOP87 中，pluto 键保持 null，运行时退回近似根数
const DATA = { ...VSOP87_DATA, pluto: null };

// ── 岁差旋转：瞬时平黄道 → J2000 平黄道 ───────────────────────────────
// VSOP87 的 L/B/R 在 dynamical ecliptic of date 中，
// 需经三维旋转转回 J2000 黄道系（与 planets.js 同框）。
// 方法：黄道(of date) → 赤道(of date) → 岁差 → 赤道(J2000) → 黄道(J2000)
// 岁差角用 IAU 1976（Liebe-Pitjeva），±3000 年误差 < 0.01°（远小于 0.1° 容差）。

const ASEC = Math.PI / (180 * 3600); // 角秒 → 弧度
const EPS0 = 23.43929111 * Math.PI / 180; // J2000 平黄赤交角

/** 3×3 行主序矩阵乘（v' = M·v 约定，与 rotation.js 的 Rx/Rz 同族） */
function mm3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const Rxm = (t) => [1, 0, 0, 0, Math.cos(t), Math.sin(t), 0, -Math.sin(t), Math.cos(t)];
const Rzm = (t) => [Math.cos(t), Math.sin(t), 0, -Math.sin(t), Math.cos(t), 0, 0, 0, 1];
// 注意：SOFA/IAU 的 Ry 与 Rx/Rz 符号族相反，不能用同一函数
const RymSOFA = (t) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];

/** 计算岁差旋转矩阵 (date → J2000)，返回 3×3 行主序数组 */
function precessionMatrix(T) {
  // IAU 1976 岁差角（角秒）
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ASEC;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ASEC;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ASEC;
  // 瞬时平黄赤交角
  const eps = EPS0 + (-46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T) * ASEC;

  // v_eclJ2000 = Rx(−ε0) · Rz(−z) · Ry(θ) · Rz(−ζ) · Rx(+ε) · v_eclDate
  const P = mm3(Rzm(-z), mm3(RymSOFA(theta), Rzm(-zeta)));
  return mm3(Rxm(-EPS0), mm3(P, Rxm(eps)));
}

// ── VSOP87 序列求值 ────────────────────────────────────────────────────
/** 求 L0 + L1·T + L2·T² + … ，每项 = Σ A·cos(B + C·T) */
function evalSeries(series, T) {
  let sum = 0;
  let tPow = 1;
  for (let n = 0; n < series.length; n++) {
    const terms = series[n];
    let s = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      s += t[0] * Math.cos(t[1] + t[2] * T);
    }
    sum += s * tPow;
    tPow *= T;
  }
  return sum;
}

/**
 * VSOP87 行星日心位置（黄道 J2000，km）。
 * @param {string} bodyId mercury|venus|earth|emb|mars|jupiter|saturn|uranus|neptune|pluto
 * @param {number} jdTT TT 儒略日
 * @returns {{x:number,y:number,z:number}} 日心黄道 J2000 坐标 (km)
 */
export function planetaryPositionVSOP(bodyId, jdTT) {
  const Tcy = centuriesTT(jdTT);
  // VSOP87 原始序列的时间单位是儒略千年（millennia），不是世纪：
  // 系数校验——地球 L1 = 6283.076 rad/千年（1000 周），26087.903 = 水星 rad/千年。
  const T = Tcy / 10;

  // 冥王星不在 VSOP87 中：退回近似（有限值保证）
  if (bodyId === 'pluto') {
    // 用 Standish 元素近似（与 planets.js 一致），避免引入循环依赖
    // 这里直接用简化开普勒计算
    return plutoApprox(jdTT);
  }

  const data = DATA[bodyId] || DATA[bodyId === 'emb' ? 'earth' : bodyId];
  if (!data) throw new Error(`VSOP87: unknown body "${bodyId}"`);

  // 瞬时平黄道系下的球坐标
  const L = evalSeries(data.L, T);
  const B = evalSeries(data.B, T);
  const R = evalSeries(data.R, T);

  // 球 → 直角（瞬时平黄道）
  const cosB = Math.cos(B);
  const x0 = R * cosB * Math.cos(L);
  const y0 = R * cosB * Math.sin(L);
  const z0 = R * Math.sin(B);

  // 岁差旋转 → J2000 黄道（IAU 1976 系数单位为儒略世纪，注意与序列的千年区分）
  // 注意方向：VSOP87D 给出 date 系坐标，要转到 J2000 需用 precessionMatrix 的转置
  const m = precessionMatrix(Tcy);
  const x = m[0] * x0 + m[3] * y0 + m[6] * z0;
  const y = m[1] * x0 + m[4] * y0 + m[7] * z0;
  const z = m[2] * x0 + m[5] * y0 + m[8] * z0;

  return { x: x * KM_PER_AU, y: y * KM_PER_AU, z: z * KM_PER_AU };
}

/** 冥王星近似位置（VSOP87 不含冥王星，用 Standish 元素兜底） */
function plutoApprox(jdTT) {
  // 与 planets.js 的 TABLE.pluto 一致，避免循环依赖直接内联
  const T = centuriesTT(jdTT);
  const aAU = 39.48211675 - 0.00031596 * T;
  const e = 0.24882730 + 0.00005170 * T;
  const iDeg = 17.14001206 + 0.00004818 * T;
  const LDeg = 238.92903833 + 145.20780515 * T;
  const periDeg = 224.06891629 - 0.04062942 * T;
  const nodeDeg = 110.30393684 - 0.01183482 * T;
  const DEG = Math.PI / 180;
  const omega = (periDeg - nodeDeg) * DEG;
  const M = (LDeg - periDeg) * DEG;
  // 牛顿迭代解开普勒方程
  let E = M;
  for (let k = 0; k < 20; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const xp = aAU * (Math.cos(E) - e);
  const yp = aAU * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(nodeDeg * DEG), sO = Math.sin(nodeDeg * DEG);
  const ci = Math.cos(iDeg * DEG), si = Math.sin(iDeg * DEG);
  const x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;
  return { x: x * KM_PER_AU, y: y * KM_PER_AU, z: z * KM_PER_AU };
}

/** VSOP87 是否支持该天体 */
export function vsop87Supported(bodyId) {
  return bodyId !== 'pluto' && DATA[bodyId] != null;
}
