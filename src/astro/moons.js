// 卫星位置传播：基于 Horizons 拟合的密切轨道根数（moonsData.generated.js）。
// 返回相对母行星中心的黄道 J2000 坐标（km）。

import { elementsToEcliptic, KM_PER_AU } from './kepler.js';
import { MOON_ELEMENTS, MOON_EPOCH_JD } from './moonsData.generated.js';
import { MOON_PHYS } from './bodies.js';

export const MOON_IDS = Object.keys(MOON_ELEMENTS);

/** 卫星相对母行星位置（km，黄道 J2000） */
export function moonLocalPosition(id, jdTT) {
  const el = MOON_ELEMENTS[id];
  const M = el.M0Deg + el.nDegPerDay * (jdTT - MOON_EPOCH_JD);
  return elementsToEcliptic({
    aAU: el.aKm / KM_PER_AU,
    e: el.e,
    iDeg: el.iDeg,
    LDeg: el.periDeg + M,
    periDeg: el.periDeg,
    nodeDeg: el.nodeDeg,
  });
}

/** 卫星轨道法向（黄道 J2000 单位矢量），用于潮汐锁定姿态 */
export function moonOrbitNormal(id) {
  const el = MOON_ELEMENTS[id];
  const i = (el.iDeg * Math.PI) / 180;
  const O = (el.nodeDeg * Math.PI) / 180;
  return { x: Math.sin(i) * Math.sin(O), y: -Math.sin(i) * Math.cos(O), z: Math.cos(i) };
}

/** 卫星轨道线采样（相对母行星，km） */
export function moonOrbitPoints(id, n = 256) {
  const el = MOON_ELEMENTS[id];
  const pts = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const p = elementsToEcliptic({
      aAU: el.aKm / KM_PER_AU, e: el.e, iDeg: el.iDeg,
      LDeg: el.periDeg + (k / (n - 1)) * 360,
      periDeg: el.periDeg, nodeDeg: el.nodeDeg,
    });
    pts[k * 3] = p.x; pts[k * 3 + 1] = p.y; pts[k * 3 + 2] = p.z;
  }
  return pts;
}

export { MOON_PHYS };
