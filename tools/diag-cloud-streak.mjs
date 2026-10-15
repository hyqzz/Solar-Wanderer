// 细亮条带的定位：它是固定在屏幕上、固定在行星某条经线上，还是随几何变化？
// 已排除：几何滑片（换 96/40/160 分段都在，且最小三角形面积 3219 km² 无退化）。
// 现在让地球自转，看条带是否跟着地表走。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-streak/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=high', { waitUntil: 'networkidle2', timeout: 150000 });
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
await new Promise((r) => setTimeout(r, 25000));
await p.screenshot({ path: `${OUT}20-t0.png` });

// 找到那条亮带：在盘面内找"比左右邻域亮很多"的窄峰，报告其屏幕坐标
const findStreak = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a);
    g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const L = (x, y) => {
      const i = ((h - 1 - y) * w + x) * 4;
      return (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114) / 255;
    };
    let best = null;
    for (let y = 100; y < h - 100; y++) {
      for (let x = 100; x < w - 100; x++) {
        const c = L(x, y);
        if (c < 0.35) continue;
        const d = Math.min(c - L(x - 5, y), c - L(x + 5, y), c - L(x, y - 5), c - L(x, y + 5));
        if (!best || d > best.d) best = { x, y, c: +c.toFixed(3), d: +d.toFixed(3) };
      }
    }
    res(best);
  };
}));

const a = await findStreak();
console.log('t=0   最亮点:', JSON.stringify(a));

// 推进时间：地球自转，条带若跟着地表走就说明它挂在行星经度上
await p.evaluate(() => {
  const g = window.__game;
  g.simClock?.setWarp?.(3600) ?? null;
  if (g.simClock) g.simClock.warp = 3600;
});
await new Promise((r) => setTimeout(r, 25000));
await p.screenshot({ path: `${OUT}21-t1.png` });
const c = await findStreak();
console.log('t=+1h 最亮点:', JSON.stringify(c));
console.log('位移:', a && c ? Math.hypot(c.x - a.x, c.y - a.y).toFixed(1) + ' px' : 'n/a');
console.log('错误:', errs.length);
await b.close();
