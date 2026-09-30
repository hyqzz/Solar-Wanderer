// 解码月球 DEM z4 瓦片 (8,12)（lat -60° lon 0° 所在），查高程尖峰/陡变。
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const stats = await page.evaluate(async () => {
  const res = await fetch('dem/moon/4/8/12.png');
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  const s = bmp.width;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const raw = (img.data[i * 4] << 8) | img.data[i * 4 + 1];
    h[i] = -9 + (raw / 65535) * 20;
  }
  let min = 99, max = -99, maxGrad = 0, gradAt = null;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const v = h[y * s + x];
      if (v < min) min = v;
      if (v > max) max = v;
      if (x + 1 < s) {
        const g = Math.abs(h[y * s + x + 1] - v);
        if (g > maxGrad) { maxGrad = g; gradAt = { x, y, dir: 'E', a: +v.toFixed(2), b: +h[y * s + x + 1].toFixed(2) }; }
      }
      if (y + 1 < s) {
        const g = Math.abs(h[(y + 1) * s + x] - v);
        if (g > maxGrad) { maxGrad = g; gradAt = { x, y, dir: 'S', a: +v.toFixed(2), b: +h[(y + 1) * s + x].toFixed(2) }; }
      }
    }
  }
  return { size: s, min: +min.toFixed(2), max: +max.toFixed(2), maxGradKmPerPx: +maxGrad.toFixed(2), gradAt };
});
console.log('瓦片 4/8/12:', JSON.stringify(stats));
// z4 一像素 = 22110m/256 ≈ 86m（纬度 60° 处东西向 ~43m）。相邻像素高差即坡度参考。
await browser.close();
