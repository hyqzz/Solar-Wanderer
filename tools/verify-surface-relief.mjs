// 核验"贴图特征与地形起伏相关联"：在非 DEM 天体上，把贴图亮的点与实地高的点
// 做相关性统计——关联生效后相关系数应显著为正，此前应接近 0（纯随机）。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-relief/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 800, height: 600 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 9000));

// 对若干非 DEM 天体，随机取方向，比较"贴图高通值"与"该处地形相对基准球的高度"
const stat = await p.evaluate(() => {
  const g = window.__game;
  const out = {};
  for (const id of ['europa', 'ganymede', 'callisto', 'titan', 'enceladus', 'miranda', 'trition']) {
    let f;
    try { f = g.terrainMgr.field(id); } catch { continue; }
    if (!f || !f.map) { out[id] = null; continue; }
    if (f.demSource) { out[id] = 'has-dem'; continue; }
    // 确定性伪随机方向
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const xs = [], ys = [];
    for (let i = 0; i < 900; i++) {
      const z = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      const d = { x: r * Math.cos(ph), y: z, z: r * Math.sin(ph) };
      const a = f._albedoReliefAt(d);
      const hh = f.height(d);
      const base = f.baseRadius(d);
      xs.push(a); ys.push(hh - base);
    }
    const mean = (v) => v.reduce((p, c) => p + c, 0) / v.length;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { const dx = xs[i]-mx, dy = ys[i]-my; sxy += dx*dy; sxx += dx*dx; syy += dy*dy; }
    out[id] = +(sxy / Math.sqrt(sxx * syy || 1e-9)).toFixed(3);
  }
  return out;
});
console.log('贴图亮度 ↔ 地形高度 的相关系数（非 DEM 天体）：');
let bad = 0;
for (const [id, r] of Object.entries(stat)) {
  if (r === null) { console.log(`  ${id.padEnd(10)} 无贴图，跳过`); continue; }
  if (r === 'has-dem') { console.log(`  ${id.padEnd(10)} 有 DEM，不适用`); continue; }
  const ok = r > 0.25;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${id.padEnd(10)} r = ${r}`);
}
console.log('错误:', errs.length);
await b.close();
process.exit(bad ? 1 : 0);
