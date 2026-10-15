// 从 NASA Solar System Treks 拉取冰卫星的官方全球镶嵌图，拼成等距圆柱贴图。
//
// 为什么换源：现有的 23 张贴图来自 Solar System Scope / Steve Albers 的二次合成，
// 而 13 颗卫星根本没有贴图（走程序化噪声）。Trek 提供的是 NASA/USGS 的一手
// 全球镶嵌（Cassini / Voyager / Galileo 影像），公有领域，且带明确出处。
//
// 拼接方式：Trek 的 WMTS 在层级 z 是 2^(z+1) × 2^z 张 256px 瓦片。
// 用 Puppeteer 的画布把瓦片画上去再导出 JPEG——项目本身依赖 puppeteer，
// 比为此引入图像编码库更干净。
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const OUT = new URL('../public/textures/', import.meta.url);

/** Wikimedia 会对无描述 User-Agent 的请求限流并返回 HTML 错误页；带出处与联系方式是他们的政策要求 */
const UA = { 'User-Agent': 'Solar-Wanderer/1.0 (planetary texture build; https://github.com/hyqzz/Solar-Wanderer)' };
const isImage = (b, mime) => mime === 'image/png' ? b[0] === 0x89 && b[1] === 0x50 : b[0] === 0xff && b[1] === 0xd8;

/** 带 UA 与重试的下载；非图片内容（限流页）视为失败并重试 */
async function fetchImage(url, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      const mime = r.headers.get('content-type') || '';
      if (/jpeg/.test(mime) && isImage(b, 'image/jpeg')) return b;
      if (/png/.test(mime) && isImage(b, 'image/png')) return b;
      throw new Error('非图片响应（' + mime + ', ' + b.length + 'B）');
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}
mkdirSync(OUT, { recursive: true });

/** 图层取自 https://trek.nasa.gov/tiles/apidoc/config/icymoonLayerList.json */
const TARGETS = {
  mimas: ['Mimas', 'MI_170630_DLR_basemap'],
  enceladus: ['Enceladus', 'Enceladus_Cassini_mosaic_global_110m'],
  tethys: ['Tethys', 'Tethys_Cassini_mosaic_global_293m'],
  dione: ['Dione', 'Dione_Cassini_Voyageglobal_154m'],
  rhea: ['Rhea', 'RH_120803_DLR_basemap'],
  iapetus: ['Iapetus', 'Iapetus_Cassini_Voyager_mosaic_global_783m'],
};

/**
 * Trek 没有覆盖的天体：改用 Wikimedia Commons 上的 USGS / JPL 全球镶嵌图。
 * 这些都是公有领域（USGS/JPL 出品）或 CC BY-SA 的公开影像，Commons 只是镜像。
 * 出处与许可逐条记录在 THIRD_PARTY_NOTICES.md。
 */
const COMMONS = {
  phobos: ['Phobos Viking Mosaic DLRcontrol 7200.jpg', 'USGS/Viking · Public domain'],
  deimos: ['Deimos map by Askaniy.png', 'USGS/Viking mosaic derivative · CC BY-SA 3.0'],
  miranda: ['Miranda map.jpg', 'USGS/Voyager 2 · Public domain'],
  ariel: ['Ariel map JPL USGS.jpg', 'JPL/USGS/Voyager 2 · Public domain'],
  umbriel: ['Umbriel map JPL USGS.jpg', 'JPL/USGS/Voyager 2 · Public domain'],
  titania: ['Titania map JPL USGS.jpg', 'JPL/USGS/Voyager 2 · Public domain'],
  oberon: ['Oberon map JPL USGS.jpg', 'JPL/USGS/Voyager 2 · Public domain'],
};

/** 超过这个宽度就等比缩到它——再大对目视没有增益，只是徒增体积 */
const MAX_WIDTH = 4096;

const LEVEL = Number.parseInt(process.argv[2] ?? '3', 10);   // z=3 → 4096×2048
const CONCURRENCY = 6;
const tileUrl = (body, layer, z, y, x) =>
  `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;

async function fetchTile(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (!(b[0] === 0xff && b[1] === 0xd8)) throw new Error('不是 JPEG');
      return b;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
let page = await browser.newPage();

/** 长时间复用同一个 page 后 evaluate 偶发失效；重建页面重试一次即可 */
async function withRetry(fn, label) {
  try { return await fn(); } catch (e) {
    console.warn(`   ↻ ${label} 重试（${e.message.slice(0, 40)}）`);
    try { await page.close(); } catch { /* 已关闭 */ }
    page = await browser.newPage();
    return await fn();
  }
}

let ok = 0, skip = 0, fail = 0;
for (const [id, [body, layer]] of Object.entries(TARGETS)) {
  const dest = new URL(`${id}.jpg`, OUT);
  const minBytes = 200 * 1024;
  if (existsSync(dest) && statSync(dest).size > minBytes) {
    console.log(`SKIP ${id}（已存在 ${(statSync(dest).size / 1048576).toFixed(2)} MB）`);
    skip++;
    continue;
  }
  const cols = 2 ** (LEVEL + 1), rows = 2 ** LEVEL;
  const coords = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) coords.push([y, x]);
  process.stdout.write(`${id}: 取 ${cols}×${rows} = ${coords.length} 片 … `);

  const tiles = new Array(coords.length);
  let cursor = 0, fetched = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < coords.length) {
      const i = cursor++;
      const [y, x] = coords[i];
      try { tiles[i] = await fetchTile(tileUrl(body, layer, LEVEL, y, x)); fetched++; }
      catch (e) { tiles[i] = null; }
    }
  }));
  const missing = tiles.filter((t) => !t).length;
  if (missing > coords.length * 0.02) {
    console.log(`失败：${missing}/${coords.length} 片不可用`);
    fail++;
    continue;
  }

  const dataUrls = tiles.map((t) => t ? 'data:image/jpeg;base64,' + t.toString('base64') : null);
  const jpegBase64 = await page.evaluate(async ({ dataUrls, cols, rows, size }) => {
    const canvas = document.createElement('canvas');
    canvas.width = cols * size; canvas.height = rows * size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const load = (src) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
    });
    for (let i = 0; i < dataUrls.length; i++) {
      if (!dataUrls[i]) continue;
      const im = await load(dataUrls[i]);
      ctx.drawImage(im, (i % cols) * size, Math.floor(i / cols) * size);
    }
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, { dataUrls, cols, rows, size: 256 });

  const buf = Buffer.from(jpegBase64, 'base64');
  writeFileSync(dest, buf);
  console.log(`✓ ${canvasSize(cols, rows)} px，${(buf.length / 1048576).toFixed(2)} MB${missing ? `（补黑边 ${missing} 片）` : ''}`);
  ok++;
}

function canvasSize(cols, rows) { return `${cols * 256}×${rows * 256}`; }

// ── 第二来源：Wikimedia Commons 的单张整图（Trek 未覆盖的天体）──────────────
/** 用 puppeteer 把任意尺寸的图归一化到 ≤MAX_WIDTH 宽并转成 JPEG */
async function normalizeToJpeg(buffer, mime) {
  const dataUrl = `data:${mime};base64,` + buffer.toString('base64');
  const out = await page.evaluate(async ({ dataUrl, maxW }) => {
    const im = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
    });
    const scale = Math.min(1, maxW / im.naturalWidth);
    const w = Math.round(im.naturalWidth * scale), h = Math.round(im.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0, w, h);
    return { jpeg: c.toDataURL('image/jpeg', 0.9).split(',')[1], w, h };
  }, { dataUrl, maxW: MAX_WIDTH });
  return { buf: Buffer.from(out.jpeg, 'base64'), w: out.w, h: out.h };
}

const BODY_MIME = (name) => name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

for (const [id, [title, credit]] of Object.entries(COMMONS)) {
  const dest = new URL(`${id}.jpg`, OUT);
  if (existsSync(dest) && statSync(dest).size > 150 * 1024) {
    console.log(`SKIP ${id}（已存在）`);
    skip++;
    continue;
  }
  try {
    const api = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' +
      encodeURIComponent('File:' + title) + '&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*';
    const j = await (await fetch(api, { signal: AbortSignal.timeout(30000) })).json();
    const page_ = Object.values(j?.query?.pages ?? {})[0];
    const info = page_?.imageinfo?.[0];
    if (!info?.url) throw new Error('未找到文件');
    const raw = await fetchImage(info.url);
    // 已经是 JPEG 且没超过上限 → 原样落盘。既免去一次解码（浏览器解码偶发失败），
    // 也避免二次压缩带来的画质损失。
    if (info.mime === 'image/jpeg' && info.width <= MAX_WIDTH) {
      writeFileSync(dest, raw);
      console.log(`✓ ${id.padEnd(10)} ${info.width}×${info.height}（原样）${(raw.length / 1048576).toFixed(2)} MB  · ${credit}`);
      ok++;
      continue;
    }
    const { buf, w, h } = await withRetry(() => normalizeToJpeg(raw, info.mime ?? BODY_MIME(title)), id);
    writeFileSync(dest, buf);
    console.log(`✓ ${id.padEnd(10)} ${w}×${h}（源 ${info.width}×${info.height}）${(buf.length / 1048576).toFixed(2)} MB  · ${credit}`);
    ok++;
  } catch (e) {
    console.log(`✗ ${id}: ${e.message.slice(0, 70)}`);
    fail++;
  }
}

await browser.close();
console.log(`\n完成：新抓取 ${ok} / 跳过 ${skip} / 失败 ${fail}`);
process.exitCode = fail ? 1 : 0;
