// 生成 L1 预览贴图：public/textures/*.{jpg,png} → public/textures/preview/*.webp（长边 512px）
// 同时输出 preview/manifest.json：{ 原文件名: { p: 预览文件名, h: 源文件 sha1 前 12 位 } }
// 用 puppeteer 的 canvas 做缩放，避免引入额外图像依赖；离线可跑。
// 用法：node tools/make-preview-textures.mjs
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const SRC = 'public/textures';
const OUT = path.join(SRC, 'preview');
const LONG_EDGE = 512;
const QUALITY = 0.82;

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
console.log(`共 ${files.length} 张贴图待处理`);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const manifest = {};
let totalIn = 0, totalOut = 0;
for (const f of files) {
  const buf = await readFile(path.join(SRC, f));
  totalIn += buf.length;
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  const outName = f.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  const b64 = await page.evaluate(async (uri, longEdge, q) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const scale = Math.min(1, longEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, dataUri, LONG_EDGE, QUALITY);
  const outBuf = Buffer.from(b64, 'base64');
  totalOut += outBuf.length;
  await writeFile(path.join(OUT, outName), outBuf);
  manifest[f] = { p: outName, h: hash };
  console.log(`${f} → preview/${outName}  ${(buf.length / 1e6).toFixed(2)}MB → ${(outBuf.length / 1e3).toFixed(0)}KB`);
}
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`完成：${(totalIn / 1e6).toFixed(1)}MB → ${(totalOut / 1e6).toFixed(2)}MB（${(totalOut / totalIn * 100).toFixed(1)}%）`);
