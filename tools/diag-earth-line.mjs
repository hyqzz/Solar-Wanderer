// 诊断：地球近景盘面上有一条等距点状的细亮线（行星没遮挡它 / 或它就在云层上）。
//
// 关键教训：第一版把"关云 → 关大气 → 关地形"写成累积步骤，于是只有第一张有信息量，
// 后面几张全是"云已关"的状态，白白得出"关地形也没了"的假结论。
// 现在每一层都在**独立的新页面**里单独关闭。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-line/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const CASES = [
  ['00-baseline', () => {}],
  ['01-no-clouds', () => { const e = window.__game.builder.bodies.get('earth'); if (e.cloudMesh) e.cloudMesh.visible = false; }],
  ['02-no-atmo', () => { const e = window.__game.builder.bodies.get('earth'); if (e.atmoMesh) e.atmoMesh.visible = false; }],
  ['03-no-terrain', () => { const e = window.__game.builder.bodies.get('earth'); if (e.terrain) e.terrain.visible = false; window.__game.terrainMgr?.setEnabled?.(false); }],
  ['04-no-orbits', () => { window.__game.setOrbitLinesVisible(false); }],
];

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const [name, apply] of CASES) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
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
  await p.evaluate(apply);
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${OUT}${name}.png` });

  // 沿那条弧取样：统计"比邻域亮"的孤立亮点数量——点阵在时这个数会明显偏高
  const specks = await p.evaluate(() => new Promise((res) => {
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
      // 只在盘面内部找：亮于左右 6 像素邻域均值 0.045 以上的孤立点
      let n = 0;
      for (let y = 60; y < h - 60; y += 1) {
        for (let x = 60; x < w - 60; x += 1) {
          const c = L(x, y);
          if (c < 0.35) continue;
          if (c - L(x - 6, y) > 0.045 && c - L(x + 6, y) > 0.045 &&
              c - L(x, y - 6) > 0.045 && c - L(x, y + 6) > 0.045) n++;
        }
      }
      res(n);
    };
  }));
  console.log(`${name.padEnd(14)} 孤立亮点 ${String(specks).padStart(5)}   错误 ${errs.length}`);
  await p.close();
}
await b.close();
console.log('截图:', OUT);
