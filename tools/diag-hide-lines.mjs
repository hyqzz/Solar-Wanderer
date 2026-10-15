// 决定性测试：把场景里所有线/点对象整体隐藏，看那条点状弧是否消失。
// 之前逐个"关云/关大气/关地形"都被别的东西混淆了，直接从图元类型入手。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-line/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 8000));
await p.evaluate(() => {
  const g = window.__game;
  g.select('earth');
  g.orbitCam.init(g.orbitEnv, 'earth', 1.9);
  g.orbitCam.lat = 0.1;
  g.orbitCam.compute(g.orbitEnv);
});
await new Promise((r) => setTimeout(r, 10000));

// 先列出所有线/点对象，按可见性分组
const info = await p.evaluate(() => {
  const g = window.__game;
  let root = g.builder.bodies.get('earth').mesh;
  while (root.parent) root = root.parent;
  const vis = [], hid = [];
  root.traverse((o) => {
    if (o.isLine || o.isLineLoop || o.isLineSegments || o.isPoints) {
      const rec = `${o.type}${o.material?.isLineDashedMaterial ? '(虚线)' : ''} 顶点${o.geometry?.attributes?.position?.count}`;
      (o.visible ? vis : hid).push(rec);
    }
  });
  return { root: root.type, nVis: vis.length, nHid: hid.length, visSample: vis.slice(0, 12), hidSample: hid.slice(0, 6) };
});
console.log(`场景根 ${info.root}：可见线/点 ${info.nVis}，隐藏 ${info.nHid}`);
for (const s of info.visSample) console.log('   可见:', s);
for (const s of info.hidSample) console.log('   隐藏:', s);

// 隐藏全部线/点
const hidden = await p.evaluate(() => {
  const g = window.__game;
  let root = g.builder.bodies.get('earth').mesh;
  while (root.parent) root = root.parent;
  let n = 0;
  root.traverse((o) => {
    if ((o.isLine || o.isLineLoop || o.isLineSegments || o.isPoints) && o.visible) { o.visible = false; n++; }
  });
  return n;
});
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `${OUT}10-no-lines.png` });
console.log(`已隐藏 ${hidden} 个线/点对象 → 10-no-lines.png`);
await b.close();
