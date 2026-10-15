// 卫星食验证：木卫一每 1.769 天绕木星一周，会周期性走进木星影子里（Io 消失）。
// 用与着色器同源的遮蔽公式 + 真实星历，检查 Io 表面确实会出现接近全遮的时刻。
import { planetPosition } from '../src/astro/planets.js';
import { moonLocalPosition } from '../src/astro/moons.js';

const DEG = Math.PI / 180;
const SUN_R = 695700;
const norm = (v) => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
const s3 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** 与 planetMaterial.js 的 eclSh 同源 */
function obscuration(surf, occ, occR) {
  const toOcc = [occ[0] - surf[0], occ[1] - surf[1], occ[2] - surf[2]];
  const dOcc = Math.max(Math.hypot(...toOcc), 1);
  const nOcc = [toOcc[0] / dOcc, toOcc[1] / dOcc, toOcc[2] / dOcc];
  const toSun = [-surf[0], -surf[1], -surf[2]];
  const dSun = Math.hypot(...toSun);
  const nSun = norm(toSun);
  const aOcc = Math.asin(Math.min(1, occR / dOcc));
  const aSun = Math.asin(Math.min(1, SUN_R / dSun));
  const sep = Math.acos(Math.max(-1, Math.min(1, nOcc[0] * nSun[0] + nOcc[1] * nSun[1] + nOcc[2] * nSun[2])));
  const lo = Math.abs(aOcc - aSun), hi = aOcc + aSun;
  return 1 - s3(hi > lo ? (sep - lo) / (hi - lo) : (sep <= lo ? 0 : 1));
}

const JUP_R = 69911;
/** Io 表面上朝向木星的那一点（最容易被遮的位置） */
function ioFacingPoint(jd) {
  const j = planetPosition('jupiter', jd);
  const l = moonLocalPosition('io', jd);
  const n = norm([-l.x, -l.y, -l.z]);
  return [j.x + l.x + n[0] * 1821, j.y + l.y + n[1] * 1821, j.z + l.z + n[2] * 1821];
}

// 扫 3 天（≈1.7 个 Io 周期）
let best = 0, bestJd = 0;
const jd0 = 2461360.5;
for (let i = 0; i < 3 * 24 * 12; i++) {
  const jd = jd0 + i / (24 * 12);
  const j = planetPosition('jupiter', jd);
  const o = obscuration(ioFacingPoint(jd), [j.x, j.y, j.z], JUP_R);
  if (o > best) { best = o; bestJd = jd; }
}
console.log(`3 天内 Io 表面最强遮蔽 ${(best * 100).toFixed(1)}%（于 JD ${bestJd.toFixed(3)}）`);

// 对照：取一个 Io 明显在木星侧面的时刻，遮蔽应接近 0
let least = 1e9;
for (let i = 0; i < 3 * 24 * 12; i++) {
  const jd = jd0 + i / (24 * 12);
  const j = planetPosition('jupiter', jd);
  least = Math.min(least, obscuration(ioFacingPoint(jd), [j.x, j.y, j.z], JUP_R));
}
console.log(`同期最小遮蔽 ${(least * 100).toFixed(2)}%`);

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}  ${d}`); };
check('Io 会出现接近全遮的食时刻', best > 0.9, `${(best * 100).toFixed(1)}%`);
check('Io 也会出现完全无遮的时刻', least < 0.5, `${(least * 100).toFixed(2)}%`);
process.exitCode = fail ? 1 : 0;
if (fail) console.log(`\n${fail} 项失败`);
