// 云层自定义 LOD 的回归：既要确认近景的反经线点阵已消失，也要确认远景缩小时
// 没有因为"自己算的足迹"而走样（自算 LOD 最典型的翻车方式就是远处云层闪烁/摩尔纹）。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-cloud/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// 读回盘面像素，统计两件事：
//  · 高频噪声能量：走样会显著抬高相邻像素差（摩尔纹/闪烁的量化指标）
//  · 反经线点阵：沿一条竖直扫描线找"孤立亮点"
const shoot = async (tier, dist, tag) => {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 900, height: 700 });
  await p.goto(`http://127.0.0.1:4199/?clean=1&quality=${tier}`, { waitUntil: 'networkidle2', timeout: 150000 });
  await p.waitForFunction(() => {
    const x = document.getElementById('start-btn');
    return x && !x.disabled;
  }, { timeout: 90000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 8000));
  await p.evaluate((d) => {
    const g = window.__game;
    g.select('earth');
    g.orbitCam.init(g.orbitEnv, 'earth', d);
    g.orbitCam.lat = 0.1;
    g.orbitCam.compute(g.orbitEnv);
  }, dist);
  await new Promise((r) => setTimeout(r, 10000));
  await p.screenshot({ path: `${OUT}lod-${tag}.png` });

  const st = await p.evaluate(() => new Promise((res) => {
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
      // 高频能量：盘面内相邻像素差的均值（走样会把它抬高）
      let sum = 0, n = 0;
      for (let y = 120; y < h - 120; y++) {
        for (let x = 200; x < w - 200; x++) {
          sum += Math.abs(L(x + 1, y) - L(x, y)); n++;
        }
      }
      // 孤立亮点（点阵）
      let specks = 0;
      for (let y = 60; y < h - 60; y++) {
        for (let x = 60; x < w - 60; x++) {
          const c = L(x, y);
          if (c < 0.35) continue;
          if (c - L(x - 6, y) > 0.045 && c - L(x + 6, y) > 0.045 &&
              c - L(x, y - 6) > 0.045 && c - L(x, y + 6) > 0.045) specks++;
        }
      }
      res({ hf: sum / n, specks });
    };
  }));
  console.log(`${tag.padEnd(16)} 高频能量 ${st.hf.toFixed(4)}   孤立亮点 ${String(st.specks).padStart(5)}   错误 ${errs.length}`);
  await p.close();
  return st;
};

for (const [tier, dist, tag] of [
  ['medium', 1.9, 'medium-near'],
  ['medium', 4.5, 'medium-mid'],
  ['medium', 25, 'medium-far'],
  ['high', 1.9, 'high-near'],
  ['high', 25, 'high-far'],
]) await shoot(tier, dist, tag);

await b.close();
console.log('截图:', OUT);
