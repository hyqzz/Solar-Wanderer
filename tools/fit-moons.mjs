// 卫星轨道拟合：从 JPL Horizons 拉取各大卫星 5 个历元（围绕当前时刻 ±240 天）的状态向量，
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

  // ── 扩充批次：木星内卫星与不规则卫星、土星中小组、天卫内侧、海卫内群、冥卫 ──
  // 编号是 NAIF 标准 ID（按各行星的发现顺序），父体用 500@<行星NAIF>。
  amalthea: ['505', '500@599'], thebe: ['514', '500@599'],
  metis: ['516', '500@599'], adrastea: ['515', '500@599'],
  hyperion: ['607', '500@699'], phoebe: ['609', '500@699'],
  janus: ['610', '500@699'], epimetheus: ['611', '500@699'],
  prometheus: ['616', '500@699'], pandora: ['617', '500@699'], pan: ['618', '500@699'],
  // 天王星内侧小卫星的 NAIF 编号是**由内向外**排的（与"按发现顺序"的直觉相反）：
  // 706=Cordelia(最内) … 715=Puck(最外)。第一版按发现顺序猜成 706=Puck，拟合出的 a
  // 恰好等于 9 个编号之外那颗的真实轨道——是数据自己把正确映射说清楚的。
  cordelia: ['706', '500@799'], ophelia: ['707', '500@799'], bianca: ['708', '500@799'],
  cressida: ['709', '500@799'], desdemona: ['710', '500@799'], juliet: ['711', '500@799'],
  portia: ['712', '500@799'], rosalind: ['713', '500@799'], belinda: ['714', '500@799'],
  puck: ['715', '500@799'],
  nereid: ['802', '500@899'], naiad: ['803', '500@899'], thalassa: ['804', '500@899'],
  despina: ['805', '500@899'], galatea: ['806', '500@899'], larissa: ['807', '500@899'],
  proteus: ['808', '500@899'],
  // 冥卫二/三/四/五 暂不纳入：902–905 在 Horizons 里解析不到正确目标
  // （拟合出的 a 与实测差 78%–209%，且与自身拟合周期都不满足开普勒关系）。
  // 编号需逐个核对后再补；宁可少四颗，也不能把错轨道当真的发。
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

/**
 * 渐进解缠绕：按"离参考历元由近及远"的顺序逐点解缠绕，每解一点就用已确定的
 * 点重新最小二乘估计速率，用于下一个更远点的参考值。
 *
 * 为什么不能一次性顺序解缠绕：角量的模糊度是 360°，相邻采样间隔 Δt 越大，
 * 允许的速率猜测误差 (180/Δt) 越小。Mimas 的 λ̇≈383°/天，而密切平均运动
 * n≈381.4°/天，相差 1.6°/天；在 120 天间隔下这已造成 192° 的偏差 > 180°，
 * 于是解到错误的 360° 分支上（表现为半年后相位差 176°）。
 * 先解近点把速率精度提高两个量级，再解远点，即无此风险。
 */
function unwrapProgressive(values, jds, refIdx, rateGuess) {
  const n = values.length;
  const out = new Array(n);
  out[refIdx] = values[refIdx];
  const order = [...Array(n).keys()]
    .filter((i) => i !== refIdx)
    .sort((a, b) => Math.abs(jds[a] - jds[refIdx]) - Math.abs(jds[b] - jds[refIdx]));
  const xs = [0], ys = [values[refIdx]];
  let rate = rateGuess;
  for (const i of order) {
    const dt = jds[i] - jds[refIdx];
    const ref = values[refIdx] + rate * dt;
    out[i] = values[i] + 360 * Math.round((ref - values[i]) / 360);
    xs.push(dt); ys.push(out[i]);
    if (xs.length >= 2) [, rate] = linfit(xs, ys);   // 逐步精化
  }
  return out;
}

/** 最小二乘直线拟合 y = b + m·x，返回 [b, m] */
function linfit(xs, ys) {
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0), sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const den = n * sxx - sx * sx;
  const m = den !== 0 ? (n * sxy - sx * sy) / den : 0;
  return [(sy - m * sx) / n, m];
}

const now = new Date();
// 拟合历元：围绕 now 对称取 5 个采样点。
//
// 为什么不是双历元差分：卫星的解析模型是"密切根数 + 线性长期率"，其误差主要由
// 平均运动的微小偏差在长时间上累积的相位误差主导。双历元差分的 λ̇ 精度受限于
// 两点差分，实测离历元 180 天后最差达 3.8°（Mimas）。改成 5 历元最小二乘后，
// 同一跨度内的相位误差显著下降。
const FIT_OFFSETS_DAYS = [-240, -120, -10, 0, 10, 120, 240];
const out = {};
let epochJd = null;

const rejected = [];
for (const [id, [cmd, center]] of Object.entries(MOON_IDS)) {
  const phys = MOON_PHYS[id];
  const parentGm = BODIES[phys.parent].gm + (phys.gm || 0);

  const samples = [];
  for (const off of FIT_OFFSETS_DAYS) {
    const at = new Date(now.getTime() + off * 86400000);
    const r = await horizonsVectors(cmd, center, at, true);
    samples.push({ jd: r.jdTDB, el: stateToElements(r.pos, r.vel, parentGm) });
  }
  const refIdx = FIT_OFFSETS_DAYS.indexOf(0);
  const ref = samples[refIdx];
  epochJd = ref.jd;
  const el = { ...ref.el };

  const jds = samples.map((s) => s.jd);
  const relJd = jds.map((j) => j - ref.jd);
  const periodDays0 = 360 / el.nDegPerDay;

  // λ = ϖ + M（平黄经），对任何离心率都有定义
  const lam = samples.map((s) => ((s.el.periDeg + s.el.M0Deg) % 360 + 360) % 360);
  const node = samples.map((s) => ((s.el.nodeDeg % 360) + 360) % 360);
  const peri = samples.map((s) => ((s.el.periDeg % 360) + 360) % 360);

  // 回归只用来定速率，历元根数一律取历元采样值本身。
  // 原因：部分卫星的 Ω 在黄道坐标下是"绕母星极轴进动的投影"，表现为周期性振荡
  // 而非单调漂移（Mimas 的 Ω 在 ±5° 内振荡、周期约 360 天）。此时回归截距会
  // 偏离历元真值数度，若拿截距当历元值，模型在历元处就已经错了。
  const lamU = unwrapProgressive(lam, jds, refIdx, el.nDegPerDay);
  const [, lamDot] = linfit(relJd, lamU);

  const nodeU = unwrapProgressive(node, jds, refIdx, 0);
  const [, nodeDot] = linfit(relJd, nodeU);

  // 近圆轨道 ϖ 由噪声主导 → ϖ̇ 置 0，漂移全部并入 λ̇（位置仍然精确）
  let periDot = 0;
  if (el.e >= 0.01) {
    const periU = unwrapProgressive(peri, jds, refIdx, 0);
    [, periDot] = linfit(relJd, periU);
  }

  const nodeRef = node[refIdx], periRef = peri[refIdx], lamRef = lamU[refIdx];
  el.nodeDeg = nodeRef;
  el.periDeg = periRef;
  el.M0Deg = ((lamRef - periRef) % 360 + 360) % 360;
  el.nDegPerDay = lamDot - periDot;   // 运行时 M(t)=M0+n·Δt，使 λ(t) 与拟合严格一致
  el.nodeDotDegPerDay = nodeDot;
  el.periDotDegPerDay = periDot;

  // ── 对实测半长轴校验 ────────────────────────────────────────────────────
  // 上面那个"周期估计误差"只是**自洽性**检查（拟合出的周期 vs 同一批数据算出的
  // 周期），它小并不代表对。必须拿实测半长轴比：拟合跑偏时它会立刻暴露——
  // 实测中 Cordelia 拟合出 717 万 km（真实 4.98 万 km）、冥卫四颗全偏 60% 以上，
  // 而自洽性误差都小于 1%。不合格的**不写入**，宁可少几颗也不能把错轨道当真的发。
  const REF_A = {
    amalthea: 181400, thebe: 221900, metis: 128000, adrastea: 129000,
    hyperion: 1500933, phoebe: 12947779, janus: 151460, epimetheus: 151410,
    prometheus: 139380, pandora: 141720, pan: 133580,
    puck: 86004, portia: 66100, juliet: 64360, ophelia: 53764, cordelia: 49770,
    bianca: 59165, cressida: 61780, desdemona: 62680, rosalind: 69940, belinda: 75260,
    nereid: 5513800, naiad: 48227, thalassa: 50075, despina: 52526,
    galatea: 61953, larissa: 73548, proteus: 117647,
    nix: 48694, hydra: 64738, kerberos: 57783, styx: 42656,
  };
  // 不规则卫星的实测 a 本身有较大离散（受太阳摄动），容差放宽
  const TOL = { phoebe: 0.25, nereid: 0.15, hyperion: 0.10 };
  const refA = REF_A[id];
  const dev = refA ? Math.abs(el.aKm - refA) / refA : 0;
  const tol = TOL[id] ?? 0.05;
  const ok = !refA || dev <= tol;
  console.log(
    `${ok ? '✓' : '✗'} ${id.padEnd(10)} a=${(el.aKm / 1000).toFixed(1).padStart(9)}千km  ` +
    (refA ? `(实测 ${(refA / 1000).toFixed(1)}千km，偏差 ${(dev * 100).toFixed(1)}%)  ` : '(无实测基准) ') +
    `e=${el.e.toFixed(4)}  i=${el.iDeg.toFixed(2).padStart(7)}°  P=${(360 / lamDot).toFixed(4).padStart(9)}天`
  );
  if (ok) out[id] = el;
  else rejected.push(`${id}(偏差 ${(dev * 100).toFixed(1)}%)`);
}

const banner = `// 本文件由 tools/fit-moons.mjs 自动生成 — 请勿手改。
// 数据来源：JPL Horizons 状态向量（黄道 J2000，相对母行星中心），5 历元最小二乘拟合（±240 天）。
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
if (rejected.length) {
  console.log(`\n未写入（对不上实测半长轴）：${rejected.join('  ')}`);
  console.log('  这些卫星的天体编号在 Horizons 里可能解析成了别的目标，需逐个核对。');
}
console.log(`已写入 ${Object.keys(out).length} 颗卫星`);
