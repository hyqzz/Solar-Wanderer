// 抓取"此刻真实的云"：NASA GIBS 的 MODIS 云量产品 → 地球云层贴图。
//
// ── 为什么走 WMS 而不是 WMTS 瓦片 ─────────────────────────────────────────
// GIBS 的 2km 矩阵不是 2 的幂（z=0 是 2×1、z=1 是 3×2、z=2 是 5×3…），
// 拼一张全球图要处理非对齐网格。而 GIBS 同时提供 **WMS** 端点，一次请求就能拿到
// 任意分辨率的整幅全球等距圆柱图（实测 8192×4096 返回 200）。拼接整个省掉。
//
// ── 颜色 → 数值 ──────────────────────────────────────────────────────────
// WMS 返回的是**调色板渲染**（色带：紫→红），不是数值本身。调色板取自同一天的
// 一张 z=0 WMTS 瓦片（PLTE 就是权威的颜色↔索引表），用它对 WMS 图的颜色反查索引。
// 实测 WMS 图的颜色 100% 能在 PLTE 里查到。
//
// **索引即云量百分数**（0=晴、100=满云、alpha=0 为无观测）。三条独立证据：
//   ① 地理检验：撒哈拉 1–9、阿拉伯 1、亚马逊 101、印尼 101；
//   ② 全球有效像元索引均值 71.1，实测全球平均云量约 67；
//   ③ 索引>50 的像元占 70%，与"地球约七成被云覆盖"相符。
//
// ── 缺口 ────────────────────────────────────────────────────────────────
// 单日产品有轨道缝（实测约 4% 无观测）。用前几天中**最近一个有观测的日子**逐像元补齐，
// 而不是拿晴空顶上——否则天上会出现规则的晴空斜条。
//
// 用法：node tools/fetch-clouds.mjs [--date=YYYY-MM-DD] [--days=3] [--size=8192x4096]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePng } from './rig/dem.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  return m ? [m[1], m[2] || true] : [a, true];
}));
const DAYS = Number(args.days ?? 3);
const [OW, OH] = String(args.size ?? '8192x4096').split('x').map(Number);
const BASE = 'https://gibs.earthdata.nasa.gov';
const LAYER = 'MODIS_Terra_Cloud_Fraction_Day';

const iso = (d) => d.toISOString().slice(0, 10);
/** 默认取"昨天 UTC"：当天的产品还在滚动合成，取昨天最稳 */
const target = args.date ? String(args.date) : iso(new Date(Date.now() - 86400e3));

async function grab(url, what) {
  const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error(`${what} → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const wmsUrl = (date) => `${BASE}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap`
  + `&VERSION=1.1.1&LAYERS=${LAYER}&STYLES=&SRS=EPSG:4326`
  + `&BBOX=-180,-90,180,90&WIDTH=${OW}&HEIGHT=${OH}&FORMAT=image/png&TIME=${date}`;
// z=0 只要一块瓦片就能取到 PLTE（2×1 块，取 x=0 即可）
const tileUrl = (date) => `${BASE}/wmts/epsg4326/best/${LAYER}/default/${date}/2km/0/0/0.png`;

async function paletteFor(date) {
  const t = decodePng(await grab(tileUrl(date), `PLTE ${date}`));
  if (!t.palette) throw new Error(`${date} 的瓦片不是调色板 PNG`);
  const map = new Map();
  for (let i = 0; i < 256; i++) {
    const k = (t.palette[i * 3] << 16) | (t.palette[i * 3 + 1] << 8) | t.palette[i * 3 + 2];
    if (!map.has(k)) map.set(k, i);
  }
  return map;
}

/** 取一天：返回 { frac: Uint8Array, valid: Uint8Array } */
async function fetchDay(date) {
  const [png, pal] = await Promise.all([grab(wmsUrl(date), `云图 ${date}`), paletteFor(date)]);
  const im = decodePng(png);
  if (im.width !== OW || im.height !== OH) throw new Error(`尺寸不符：${im.width}×${im.height}`);
  const frac = new Uint8Array(OW * OH);
  const valid = new Uint8Array(OW * OH);
  let unknown = 0, ok = 0;
  for (let p = 0, i = 0; p < frac.length; p++, i += im.channels) {
    if (im.data[i + 3] === 0) continue;                    // 无观测
    const idx = pal.get((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]);
    if (idx === undefined) { unknown++; continue; }
    if (idx > 100) { ok++; frac[p] = 255; valid[p] = 1; continue; }  // 101 = 满云
    frac[p] = Math.round(idx * 255 / 100);
    valid[p] = 1; ok++;
  }
  const cov = ok / frac.length;
  console.log(`  ${date}  有效 ${(cov * 100).toFixed(1)}%` +
    (unknown ? `  颜色未命中 ${(unknown / frac.length * 100).toFixed(2)}%` : ''));
  return { frac, valid, cov };
}

console.log(`GIBS ${LAYER} → ${OW}×${OH}，目标日期 ${target}（回补至多 ${DAYS} 天）`);
const composed = new Uint8Array(OW * OH);
const filled = new Uint8Array(OW * OH);
let gapFromOlder = 0;
for (let k = 0; k < DAYS; k++) {
  const date = iso(new Date(Date.parse(target + 'T00:00:00Z') - k * 86400e3));
  const { frac, valid, cov } = await fetchDay(date);
  if (cov < 0.05) { console.log(`  ${date} 有效像元过少，跳过`); continue; }
  for (let p = 0; p < composed.length; p++) {
    if (filled[p] || !valid[p]) continue;
    composed[p] = frac[p];
    filled[p] = 1;
    if (k > 0) gapFromOlder++;
  }
  const nowCov = filled.reduce((a, b) => a + b, 0) / filled.length;
  if (nowCov > 0.999) break;
}
const coverage = filled.reduce((a, b) => a + b, 0) / filled.length;
console.log(`合成后有效覆盖 ${(coverage * 100).toFixed(2)}%（其中 ${(gapFromOlder / filled.length * 100).toFixed(2)}% 来自更早的日子）`);

// ── 自检：全球平均云量应在实测范围内 ──────────────────────────────────────
let sum = 0, n = 0;
for (let p = 0; p < composed.length; p++) if (filled[p]) { sum += composed[p]; n++; }
const meanFrac = sum / n / 255;
console.log(`全球平均云量 ${meanFrac.toFixed(3)}（实测约 0.67）`);
if (meanFrac < 0.45 || meanFrac > 0.85) {
  console.log('✗ 平均云量明显偏离实测范围——颜色→数值的映射可能错了');
  process.exit(1);
}

// ── 轻度低通 ──────────────────────────────────────────────────────────────
// MODIS 的日云量是**逐格点覆盖率**，而 2km 格点非晴即满云，直出是一张硬边黑白图。
// 真实云在照片里的柔和边缘来自格点以下的细节，这里用一个半径很小的高斯把
// 覆盖率当作密度场来渲染。这是低通、不是编数据：总量守恒，只是把阶跃摊开。
// 半径按输出宽度定（≈0.5 km），分辨率越高摊得越细。
function blur(gray, w, h, radius) {
  if (radius < 1) return gray;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const ker = [];
  let ksum = 0;
  for (let k = -radius; k <= radius; k++) { const v = Math.exp(-k * k / (radius * radius * 0.5)); ker.push(v); ksum += v; }
  for (const v of ker) { /* 归一化见下 */ }
  const idx = (i) => i + radius;
  // 水平
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        s += gray[y * w + xx] * ker[idx(k)];
      }
      tmp[y * w + x] = s / ksum;
    }
  }
  // 垂直
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        s += tmp[yy * w + x] * ker[idx(k)];
      }
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(s / ksum)));
    }
  }
  return out;
}

// ── 对比度传递：把"覆盖率"变成像云的"云量" ────────────────────────────────
// 源数据是 2km 逐格点覆盖率，基本非晴即满云；降到 2048 宽时每个像元平均了约
// 10×10 个格点，于是处处都是中间调，渲染出来整颗地球一层半透明白纱，
// 晴空区（副热带高压）也看不出晴。
//
// 这一步是**显示传递**，不是改数据：把低覆盖压到全晴、高覆盖拉到满云，
// 拉开对比，让 2km 尺度的"有云/无云"在粗分辨率下仍然可辨。
// 累计云量不变多少（平均略降），空间格局完全来自真实观测。
const CLOUD_LO = 0.30, CLOUD_HI = 0.85;
function contrast(map) {
  const out = new Uint8Array(map.length);
  for (let i = 0; i < map.length; i++) {
    const v = map[i] / 255;
    const d = (v - CLOUD_LO) / (CLOUD_HI - CLOUD_LO);
    out[i] = Math.max(0, Math.min(255, Math.round(d * 255)));
  }
  return out;
}

// ── 输出灰度 PNG（数值即亮度，正好对上云层着色器读 luminance 的约定）──────
function grayPng(gray, w, h) {
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    const row = y * (w + 1);
    raw[row] = 1;                                  // 滤波器 Sub：水平差分，平滑图压得更好
    const base = y * w;
    for (let x = 0; x < w; x++) {
      raw[row + 1 + x] = (gray[base + x] - (x ? gray[base + x - 1] : 0)) & 0xff;
    }
  }
  const crcT = [...Array(256)].map((_, nn) => {
    let c = nn;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xFFFFFFFF;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0;                        // 8 位灰度
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/textures/', import.meta.url);
mkdirSync(outDir, { recursive: true });
// 半径按宽度定：8192 宽时约 3px ≈ 0.8 km，2048 宽时 1px
const blurR = Math.max(1, Math.round(OW / 2730));
const map = blur(composed, OW, OH, blurR);
console.log(`低通半径 ${blurR} px（把逐格点覆盖率当密度场渲染）`);
const shown = contrast(map);
console.log(`对比度传递：覆盖率 ${CLOUD_LO}–${CLOUD_HI} → 全晴–满云`);
const png = grayPng(shown, OW, OH);
writeFileSync(new URL('clouds_real.png', outDir), png);
writeFileSync(new URL('clouds_real.json', outDir), JSON.stringify({
  date: target, layer: LAYER, size: [OW, OH],
  coverage: +coverage.toFixed(4), meanFraction: +meanFrac.toFixed(4), blurPx: blurR,
  generated: new Date().toISOString(),
}, null, 1));
console.log(`→ public/textures/clouds_real.png  ${(png.length / 1024 / 1024).toFixed(1)} MB`);
console.log('→ public/textures/clouds_real.json');

// 必须登记进贴图清单：加载器对不在 manifest 里的文件是**直接跳过**的
// （见 builder.js 的 `if (!manifest[file]) { finish(); return; }`），
// 不登记的话这张图根本不会被加载，云层会静默回落到合成图。
const manifestPath = new URL('manifest.json', outDir);
if (existsSync(manifestPath)) {
  const raw = readFileSync(manifestPath, 'utf8');
  const bom = raw.charCodeAt(0) === 0xFEFF ? '﻿' : '';
  const manifest = JSON.parse(bom ? raw.slice(1) : raw);
  if (manifest['clouds_real.png'] !== true) {
    manifest['clouds_real.png'] = true;
    writeFileSync(manifestPath, bom + JSON.stringify(manifest, null, 4) + '\n');
    console.log('→ 已登记进 textures/manifest.json');
  }
}
