// 云层覆盖比例与边缘柔度的量化：云好不好看是主观的，但"是否硬边"和"云量多少"
// 是能测的。真实地球瞬时云量约六成（含大量薄云），且云的边缘必须是渐变的。
//
// 测法：近地满相视角截图 → 统计盘面上"白"像素占比 → 再看 alpha 的直方图，
// 硬边阈值化的特征是直方图在 0 和 1 两端堆成两根柱、中间几乎为空。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-cloud/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const tier of ['high', 'medium']) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 900, height: 700 });
  await p.goto(`http://127.0.0.1:4199/?clean=1&quality=${tier}`,
    { waitUntil: 'networkidle2', timeout: 150000 });
  await p.waitForFunction(() => {
    const x = document.getElementById('start-btn');
    return x && !x.disabled;
  }, { timeout: 90000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 8000));
  // 地球日下点近景：云铺满盘面
  await p.evaluate(() => {
    const g = window.__game;
    g.select('earth');
    g.orbitCam.init(g.orbitEnv, 'earth', 1.9);
    g.orbitCam.lat = 0.1;
    g.orbitCam.compute(g.orbitEnv);
  });
  await new Promise((r) => setTimeout(r, 10000));
  await p.screenshot({ path: `${OUT}${tier}.png` });

  // 读像素做直方图。
  // 不能在帧外读：WebGL 的 drawingBuffer 默认在合成后即被清空，
  // 用 2D 画布 drawImage 复制拿到的是全黑（第一次跑就得到"暗 100%"的假结果）。
  // 必须挂在渲染调用之后、同一帧内 readPixels。
  const stats = await p.evaluate(() => new Promise((res) => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const orig = g.composer.render.bind(g.composer);
    let done = false;
    g.composer.render = (...a) => {
      orig(...a);
      if (done) return;
      done = true;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const cx = w / 2, cy = h / 2;
      const rad = Math.min(w, h) * 0.30;      // 盘面内部取样半径
      let disk = 0, bright = 0, mid = 0, dark = 0;
      const hist = new Array(10).fill(0);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > rad * rad) continue;
          const i = (y * w + x) * 4;
          const lum = (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114) / 255;
          disk++;
          if (lum > 0.75) bright++; else if (lum > 0.35) mid++; else dark++;
          hist[Math.min(9, Math.floor(lum * 10))]++;
        }
      }
      g.composer.render = orig;
      res({ disk, bright, mid, dark, hist });
    };
  }));

  const pc = (n) => ((n / stats.disk) * 100).toFixed(1).padStart(5);
  console.log(`\n[${tier}] 盘面取样 ${stats.disk} 像素  错误 ${errs.length}`);
  console.log(`  亮(云) ${pc(stats.bright)}%   中(海/陆) ${pc(stats.mid)}%   暗 ${pc(stats.dark)}%`);
  console.log('  亮度直方图 0→1: ' + stats.hist.map((h) => ((h / stats.disk) * 100).toFixed(0).padStart(3)).join(' '));
  if (errs.length) console.log('  ✗ ' + errs[0]);
  await p.close();
}
await b.close();
console.log('\n截图:', OUT);
