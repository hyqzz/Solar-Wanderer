// 像素级对比：哪一级隐藏后右半屏（墙区）变化最大 → 肇事 LOD 级。
import puppeteer from 'puppeteer';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('./.shot-audit/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const files = readdirSync(DIR).filter((f) => f.startsWith('diag-wall2-'));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');

async function regionStats(file) {
  const b64 = readFileSync(DIR + file).toString('base64');
  return page.evaluate(async (b) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b; });
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // 墙区：右半屏 x 700..1200, y 100..600（避开 UI）
    const d = ctx.getImageData(700, 100, 500, 500).data;
    let sum = 0;
    const px = [];
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; px.push(l); sum += l; }
    return { mean: sum / px.length, px };
  }, b64);
}

const base = await regionStats('diag-wall2-all.png');
console.log('all(基准) 墙区均值:', base.mean.toFixed(1));
for (const f of files.filter((f) => f.includes('hide')).sort()) {
  const s = await regionStats(f);
  // 与基准的均差
  let diff = 0;
  for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - s.px[i]);
  console.log(f, '均值', s.mean.toFixed(1), '与基准均差', (diff / base.px.length).toFixed(1));
}
await browser.close();
