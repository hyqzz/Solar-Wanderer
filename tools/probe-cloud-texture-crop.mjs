// 裁出云贴图的一块区域存成 PNG，用于肉眼找细线（列/行扫描抓不到斜向细线）。
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const [u0, v0, uw, vh, out] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const res = await p.evaluate(async (a) => {
  const img = new Image();
  img.src = '/textures/earth_clouds.jpg';
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const x0 = Math.round(a.u0 * W), y0 = Math.round(a.v0 * H);
  const cw = Math.round(a.uw * W), ch = Math.round(a.vh * H);
  const d = ctx.getImageData(x0, y0, cw, ch);
  return { w: cw, h: ch, data: Array.from(d.data) };
}, { u0: +u0, v0: +v0, uw: +uw, vh: +vh });

const raw = Buffer.alloc(res.h * (res.w * 3 + 1));
for (let y = 0; y < res.h; y++) {
  raw[y * (res.w * 3 + 1)] = 0;
  for (let x = 0; x < res.w; x++) {
    const si = (y * res.w + x) * 4, di = y * (res.w * 3 + 1) + 1 + x * 3;
    raw[di] = res.data[si]; raw[di + 1] = res.data[si + 1]; raw[di + 2] = res.data[si + 2];
  }
}
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (bb) => { let c = 0xFFFFFFFF; for (const x of bb) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (t, dd) => { const l = Buffer.alloc(4); l.writeUInt32BE(dd.length); const td = Buffer.concat([Buffer.from(t), dd]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(res.w, 0); ihdr.writeUInt32BE(res.h, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}: 贴图 [${u0},${v0}] ${res.w}×${res.h}`);
await b.close();
