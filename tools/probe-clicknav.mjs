// 真实鼠标点击一颗行星，看是否触发飞行动画。
import puppeteer from 'puppeteer';
const url = process.argv[2] ?? 'http://127.0.0.1:4180';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 600 });
await p.goto(`${url}/?quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 10000));
// 以太阳为中心拉远到 4AU，让地球与木星都在画面内
await p.evaluate(() => {
  const g = window.__game, oc = g.orbitCam;
  g.select('sun'); oc.focusId = 'sun'; oc.flight = null;
  oc.dist = oc.distTarget = 1.496e8 * 4; oc.lat = 0.1; oc.lon = 0;
});
await new Promise((r) => setTimeout(r, 2500));
const pos = await p.evaluate(() => {
  const g = window.__game;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const e = g.builder.bodies.get('jupiter');
  const rel = new V(e.posKm[0], e.posKm[1], e.posKm[2]); // 相机在原点
  const ndc = rel.clone().project(g.camera);
  return { x: Math.round((ndc.x + 1) / 2 * window.innerWidth), y: Math.round((1 - ndc.y) / 2 * window.innerHeight),
           onScreen: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 };
});
console.log(url, '木星屏幕坐标', JSON.stringify(pos));
if (!pos.onScreen) { console.log('木星不在画面内，测试跳过'); await b.close(); process.exit(0); }
await p.mouse.click(pos.x, pos.y);
await new Promise((r) => setTimeout(r, 1200));
const after = await p.evaluate(() => {
  const oc = window.__game.orbitCam;
  return { focus: oc.focusId, pending: oc.pendingFocusId ?? null, flight: !!oc.flight, dist: Math.round(oc.dist) };
});
console.log('  单击后 1.2s:', JSON.stringify(after));
await p.mouse.click(pos.x, pos.y, { clickCount: 2 });
await new Promise((r) => setTimeout(r, 1500));
const after2 = await p.evaluate(() => {
  const oc = window.__game.orbitCam;
  return { focus: oc.focusId, pending: oc.pendingFocusId ?? null, flight: !!oc.flight, dist: Math.round(oc.dist) };
});
console.log('  双击后 1.5s:', JSON.stringify(after2));
await b.close();
