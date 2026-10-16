// 环系光度核验：Seeliger 定律的视角依赖 + 冲日增亮。
// 判据：同一机位下（相位角固定）沿环面径向（仰角不变）亮度应平滑；
// 改变观察仰角时 seeliger = μ0/(μ0+μ) 单调变化、相位角趋零时增亮。
//
// 直接量"环上一点"的亮度随相位角的变化：把相机绕到不同相位角、保持距离。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-ring/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 700, height: 500 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

// 取环系中心区域的均亮（环 + 行星；用环最厚处的外侧环带来比）
const ringLum = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // 画面下半部（环系通常在盘面下方展开）取中位亮度，避开行星本体的高亮
    const v = [];
    for (let y = Math.floor(h*0.62); y < Math.floor(h*0.92); y++)
      for (let x = Math.floor(w*0.1); x < Math.floor(w*0.9); x++) {
        const i = ((h - 1 - y) * w + x) * 4;
        const L = (buf[i] + buf[i+1] + buf[i+2]) / 3;
        if (L > 4) v.push(L);
      }
    v.sort((a, c) => a - c);
    res(v.length ? v[Math.floor(v.length / 2)] : 0);
  };
}));

const shots = [];
for (const [lat, label] of [[0.0, 'low'], [0.6, 'high']]) {
  await p.evaluate((la) => {
    const g = window.__game;
    g.select('saturn');
    g.orbitCam.init(g.orbitEnv, 'saturn', 3.4);
    g.orbitCam.lat = la; g.orbitCam.lon = 0.4;
    g.orbitCam.compute(g.orbitEnv);
  }, lat);
  await new Promise(r => setTimeout(r, 11000));
  const L = await ringLum();
  await p.screenshot({ path: OUT + 'ring-' + label + '.png' });
  shots.push({ label, L });
  console.log(`${label.padEnd(10)} 环区中位亮度 ${L.toFixed(1)}`);
}
console.log('错误:', errs.length, errs[0] ?? '');
await b.close();
