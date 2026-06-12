// 月球地心位置：天文年历低精度级数（截断 ELP2000 主项），精度约 0.2–0.3°。
// 原式给出瞬时平黄道坐标，这里减去岁差总进动以转回 J2000 黄道系（与行星同框）。

import { DEG } from './kepler.js';
import { centuriesTT } from './time.js';

const EARTH_RADIUS_KM = 6378.14;
/** 黄经总岁差（度/儒略世纪） */
const PRECESSION_DEG_PER_CENTURY = 1.3970;

const sinD = (d) => Math.sin(d * DEG);
const cosD = (d) => Math.cos(d * DEG);

/**
 * 月球地心黄道 J2000 坐标（km）。
 */
export function moonGeocentric(jdTT) {
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
