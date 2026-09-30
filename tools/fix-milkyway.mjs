// 银河全景贴图修复（一次性资产再生，需 dev server）：
// 问题：源图暗部为深藏青（~RGB(5,8,14)）而非纯黑，叠加 JPEG 8×8 压缩块，
//       渲染在纯黑太空背景上显形为块状矩形斑（图册截图审查发现）。
// 处理：1.5px 高斯模糊（消 JPEG 块）→ 黑场减除 → 增益提亮银河带。
// 用法：node tools/fix-milkyway.mjs
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../public/textures/milkyway.jpg', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
const dataUrl = 'data:image/jpeg;base64,' + readFileSync(FILE).toString('base64');
const out = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.filter = 'blur(1.5px)';
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    // 黑场 8 → 0；增益 1.7（银河带提亮，暗部归零后与纯黑背景无缝）
    px[i] = Math.min(255, Math.max(0, px[i] - 8) * 1.7);
    px[i + 1] = Math.min(255, Math.max(0, px[i + 1] - 8) * 1.7);
    px[i + 2] = Math.min(255, Math.max(0, px[i + 2] - 8) * 1.7);
  }
  ctx.putImageData(d, 0, 0);
  return cv.toDataURL('image/jpeg', 0.92);
}, dataUrl);
await browser.close();
writeFileSync(FILE, Buffer.from(out.split(',')[1], 'base64'));
console.log('milkyway.jpg regenerated:', Math.round(out.length * 0.75 / 1024), 'KB');
