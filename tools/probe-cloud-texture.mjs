// 云贴图体检：地球近景盘面上有一条等距点状的细亮线，只在云层开启时出现。
// 等距点阵是"细亮线被缩小采样"的典型走样特征，所以先找那条线本身。
//
// 查两件事：
//   1. 有没有孤立的异常列/行（贴图自带的细线）
//   2. 左右边缘是否接得上（球面 UV 在反经线处首尾相接，接不上就是一条缝）
// 注意必须用**全分辨率**贴图：L1 预览层是 512×256，下采样会把单像素宽的线抹掉，
// 用预览层查会得到"没问题"的假结论。
import puppeteer from 'puppeteer';

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const res = await p.evaluate(async () => {
  const img = new Image();
  img.src = '/textures/earth_clouds.jpg';
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
  };

  const colMean = new Float64Array(W), rowMean = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      colMean[x] += l / H; rowMean[y] += l / W;
    }
  }
  const colOut = [];
  for (let x = 0; x < W; x++) {
    let nb = 0, n = 0;
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      nb += colMean[(x + k + W) % W]; n++;
    }
    const dev = colMean[x] - nb / n;
    if (Math.abs(dev) > 0.015) colOut.push({ x, v: +colMean[x].toFixed(4), dev: +dev.toFixed(4) });
  }
  const rowOut = [];
  for (let y = 3; y < H - 3; y++) {
    let nb = 0, n = 0;
    for (let k = -3; k <= 3; k++) { if (k) { nb += rowMean[y + k]; n++; } }
    const dev = rowMean[y] - nb / n;
    if (Math.abs(dev) > 0.02) rowOut.push({ y, v: +rowMean[y].toFixed(4), dev: +dev.toFixed(4) });
  }

  // 反经线接缝：比较"最后一列 ↔ 第一列"与随机相邻列对的差异
  const colDiff = (a, c) => {
    let s = 0;
    for (let y = 0; y < H; y++) s += Math.abs(lum(a, y) - lum(c, y));
    return s / H;
  };
  const seam = colDiff(W - 1, 0);
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(Math.random() * (W - 2));
    samples.push(colDiff(x, x + 1));
  }
  samples.sort((a, c) => a - c);
  const median = samples[30];
  const p95 = samples[57];

  // 同样看上下（极点）接缝
  const rowDiff = (a, c) => {
    let s = 0;
    for (let x = 0; x < W; x++) s += Math.abs(lum(x, a) - lum(x, c));
    return s / W;
  };
  const poleSeam = rowDiff(0, H - 1);

  return {
    W, H, colOut: colOut.slice(0, 25), nColOut: colOut.length,
    rowOut: rowOut.slice(0, 25), nRowOut: rowOut.length,
    seam: +seam.toFixed(4), median: +median.toFixed(4), p95: +p95.toFixed(4),
    poleSeam: +poleSeam.toFixed(4),
  };
});

console.log(`云贴图 ${res.W}×${res.H}`);
console.log(`\n异常列 ${res.nColOut} 条:`);
for (const c of res.colOut) console.log(`   x=${c.x}  均值 ${c.v}  偏离 ${c.dev > 0 ? '+' : ''}${c.dev}`);
console.log(`\n异常行 ${res.nRowOut} 条（只列前 25）:`);
for (const r of res.rowOut) console.log(`   y=${r.y}  均值 ${r.v}  偏离 ${r.dev > 0 ? '+' : ''}${r.dev}`);
console.log(`\n反经线接缝: 首尾列差 ${res.seam}   相邻列差中位 ${res.median}  p95 ${res.p95}`);
console.log(`  → 接缝是相邻列差的 ${(res.seam / res.median).toFixed(1)} 倍`);
console.log(`极点接缝（首行↔末行）: ${res.poleSeam}`);
await b.close();
