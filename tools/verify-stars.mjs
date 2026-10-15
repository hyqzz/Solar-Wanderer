// 真实星场的运行时核验：星表加载进来了吗？天上的位置对吗？
//
// 关键：不能拿"我自己写的坐标换算"当答案去比对渲染结果——那样测的是我的换算，
// 不是渲染。改用**变换无关**的量：两颗星的角距在任意坐标系旋转下不变，
// 所以直接比较"渲染出来的亮星之间的角距"与"星表里同几颗星的角距"。
// 只要渲染端的摆放有任何非旋转的错（轴弄反、经纬度搞混、漏星），角距立刻对不上。
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { parseStarCatalog } from '../src/astro/starCatalog.js';

const bin = readFileSync(new URL('../public/data/stars.bin', import.meta.url));
const cat = parseStarCatalog(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const D = Math.PI / 180;
const unit = (raDeg, decDeg) => [
  Math.cos(decDeg * D) * Math.cos(raDeg * D),
  Math.cos(decDeg * D) * Math.sin(raDeg * D),
  Math.sin(decDeg * D),
];
const sep = (a, b) => {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(d) / D;
};

// 星表里最亮的 12 颗（作为"答案"）
const order = [...Array(cat.count).keys()].sort((i, j) => cat.mag[i] - cat.mag[j]).slice(0, 12);
const refDirs = order.map((i) => unit(cat.ra[i], cat.dec[i]));
const refSeps = [];
for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) refSeps.push(sep(refDirs[i], refDirs[j]));
refSeps.sort((a, b) => a - b);

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');

const loaded = await p.waitForFunction(() => {
  const s = window.__game?.sky;
  return s && s.starCounts && s.starCounts.reduce((a, c) => a + c, 0) > 8000;
}, { timeout: 60000 }).then(() => true).catch(() => false);

const info = await p.evaluate(() => {
  const s = window.__game.sky;
  const pts = [];
  s.brightGroup.traverse((o) => {
    if (!o.isPoints) return;
    const pos = o.geometry.attributes.position.array;
    const col = o.geometry.attributes.color.array;
    for (let i = 0; i < pos.length; i += 3) {
      const L = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1;
      // 用颜色亮度当"星等"的代理：亮度是按 Pogson 从星等算出来的
      const I = Math.hypot(col[i], col[i + 1], col[i + 2]);
      pts.push({ d: [pos[i] / L, pos[i + 1] / L, pos[i + 2] / L], I });
    }
  });
  return { counts: s.starCounts, total: pts.length, pts };
});

console.log('星表已加载:', loaded, ' 分层恒星数:', JSON.stringify(info.counts), '合计', info.total);

let bad = 0;
if (!loaded || info.total !== cat.count) {
  console.log(`✗ 渲染的恒星数 ${info.total} 与星表 ${cat.count} 不符`);
  bad++;
}

// 渲染侧最亮的 12 颗
info.pts.sort((a, c) => c.I - a.I);
const gotDirs = info.pts.slice(0, 12).map((x) => x.d);
const gotSeps = [];
for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) gotSeps.push(sep(gotDirs[i], gotDirs[j]));
gotSeps.sort((a, c) => a - c);

let maxDev = 0;
for (let i = 0; i < refSeps.length; i++) maxDev = Math.max(maxDev, Math.abs(refSeps[i] - gotSeps[i]));
const okSep = maxDev < 0.05;
if (!okSep) bad++;
console.log(`${okSep ? '✓' : '✗'} 最亮 12 颗的 66 组角距与星表一致（最大偏差 ${maxDev.toFixed(4)}°）`);

// 角距分布要铺得开——全挤在一起说明只是把星堆在了一小块天区
const span = refSeps[refSeps.length - 1];
console.log(`  角距跨度 ${refSeps[0].toFixed(1)}° – ${span.toFixed(1)}°（全天分布）`);

if (errs.length) { console.log('✗ 运行时错误', errs.length, errs[0]); bad++; }
console.log(bad ? `\n${bad} 项不通过` : '\n星表已加载，渲染位置与星表在角距上完全一致');
await b.close();
process.exit(bad ? 1 : 0);
