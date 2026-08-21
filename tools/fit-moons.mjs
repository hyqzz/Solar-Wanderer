// 卫星轨道拟合：从 JPL Horizons 拉取各大卫星两个历元（相隔 20 天）的状态向量，
// 解算密切轨道根数并做经验长期率分解，固化为 src/astro/moonsData.generated.js。
//
// 分解原理（λ/ϖ/Ω 三分解）：
//   平黄经 λ = ϖ + M 对任何离心率都有定义，λ̇ 由两历元实际位置直接测量（含全部
//   摄动）；ϖ̇ 与 Ω̇ 由两组密切根数差分得到。运行时按
//     ϖ(t) = ϖ₀ + ϖ̇·Δt,  Ω(t) = Ω₀ + Ω̇·Δt,  M(t) = M₀ + (λ̇ − ϖ̇)·Δt
//   传播，则在两个历元都与 Horizons 严格一致，长期漂移为一阶正确。
//   近圆轨道（e < 0.01）ϖ 数值不稳定 → ϖ̇ 置 0，全部漂移并入 λ̇。

import { writeFileSync } from 'node:fs';
import { horizonsVectors } from './horizonsClient.mjs';
import { BODIES, MOON_PHYS } from '../src/astro/bodies.js';

const MOON_IDS = {
  moon: ['301', '500@399'],
  phobos: ['401', '500@499'], deimos: ['402', '500@499'],
  io: ['501', '500@599'], europa: ['502', '500@599'],
  ganymede: ['503', '500@599'], callisto: ['504', '500@599'],
  mimas: ['601', '500@699'], enceladus: ['602', '500@699'], tethys: ['603', '500@699'],
  dione: ['604', '500@699'], rhea: ['605', '500@699'], titan: ['606', '500@699'],
  iapetus: ['608', '500@699'],
  ariel: ['701', '500@799'], umbriel: ['702', '500@799'], titania: ['703', '500@799'],
  oberon: ['704', '500@799'], miranda: ['705', '500@799'],
  triton: ['801', '500@899'], charon: ['901', '500@999'],
};

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const RAD2DEG = 180 / Math.PI;

/** 状态向量 → 密切轨道根数（黄道 J2000） */
function stateToElements(r, v, gm) {
  const rMag = norm(r), vMag = norm(v);
  const h = cross(r, v);
  const hMag = norm(h);
  const a = 1 / (2 / rMag - (vMag * vMag) / gm);
  // 离心率矢量
  const vxh = cross(v, h);
  const eVec = [vxh[0] / gm - r[0] / rMag, vxh[1] / gm - r[1] / rMag, vxh[2] / gm - r[2] / rMag];
  const e = norm(eVec);
  const i = Math.acos(h[2] / hMag);
  // 升交点矢量 n = ẑ × h
  const nVec = [-h[1], h[0], 0];
  const nMag = norm(nVec) || 1e-12;
  let node = Math.acos(Math.max(-1, Math.min(1, nVec[0] / nMag)));
  if (nVec[1] < 0) node = 2 * Math.PI - node;
  // 近点幅角 ω
  let omega = Math.acos(Math.max(-1, Math.min(1, dot(nVec, eVec) / (nMag * (e || 1e-12)))));
  if (eVec[2] < 0) omega = 2 * Math.PI - omega;
  // 真近点角 ν
  let nu = Math.acos(Math.max(-1, Math.min(1, dot(eVec, r) / ((e || 1e-12) * rMag))));
  if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  // 偏近点角 E、平近点角 M
  const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu));
  const M = E - e * Math.sin(E);
  const nMotion = Math.sqrt(gm / (a * a * a)); // rad/s
  return {
    aKm: a, e,
    iDeg: i * RAD2DEG,
    nodeDeg: node * RAD2DEG,
    periDeg: ((node + omega) * RAD2DEG) % 360, // ϖ = Ω + ω
    M0Deg: ((M * RAD2DEG) % 360 + 360) % 360,
    nDegPerDay: nMotion * RAD2DEG * 86400,
  };
}

/** 用拟合根数预测 jd 时刻位置（与运行时 moons.js 同算法，内联避免循环依赖） */
function predict(el, dJd) {
  const DEG = Math.PI / 180;
  const M = (el.M0Deg + el.nDegPerDay * dJd) * DEG;
  let E = M;
  for (let k = 0; k < 30; k++) E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const xp = el.aKm * (Math.cos(E) - el.e);
  const yp = el.aKm * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const w = (el.periDeg - el.nodeDeg) * DEG, O = el.nodeDeg * DEG, i = el.iDeg * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

/** 角度差归一化到 (-180, 180] 度 */
const wrapDiffDeg = (d) => ((d % 360) + 540) % 360 - 180;

const now = new Date();
const FIT_SPAN_DAYS = 20;
const later = new Date(now.getTime() + FIT_SPAN_DAYS * 86400000);
const out = {};
let epochJd = null;

for (const [id, [cmd, center]] of Object.entries(MOON_IDS)) {
  const phys = MOON_PHYS[id];
  const parentGm = BODIES[phys.parent].gm + (phys.gm || 0);
  const { jdTDB, pos, vel } = await horizonsVectors(cmd, center, now, true);
  epochJd = jdTDB;
  const el = stateToElements(pos, vel, parentGm);

  // 第二历元：需要速度才能解算完整根数（节点/近点差分）
  const ref2 = await horizonsVectors(cmd, center, later, true);
  const dJd = ref2.jdTDB - jdTDB;
  const el2 = stateToElements(ref2.pos, ref2.vel, parentGm);

  // 经验长期率：λ̇ 用实际位置的有符号相位差测量（比根数差分更稳健）
  const pred = predict(el, dJd);
  const h = cross(pos, vel);
  const hMag = norm(h);
  const nHat = [h[0] / hMag, h[1] / hMag, h[2] / hMag];
  const cr = cross(pred, ref2.pos);
  const sinA = dot(cr, nHat) / (norm(pred) * norm(ref2.pos));
  const cosA = dot(pred, ref2.pos) / (norm(pred) * norm(ref2.pos));
  const lambdaDot = el.nDegPerDay + Math.atan2(sinA, Math.max(-1, Math.min(1, cosA))) * RAD2DEG / dJd;

  const nodeDot = wrapDiffDeg(el2.nodeDeg - el.nodeDeg) / dJd;
  // 近圆轨道 ϖ 由噪声主导 → ϖ̇ 置 0，漂移全部留在 λ̇（位置仍精确）
  const periDot = el.e >= 0.01 ? wrapDiffDeg(el2.periDeg - el.periDeg) / dJd : 0;

  // 运行时传播：M(t) = M0 + ṅ·Δt，其中 ṅ = λ̇ − ϖ̇，保证 λ(t) 与测量严格一致
  el.nDegPerDay = lambdaDot - periDot;
  el.nodeDotDegPerDay = nodeDot;
  el.periDotDegPerDay = periDot;

  out[id] = el;
  const periodDays = 360 / lambdaDot;
  console.log(
    `${id.padEnd(10)} a=${(el.aKm / 1000).toFixed(1).padStart(8)}千km  e=${el.e.toFixed(4)}  ` +
    `i=${el.iDeg.toFixed(2).padStart(7)}°  P=${periodDays.toFixed(4).padStart(9)}天  ` +
    `Ω̇=${nodeDot.toFixed(4).padStart(8)}°/天  ϖ̇=${periDot.toFixed(4).padStart(8)}°/天`
  );
}

const banner = `// 本文件由 tools/fit-moons.mjs 自动生成 — 请勿手改。
// 数据来源：JPL Horizons 状态向量（黄道 J2000，相对母行星中心），双历元（相隔 20 天）拟合。
// 生成时刻（历元）：${now.toISOString()}  JD(TDB)=${epochJd}
// 模型：密切根数 + 经验长期率（nodeDotDegPerDay=Ω̇，periDotDegPerDay=ϖ̇，
// nDegPerDay=λ̇−ϖ̇），长期漂移一阶正确；二阶以上摄动与共振仍随时间缓慢积累。
// 建议每季度重新运行 npm run fit-moons。
`;

writeFileSync(
  new URL('../src/astro/moonsData.generated.js', import.meta.url),
  banner + `export const MOON_EPOCH_JD = ${epochJd};\n` +
  `export const MOON_ELEMENTS = ${JSON.stringify(out, null, 2)};\n`
);
console.log('\n已写入 src/astro/moonsData.generated.js');
