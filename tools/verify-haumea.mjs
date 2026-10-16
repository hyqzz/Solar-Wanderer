// 妊神星形状核验：渲染出的网格缩放应等于半轴/几何半径之比，
// 且长短轴比显著大于 1（画成正球就白改了）。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-haumea/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 800, height: 600 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

const st = await p.evaluate(() => {
  const t = window.__game.tnoScene;
  const out = {};
  for (const [id, e] of t.entries) {
    const g = e.mesh.geometry.parameters;
    out[id] = {
      R: g.radius,
      scale: [+e.mesh.scale.x.toFixed(4), +e.mesh.scale.y.toFixed(4), +e.mesh.scale.z.toFixed(4)],
      axesKm: [e.mesh.scale.x * g.radius, e.mesh.scale.y * g.radius, e.mesh.scale.z * g.radius]
        .map(v => +v.toFixed(0)),
    };
  }
  return out;
});
const h = st.haumea;
console.log('妊神星：几何半径', h.R.toFixed(0), 'km  缩放', JSON.stringify(h.scale));
console.log('        实际半轴', JSON.stringify(h.axesKm), 'km（期望 [1161,513,852]：Y 为极轴取短轴）');
const okA = Math.abs(h.axesKm[0] - 1161) < 2 && Math.abs(h.axesKm[1] - 513) < 2 && Math.abs(h.axesKm[2] - 852) < 2;
console.log(okA ? '✓ 三轴与实测半轴一致' : '✗ 三轴不符');
const others = Object.entries(st).filter(([id]) => id !== 'haumea');
const allSphere = others.every(([, v]) => v.scale[0] === 1 && v.scale[1] === 1 && v.scale[2] === 1);
console.log(allSphere ? `✓ 其余 ${others.length} 颗保持正球` : '✗ 有别的天体被改了形状');

// 飞到妊神星拍一张
await p.evaluate(() => {
  const g = window.__game;
  g.select('haumea');
  g.orbitCam.init(g.orbitEnv, 'haumea', 3.0);
  g.orbitCam.compute(g.orbitEnv);
});
await new Promise(r => setTimeout(r, 10000));
await p.screenshot({ path: `${OUT}haumea.png` });
console.log('错误:', errs.length);
await b.close();
process.exit(okA && allSphere && !errs.length ? 0 : 1);
