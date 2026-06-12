// 星历精度验证：将本引擎的行星/月球位置与 JPL Horizons 官方数据对照。
// 用法: npm run verify  （可选参数: 日期, 如 node tools/verify-ephemeris.mjs 2026-06-10）

import { horizonsVectors } from './horizonsClient.mjs';
import { planetPosition, PLANETS } from '../src/astro/planets.js';
import { moonGeocentric } from '../src/astro/moon.js';

const HORIZONS_ID = {
  mercury: '199', venus: '299', earth: '399', mars: '499', jupiter: '599',
  saturn: '699', uranus: '799', neptune: '899', pluto: '999',
};

const date = process.argv[2] ? new Date(process.argv[2] + 'T12:00:00Z') : new Date();

function angleDeg(a, b) {
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b[0], b[1], b[2]);
  const dot = (a.x * b[0] + a.y * b[1] + a.z * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

console.log(`\n=== 星历验证 vs JPL Horizons @ ${date.toISOString()} ===\n`);
console.log('天体        日心黄经差(°)   距离差(%)    位置差(km)      判定(<0.1°)');

let allPass = true;
const results = [];

for (const name of PLANETS) {
  const ref = await horizonsVectors(HORIZONS_ID[name], '500@10', date, false);
  const ours = planetPosition(name, ref.jdTDB); // TDB≈TT（差<2ms）
  const dAng = angleDeg(ours, ref.pos);
  const rOurs = Math.hypot(ours.x, ours.y, ours.z);
  const rRef = Math.hypot(...ref.pos);
  const dDist = (Math.abs(rOurs - rRef) / rRef) * 100;
  const dPos = Math.hypot(ours.x - ref.pos[0], ours.y - ref.pos[1], ours.z - ref.pos[2]);
  const pass = dAng < 0.1;
  allPass &&= pass;
  results.push({ name, dAng, dDist, dPos, pass });
  console.log(
    `${name.padEnd(10)} ${dAng.toFixed(5).padStart(12)} ${dDist.toFixed(4).padStart(11)} ` +
    `${dPos.toExponential(2).padStart(12)}     ${pass ? '✅' : '❌'}`
  );
}

// 月球（地心，阈值放宽到 0.5°：截断级数理论精度 ~0.3°）
{
  const ref = await horizonsVectors('301', '500@399', date, false);
  const ours = moonGeocentric(ref.jdTDB);
  const dAng = angleDeg(ours, ref.pos);
  const rRef = Math.hypot(...ref.pos);
  const dDist = (Math.abs(Math.hypot(ours.x, ours.y, ours.z) - rRef) / rRef) * 100;
  const pass = dAng < 0.5;
  allPass &&= pass;
  results.push({ name: 'moon(geo)', dAng, dDist, pass });
  console.log(
    `${'moon(geo)'.padEnd(10)} ${dAng.toFixed(5).padStart(12)} ${dDist.toFixed(4).padStart(11)} ` +
    `${''.padStart(12)}     ${pass ? '✅' : '❌'} (阈值0.5°)`
  );
}

console.log(`\n总判定: ${allPass ? '✅ 全部通过' : '❌ 存在超差'}\n`);
process.exit(allPass ? 0 : 1);
