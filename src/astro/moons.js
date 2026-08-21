// 卫星位置传播：基于 Horizons 双历元拟合的密切轨道根数（moonsData.generated.js）。
// 返回相对母行星中心的黄道 J2000 坐标（km）。
//
// 长期率模型（λ/ϖ/Ω 经验分解，见 tools/fit-moons.mjs）：
//   Ω(t) = Ω₀ + Ω̇·Δt，ϖ(t) = ϖ₀ + ϖ̇·Δt，M(t) = M₀ + n·Δt，其中 n = λ̇ − ϖ̇
// 保证在两个拟合历元与 Horizons 严格一致，节点回归/近点进动一阶正确。
// 旧数据缺少速率字段时自动回退为零（行为同旧版）。

import { elementsToEcliptic, KM_PER_AU } from './kepler.js';
import { MOON_ELEMENTS, MOON_EPOCH_JD } from './moonsData.generated.js';
import { MOON_PHYS } from './bodies.js';

export const MOON_IDS = Object.keys(MOON_ELEMENTS);

const RATES_CACHE = new Map();

/** 卫星经验长期率（deg/day）：{ node: Ω̇, peri: ϖ̇, mCorr: 0 }；字段缺失时为零 */
export function moonSecularRates(id) {
  if (RATES_CACHE.has(id)) return RATES_CACHE.get(id);
  const el = MOON_ELEMENTS[id];
  const rates = {
    node: el?.nodeDotDegPerDay ?? 0,
    peri: el?.periDotDegPerDay ?? 0,
    mCorr: 0, // λ̇ 的全部修正已含在拟合的 nDegPerDay 中，不可重复叠加
  };
  RATES_CACHE.set(id, rates);
  return rates;
}

/** 卫星相对母行星位置（km，黄道 J2000；含 J2 长期进动） */
export function moonLocalPosition(id, jdTT) {
  const el = MOON_ELEMENTS[id];
  const dt = jdTT - MOON_EPOCH_JD;
  const r = moonSecularRates(id);
  const M = el.M0Deg + (el.nDegPerDay + r.mCorr) * dt;
  const periDeg = el.periDeg + r.peri * dt;
  const nodeDeg = el.nodeDeg + r.node * dt;
  return elementsToEcliptic({
    aAU: el.aKm / KM_PER_AU,
    e: el.e,
    iDeg: el.iDeg,
    LDeg: periDeg + M,
    periDeg,
    nodeDeg,
  });
}

/** 卫星轨道法向（黄道 J2000 单位矢量），用于潮汐锁定姿态；传入 jdTT 时含 J2 节点进动 */
export function moonOrbitNormal(id, jdTT) {
  const el = MOON_ELEMENTS[id];
  const i = (el.iDeg * Math.PI) / 180;
  const nodeDeg = jdTT != null
    ? el.nodeDeg + moonSecularRates(id).node * (jdTT - MOON_EPOCH_JD)
    : el.nodeDeg;
  const O = (nodeDeg * Math.PI) / 180;
  return { x: Math.sin(i) * Math.sin(O), y: -Math.sin(i) * Math.cos(O), z: Math.cos(i) };
}

/** 卫星轨道线采样（相对母行星，km；传入 jdTT 时含 J2 长期进动） */
export function moonOrbitPoints(id, n = 256, jdTT) {
  const el = MOON_ELEMENTS[id];
  const dt = jdTT != null ? jdTT - MOON_EPOCH_JD : 0;
  const r = jdTT != null ? moonSecularRates(id) : { node: 0, peri: 0 };
  const periDeg = el.periDeg + r.peri * dt;
  const nodeDeg = el.nodeDeg + r.node * dt;
  const pts = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const p = elementsToEcliptic({
      aAU: el.aKm / KM_PER_AU, e: el.e, iDeg: el.iDeg,
      LDeg: periDeg + (k / (n - 1)) * 360,
      periDeg, nodeDeg,
    });
    pts[k * 3] = p.x; pts[k * 3 + 1] = p.y; pts[k * 3 + 2] = p.z;
  }
  return pts;
}

export { MOON_PHYS };
