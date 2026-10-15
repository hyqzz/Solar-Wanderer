// 月球地心位置：
// - moonGeocentric: Meeus 60 项黄经/距离 + 60 项纬度级数，实时入口。
// - moonGeocentricELP2000: 保留原 API 名称；同一完整 Meeus 实现。
// 原式给出瞬时平黄道坐标，这里减去岁差总进动以转回 J2000 黄道系（与行星同框）。

import { DEG } from './kepler.js';
import { centuriesTT } from './time.js';
import { LUNAR_LR, LUNAR_B } from './moonTerms.js';
import { sampledPosition } from './sampledEphemeris.js';

const EARTH_RADIUS_KM = 6378.14;
/** 黄经总岁差（度/儒略世纪） */
const PRECESSION_DEG_PER_CENTURY = 1.3970;

const sinD = (d) => Math.sin(d * DEG);
const cosD = (d) => Math.cos(d * DEG);

/**
 * 月球地心黄道 J2000 坐标（km）。截断 ELP2000 主项，精度约 0.2–0.3°。
 * 仅供低端设备快速路径备用；主入口 moonGeocentric 已切换为完整截断版。
 */
export function moonGeocentricFast(jdTT) {
  const T = centuriesTT(jdTT);

  // 黄经（度，瞬时平黄道）
  let lambda =
    218.32 + 481267.881 * T +
    6.29 * sinD(135.0 + 477198.87 * T) -
    1.27 * sinD(259.3 - 413335.36 * T) +
    0.66 * sinD(235.7 + 890534.22 * T) +
    0.21 * sinD(269.9 + 954397.74 * T) -
    0.19 * sinD(357.5 + 35999.05 * T) -
    0.11 * sinD(186.5 + 966404.03 * T);

  // 黄纬（度）
  const beta =
    5.13 * sinD(93.3 + 483202.02 * T) +
    0.28 * sinD(228.2 + 960400.89 * T) -
    0.28 * sinD(318.3 + 6003.15 * T) -
    0.17 * sinD(217.6 - 407332.21 * T);

  // 赤道地平视差（度）→ 距离
  const parallax =
    0.9508 +
    0.0518 * cosD(135.0 + 477198.87 * T) +
    0.0095 * cosD(259.3 - 413335.36 * T) +
    0.0078 * cosD(235.7 + 890534.22 * T) +
    0.0028 * cosD(269.9 + 954397.74 * T);
  const r = EARTH_RADIUS_KM / sinD(parallax);

  // 转回 J2000 黄道
  lambda -= PRECESSION_DEG_PER_CENTURY * T;

  const cl = cosD(lambda), sl = sinD(lambda);
  const cb = cosD(beta), sb = sinD(beta);
  return { x: r * cb * cl, y: r * cb * sl, z: r * sb };
}

// Meeus Chapter 47: paired longitude/range coefficients avoid independent table drift.
// Include Earth eccentricity factors and additive terms, not just dominant sinusoids.
export function moonGeocentricELP2000(jdTT) {
  const T = centuriesTT(jdTT), T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
  const L = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  let l = 3958 * sinD(A1) + 1962 * sinD(L - F) + 318 * sinD(A2);
  let b = -2235 * sinD(L) + 382 * sinD(A3) + 175 * sinD(A1 - F)
    + 175 * sinD(A1 + F) + 127 * sinD(L - Mp) - 115 * sinD(L + Mp);
  let range = 0;
  for (const [d, m, mp, f, sl, sr] of LUNAR_LR) {
    const a = d * D + m * M + mp * Mp + f * F;
    const e = Math.pow(E, Math.abs(m));
    l += sl * e * sinD(a);
    range += sr * e * cosD(a);
  }
  for (const [d, m, mp, f, sb] of LUNAR_B) {
    b += sb * Math.pow(E, Math.abs(m)) * sinD(d * D + m * M + mp * Mp + f * F);
  }
  const lon = L + l * 1e-6 - PRECESSION_DEG_PER_CENTURY * T;
  const lat = b * 1e-6, r = 385000.56 + range * 1e-3;
  return { x: r * cosD(lat) * cosD(lon), y: r * cosD(lat) * sinD(lon), z: r * sinD(lat) };
}

/** Geocentric ecliptic J2000, km; same accurate path on Low and High hardware. */
export function moonGeocentric(jdTT) {
  return sampledPosition('moon', jdTT) ?? moonGeocentricELP2000(jdTT);
}
