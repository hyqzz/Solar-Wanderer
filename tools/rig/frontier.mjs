// 真实度前沿报告：把"离表面多近才会看出是假的"变成一个可复算的数字。
//
//   D_res = 表面采样间距 ÷ 观察者角分辨率阈值
//
// 观察者比 D_res 更近时，画面在物理上就有能力暴露伪造（贴图糊了 / 地形没有细节）。
// 人眼阈值取 1 角分（1/3438 rad）；4K 显示器在 60 cm 处约 1.1 角分，与之一致。
//
// 输出 tools/rig/frontier.json（供 CI 比对基线）+ 控制台表格。
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { demConfig, globalPixelWidth } from './dem.mjs';

const ROOT = new URL('../../', import.meta.url);
const ARCMIN = 1 / 3438;

/** 读 PNG / JPEG 的像素尺寸（够用即可，不引入依赖） */
function imageSize(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const marker = b[p + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: b.readUInt16BE(p + 5), w: b.readUInt16BE(p + 7) };
      }
      p += 2 + b.readUInt16BE(p + 2);
    }
  }
  return null;
}

const texDir = fileURLToPath(new URL('public/textures/', ROOT));
const textures = {};
for (const f of readdirSync(texDir)) {
  if (!/\.(jpg|png)$/.test(f)) continue;
  const s = imageSize(texDir + f);
  if (s) textures[f] = s;
}

/** 天体表：id → { 名称, 半径 km, 贴图文件 }。半径取自 src/astro/bodies.js 的权威值。 */
const { BODIES, MOON_PHYS } = await import(new URL('src/astro/bodies.js', ROOT));
const rows = [];
const push = (id, nameZh, radiusKm, tex) => {
  const t = tex ? textures[tex] : null;
  rows.push({
    id, nameZh, radiusKm, texture: tex ?? null,
    texturePx: t ? t.w : null,
    circumferenceKm: 2 * Math.PI * radiusKm,
  });
};
for (const [id, b] of Object.entries(BODIES)) push(id, b.nameZh ?? id, b.radiusKm, b.textures?.map);
for (const [id, p] of Object.entries(MOON_PHYS)) {
  if (rows.some((r) => r.id === id)) continue;
  push(id, p.nameZh ?? id, p.radiusKm, p.textures?.map);
}

for (const r of rows) {
  r.texKmPerPx = r.texturePx ? r.circumferenceKm / r.texturePx : null;
  r.texDresKm = r.texKmPerPx ? r.texKmPerPx / ARCMIN : null;
  const cfg = demConfig(r.id);
  r.demSource = cfg ? cfg.name ?? null : null;
  r.demMaxLevel = cfg ? cfg.maxLevel : null;
  if (cfg) {
    const px = globalPixelWidth(r.id, cfg.maxLevel);
    // 经度方向是全球最粗的一轴（每像素 360/n 度），保守取它
    r.demKmPerPx = r.circumferenceKm / px;
    r.demDresKm = r.demKmPerPx / ARCMIN;
    r.demGlobalPx = px;
  } else { r.demKmPerPx = null; r.demDresKm = null; r.demGlobalPx = null; }
  r.limitingDresKm = Math.max(r.texDresKm ?? 0, r.demDresKm ?? 0) || r.texDresKm;
}

const withTex = rows.filter((r) => r.texturePx);
const missingTex = rows.filter((r) => !r.texturePx);
const withDem = rows.filter((r) => r.demDresKm);

writeFileSync(fileURLToPath(new URL('tools/rig/frontier.json', ROOT)),
  JSON.stringify({ arcminThreshold: 1, generated: new Date().toISOString(), bodies: rows }, null, 2) + '\n');

const km = (v) => v === null ? '—' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(1);
console.log('真实度前沿（D_res = 表面采样间距 ÷ 1 角分；单位 km，越小越好）\n');
console.log('天体'.padEnd(12) + '半径'.padStart(8) + '贴图px'.padStart(9) + '贴图D_res'.padStart(11)
  + 'DEM层'.padStart(7) + 'DEM D_res'.padStart(11) + '   决定项');
for (const r of rows.sort((a, b) => (b.limitingDresKm ?? 0) - (a.limitingDresKm ?? 0))) {
  const lim = (r.demDresKm ?? 0) > (r.texDresKm ?? 0) ? 'DEM' : '贴图';
  console.log(r.nameZh.padEnd(12) + km(r.radiusKm).padStart(8)
    + String(r.texturePx ?? '—').padStart(9) + km(r.texDresKm).padStart(11)
    + String(r.demMaxLevel ?? '—').padStart(7) + km(r.demDresKm).padStart(11) + '   ' + lim);
}
console.log(`\n有贴图 ${withTex.length}/${rows.length} 体；有真实 DEM ${withDem.length} 体`);
if (missingTex.length) console.log('缺贴图：' + missingTex.map((r) => r.nameZh).join('、'));
console.log('已写出 tools/rig/frontier.json');
