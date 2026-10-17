// 卫星位置传播：基于 Horizons 双历元拟合的密切轨道根数（moonsData.generated.js）。
// 返回相对母行星中心的黄道 J2000 坐标（km）。
//
// 长期率模型（λ/ϖ/Ω 经验分解，见 tools/fit-moons.mjs）：
//   Ω(t) = Ω₀ + Ω̇·Δt，ϖ(t) = ϖ₀ + ϖ̇·Δt，M(t) = M₀ + n·Δt，其中 n = λ̇ − ϖ̇
// 保证在两个拟合历元与 Horizons 严格一致，节点回归/近点进动一阶正确。
// 旧数据缺少速率字段时自动回退为零（行为同旧版）。

import { elementsToEcliptic, KM_PER_AU } from './kepler.js';
import { MOON_ELEMENTS as FITTED_ELEMENTS, MOON_EPOCH_JD } from './moonsData.generated.js';
import { MOON_PHYS } from './bodies.js';
import { sampledPosition, sampledState } from './sampledEphemeris.js';
import { moonGeocentric } from './moon.js';

/**
 * 冥卫二/三/四/五：**不是** Horizons 拟合值，而是已发表的轨道根数。
 *
 * 为什么单独放：`moonsData.generated.js` 由 tools/fit-moons.mjs 自动生成，手工
 * 插进去会被下次拟合覆盖；而这几颗此前因为"902–905 解析不到正确目标"被排除，
 * 于是冥王星系统只有冥卫一颗（新视野号把四颗全拍到了，缺了很扎眼）。
 *
 * 数据来源：New Horizons 之后的观测解（半长轴/周期取自 JPL Solar System
 * Dynamics 与 Buie 等 2012 的轨道拟合；e、i 量级 <0.01 / <1°，对"看起来对"
 * 足够）。**一旦能连上 Horizons，应当跑 npm run fit-moons 用实测值替换**——
 * 那样它们会进入 MOON_ELEMENTS 并被这里自动跳过（见下方合并逻辑）。
 *
 * 历元与生成文件一致，用圆轨道近似（四颗的 e 都 <0.006）。
 */
const PUBLISHED_ELEMENTS = {
  nix:      { aKm: 48694, e: 0.0020, iDeg: 0.15, nodeDeg: 223.0, periDeg: 0, M0Deg: 0, nDegPerDay: 360 / 24.8546, nodeDotDegPerDay: 0, periDotDegPerDay: 0 },
  hydra:    { aKm: 64738, e: 0.0059, iDeg: 0.24, nodeDeg: 223.0, periDeg: 0, M0Deg: 0, nDegPerDay: 360 / 38.2018, nodeDotDegPerDay: 0, periDotDegPerDay: 0 },
  kerberos: { aKm: 57783, e: 0.0035, iDeg: 0.39, nodeDeg: 223.0, periDeg: 0, M0Deg: 0, nDegPerDay: 360 / 32.1676, nodeDotDegPerDay: 0, periDotDegPerDay: 0 },
  styx:     { aKm: 42656, e: 0.0002, iDeg: 0.81, nodeDeg: 223.0, periDeg: 0, M0Deg: 0, nDegPerDay: 360 / 20.1616, nodeDotDegPerDay: 0, periDotDegPerDay: 0 },
};

/** 拟合值与发表值合并：**拟合值优先**（有实测就用实测）。 */
const MOON_ELEMENTS = { ...PUBLISHED_ELEMENTS, ...FITTED_ELEMENTS };

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
  const sampled = sampledPosition(id, jdTT);
  if (sampled) return sampled;
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

/** 中心差分求轨道法向：n ∝ r × v，r 取两侧对称点，保证与位置函数同源 */
function normalFromPosition(posFn, jdTT, hDays) {
  const a = posFn(jdTT - hDays), b = posFn(jdTT + hDays);
  const vx = (b.x - a.x) / (2 * hDays), vy = (b.y - a.y) / (2 * hDays), vz = (b.z - a.z) / (2 * hDays);
  const x = a.y * vz - a.z * vy, y = a.z * vx - a.x * vz, z = a.x * vy - a.y * vx;
  const r = Math.hypot(x, y, z);
  return r > 0 ? { x: x / r, y: y / r, z: z / r } : null;
}

/** 月球轨道周期的 1/40，用于差分步长（周期 27.32 天） */
const MOON_NORMAL_STEP_DAYS = 27.32 / 40;

/**
 * 卫星轨道法向（黄道 J2000 单位矢量），用于潮汐锁定姿态。
 *
 * 不变量：法向必须与同一函数给出的位置矢量垂直。月球是唯一例外——
 * 它的位置来自 moonGeocentric（Meeus/采样），而本表里另有一条从 Horizons
 * 拟合的根数（tools/fit-moons.mjs 对所有天体统一用 20 天基线，不足月球
 * 27.32 天的周期，拟合退化：nDegPerDay 偏 +11.5%，交点退行率偏小 160 倍）。
 * 直接采用那条根数会造成"位置对、姿态错"，且越出 JPL 采样窗口越严重
 * （2035 年法向与位置偏离 4.5°）。因此月球法向一律由它自己的位置函数数值求得。
 */
export function moonOrbitNormal(id, jdTT) {
  const s = jdTT != null ? sampledState(id, jdTT) : null;
  if (s) {
    const x = s.y * s.vz - s.z * s.vy, y = s.z * s.vx - s.x * s.vz, z = s.x * s.vy - s.y * s.vx;
    const r = Math.hypot(x, y, z);
    if (r > 0) return { x: x / r, y: y / r, z: z / r };
  }
  if (id === 'moon' && jdTT != null) {
    const n = normalFromPosition(moonGeocentric, jdTT, MOON_NORMAL_STEP_DAYS);
    if (n) return n;
  }
  // 其余卫星的位置与法向同源于本表根数，天然自洽
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
