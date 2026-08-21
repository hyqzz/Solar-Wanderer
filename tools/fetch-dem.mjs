// DEM 数据管线：下载真实高程（月球 LOLA / 火星 MOLA / 地球 ETOPO1），
// 重采样为 16-bit Terrain-RGB 四叉树瓦片（R=高8位 G=低8位，PNG 无损压缩），
// 输出到 public/dem/<body>/<z>/<x>/<y>.png，与 src/scene/demTiles.js 的加载约定一致。
//
// 用法：node tools/fetch-dem.mjs [moon|mars|earth|all]
//
// 数据源（PDS/NOAA 原始二进制，int16）：
//   moon:  LOLA GDR ldem_16（5760×2880，LSB，height_m = DN×0.5，参考球 1737400 m）
//   mars:  MOLA MEGDR 32ppd 全球（11520×5760，MSB，单位米，相对火星基准面）
//   earth: ETOPO1 ice_surface cell-registered（21601×10801，int16 米，海平面基准）
//
// 瓦片约定（与 demTiles.js 严格一致）：层级 z 有 2^z×2^z 张 256px 瓦片；
// lon∈[-180,180]→x∈[0,2^z)，lat∈[90,-90]→y∈[0,2^z)；
// 高程解码 = heightOffset + raw/65535 × heightScale（km）。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer';

const CACHE = 'tools/.cache-dem';
const OUT = 'public/dem';

const SOURCES = {
  moon: {
    url: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img',
    file: 'ldem_16.img',
    cols: 5760, rows: 2880, littleEndian: true,
    toMeters: (v) => v * 0.5,          // 半径 = DN×0.5 + 1737400 → 相对高 = DN×0.5
    lonRange: [0, 360],                 // 0–360°E
    heightOffset: -9, heightScale: 20,  // km（含裕量：实测 −9.1~+10.8）
    maxLevel: 4,
  },
  mars: {
    url: 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.img',
    file: 'megt90n000fb.img',
    cols: 11520, rows: 5760, littleEndian: false,
    toMeters: (v) => v,                 // 已是米
    lonRange: [0, 360],
    heightOffset: -9, heightScale: 31,  // km（赫拉斯 −8.2 ~ 奥林帕斯 +21.2，留裕量）
    maxLevel: 4,                        // L5 垂直方向已超源分辨率，体积翻倍而无实质细节
  },
  earth: {
    url: 'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO1/data/ice_surface/cell_registered/binary/etopo1_ice_c_i2.zip',
    file: 'etopo1_ice_c_i2.zip',
    zipEntry: true,                     // zip 内含 etopo1_ice_c_i2.bin
    cols: 21600, rows: 10800, littleEndian: null, // 实测为网格配准 21600×10800；字节序自动嗅探
    toMeters: (v) => v,
    lonRange: [-180, 180],              // -180–180°E
    heightOffset: -11, heightScale: 20, // km（马里亚纳 −10.9 ~ 珠峰 +8.85）
    maxLevel: 4,                        // 与月/火一致；L5 体积翻倍而视觉增量有限
  },
};

// ── 下载（带缓存，断点不重复下载）──
async function download(cfg) {
  mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, cfg.file);
  if (!existsSync(f)) {
    console.log(`下载 ${cfg.url} …`);
    const resp = await fetch(cfg.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    writeFileSync(f, Buffer.from(await resp.arrayBuffer()));
  }
  let buf = readFileSync(f);
  if (cfg.zipEntry) {
    // 最小 zip 解包：读本地文件头，inflateRaw 解压第一个条目
    const nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
    const method = buf.readUInt16LE(8);
    const dataStart = 30 + nameLen + extraLen;
    const compSize = buf.readUInt32LE(18);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    buf = method === 8 ? zlib.inflateRawSync(raw) : raw;
    console.log(`zip 解包完成：${(buf.length / 1e6).toFixed(0)}MB`);
  }
  return buf;
}

// ── 解析为 Float32Array（米），含字节序嗅探 ──
function parseGrid(cfg, buf) {
  const n = cfg.cols * cfg.rows;
  if (buf.length < n * 2) throw new Error(`数据长度不足：${buf.length} < ${n * 2}`);
  const read = (le) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = le ? buf.readInt16LE(i * 2) : buf.readInt16BE(i * 2);
      out[i] = cfg.toMeters(v);
    }
    return out;
  };
  if (cfg.littleEndian !== null) return read(cfg.littleEndian);
  // 嗅探：合理的高程范围是 ±20km 内，且海平面/基准面附近众数密集
  const a = read(true), b = read(false);
  const sane = (g) => {
    let ok = 0;
    for (let i = 0; i < n; i += 997) if (Math.abs(g[i]) < 20000) ok++;
    return ok;
  };
  const le = sane(a) >= sane(b);
  console.log(`字节序嗅探：${le ? 'LSB' : 'MSB'}`);
  return le ? a : b;
}

// ── 面积加权重采样：源网格 → 目标网格（等距圆柱，lon 起点可配置）──
function resample(src, sCols, sRows, lonStart, dCols, dRows) {
  const dst = new Float32Array(dCols * dRows);
  const xScale = sCols / dCols, yScale = sRows / dRows;
  for (let j = 0; j < dRows; j++) {
    // 目标像素中心纬度（自北向南）
    const lat = 90 - (j + 0.5) / dRows * 180;
    const fy = (90 - lat) / 180 * sRows; // 源浮点行
    // 覆盖源行范围（面积加权）
    const y0 = Math.max(0, Math.floor(fy - yScale / 2)), y1 = Math.min(sRows - 1, Math.ceil(fy + yScale / 2));
    for (let i = 0; i < dCols; i++) {
      const lon = (i + 0.5) / dCols * 360 - 180;                 // 目标像素中心经度（-180..180）
      const lonSrc = ((lon - lonStart) % 360 + 360) % 360;        // 源经度系
      const fx = lonSrc / 360 * sCols;
      const x0 = Math.max(0, Math.floor(fx - xScale / 2)), x1 = Math.min(sCols - 1, Math.ceil(fx + xScale / 2));
      let sum = 0, cnt = 0;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { sum += src[yy * sCols + xx]; cnt++; }
      dst[j * dCols + i] = cnt ? sum / cnt : 0;
    }
  }
  return dst;
}

// ── 主流程 ──
const which = process.argv[2] ?? 'all';
const bodies = which === 'all' ? Object.keys(SOURCES) : [which];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

for (const body of bodies) {
  const cfg = SOURCES[body];
  console.log(`\n=== ${body} ===`);
  const grid = parseGrid(cfg, await download(cfg));
  let mn = Infinity, mx = -Infinity;
  for (const v of grid) { if (v < mn) mn = v; if (v > mx) mx = v; }
  console.log(`源高程范围: ${(mn / 1000).toFixed(2)} ~ ${(mx / 1000).toFixed(2)} km`);

  const outDir = path.join(OUT, body);
  const [hOff, hScale] = [cfg.heightOffset * 1000, cfg.heightScale * 1000]; // km → m
  const index = { heightOffset: cfg.heightOffset, heightScale: cfg.heightScale, maxLevel: cfg.maxLevel, tileSize: 256, generated: new Date().toISOString() };

  for (let z = 0; z <= cfg.maxLevel; z++) {
    const tiles = 2 ** z, size = 256 * tiles; // 该层全球画布（正方形）
    const level = resample(grid, cfg.cols, cfg.rows, cfg.lonRange[0], size, size);
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        // 提取 256×256 瓦片（TypedArray 不能过 evaluate 序列化，转普通数组）
        const tileArr = new Array(65536);
        for (let j = 0; j < 256; j++) {
          const row = (ty * 256 + j) * size + tx * 256;
          for (let i = 0; i < 256; i++) tileArr[j * 256 + i] = level[row + i];
        }
        // 量化为 RG 16-bit PNG（无损压缩）
        const b64 = await page.evaluate((tileArr, hOff, hScale) => {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 256;
          const ctx = cv.getContext('2d');
          const img = ctx.createImageData(256, 256);
          const d = img.data;
          for (let k = 0; k < 65536; k++) {
            const q = Math.max(0, Math.min(65535, Math.round((tileArr[k] - hOff) / hScale * 65535)));
            d[k * 4] = q >> 8; d[k * 4 + 1] = q & 255; d[k * 4 + 2] = 0; d[k * 4 + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          return cv.toDataURL('image/png').split(',')[1];
        }, tileArr, hOff, hScale);
        const dir = path.join(outDir, String(z), String(tx));
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `${ty}.png`), Buffer.from(b64, 'base64'));
      }
    }
    console.log(`L${z}: ${tiles}×${tiles} 瓦片完成`);
  }
  writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  console.log(`${body} 完成 → ${outDir}`);
}

await browser.close();
console.log('\n全部完成');
