// 日食遮蔽验证：用与着色器相同的公式 + 真实星历，算地球上"月下点"处的太阳遮蔽比例。
//
// 2026-08-12 是一次真实的日全食（冰岛、西班牙可见），落在星历窗口内。
// 判据：极大时刻月下点的遮蔽比例应接近 1（全食）；无食日期应接近 0。
import { planetPosition } from '../src/astro/planets.js';
import { moonGeocentric } from '../src/astro/moon.js';

const DEG = Math.PI / 180;
const SUN_R = 695700;
const norm = (v) => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };

/** 与 planetMaterial.js 中 eclSh 同源的遮蔽比例 */
function obscuration(jd, surfEcl) {
  const e = planetPosition('earth', jd);
  const mg = moonGeocentric(jd);
  const moon = [e.x + mg.x, e.y + mg.y, e.z + mg.z];
  // 片元位置（日心黄道）→ 月球方向与太阳方向
  const toOcc = [moon[0] - surfEcl[0], moon[1] - surfEcl[1], moon[2] - surfEcl[2]];
  const dOcc = Math.hypot(...toOcc);
  const nOcc = norm(toOcc);
  const toSun = [-surfEcl[0], -surfEcl[1], -surfEcl[2]];
  const dSun = Math.hypot(...toSun);
  const nSun = norm(toSun);
  const aOcc = Math.asin(Math.min(1, 1737.4 / dOcc));
  const aSun = Math.asin(Math.min(1, SUN_R / dSun));
  const sep = Math.acos(Math.max(-1, Math.min(1, nOcc[0] * nSun[0] + nOcc[1] * nSun[1] + nOcc[2] * nSun[2])));
  const s = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  // 与着色器同源：cover = 1 − smoothstep(aSun−aOcc, aSun+aOcc, sep)
  const lo = aSun - aOcc, hi = aSun + aOcc;
  return 1 - s(hi > lo ? (sep - lo) / (hi - lo) : (sep <= lo ? 0 : 1));
}

/**
 * 影轴与地表的交点（本影中心）。
 * 注意不能用"地心月下点"：从地表看月球有约 1° 的视差（地球半径/地月距离），
 * 全食点因此偏离地心月下点最多约 1°，而日面角半径才 0.26°——用错点会得出"无食"。
 */
function umbraCenter(jd) {
  const e = planetPosition('earth', jd);
  const mg = moonGeocentric(jd);
  const sun = { x: -e.x, y: -e.y, z: -e.z };          // 太阳相对地球
  const moon = { x: mg.x, y: mg.y, z: mg.z };          // 月球相对地球
  const d = norm([moon.x - sun.x, moon.y - sun.y, moon.z - sun.z]);   // 太阳 → 月球
  // 求 (moon + t d) 与半径 6371 球面的交点（取近侧）
  const R = 6371;
  const b = moon.x * d[0] + moon.y * d[1] + moon.z * d[2];
  const c = moon.x ** 2 + moon.y ** 2 + moon.z ** 2 - R * R;
  const disc = b * b - c;
  if (disc < 0) return null;   // 影轴未击中地表 → 地表任何一点都无食
  const t = -b - Math.sqrt(disc);
  return [e.x + moon.x + d[0] * t, e.y + moon.y + d[1] * t, e.z + moon.z + d[2] * t];
}

function maxObscuration(jd) {
  const c = umbraCenter(jd);
  return c ? obscuration(jd, c) : 0;   // 影轴未击中地球 = 无食
}

// 日食极大约在 2026-08-12 17:46 UTC
const jdMax = Date.parse('2026-08-12T17:46:00Z') / 86400000 + 2440587.5 + 69.184 / 86400;
let best = 0, bestJd = 0;
for (let m = -360; m <= 360; m += 5) {          // ±6 小时范围内细扫
  const jd = jdMax + m / 1440;
  const o = maxObscuration(jd);
  if (o > best) { best = o; bestJd = jd; }
}
console.log(`2026-08-12 日食：最强遮蔽 ${(best * 100).toFixed(1)}%  于 JD ${bestJd.toFixed(4)}`);
// 对照：半个月后的无食日期
const noEcl = maxObscuration(Date.parse('2026-08-27T12:00:00Z') / 86400000 + 2440587.5 + 69.184 / 86400);
console.log(`2026-08-27（无食）：最强遮蔽 ${(noEcl * 100).toFixed(2)}%`);

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}  ${d}`); };
check('真实日全食日出现接近全遮', best > 0.9, `${(best * 100).toFixed(1)}%`);
check('无食日期遮蔽接近 0（不会误报）', noEcl < 0.35, `${(noEcl * 100).toFixed(2)}%`);
process.exitCode = fail ? 1 : 0;
if (fail) console.log(`\n${fail} 项失败`);
