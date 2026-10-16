// 太阳黑子应随活动周期变化：极小年几乎无黑子，极大年成群。
//
// 测量要点：只看**盘心**区域。第一版统计全屏"暗像素"，把临边昏暗（整圈变暗的
// 日面边缘）也算成了黑子，于是极小区与极大区都是 4.7%，看起来"没有变化"——
// 而实际上信号被边缘淹没了。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-sunspot/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

const centralDark = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // 先求日面外接范围（亮度 > 200 的像素）
    let minX = w, maxX = 0, minY = h, maxY = 0;
    const L = (x, y) => { const i = ((h - 1 - y) * w + x) * 4; return (buf[i] + buf[i+1] + buf[i+2]) / 3; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (L(x, y) > 220) { if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const R = Math.min(maxX - minX, maxY - minY) / 2;
    let n = 0, dark = 0, mean = 0;
    for (let y = Math.floor(cy - R*0.5); y <= Math.ceil(cy + R*0.5); y++) {
      for (let x = Math.floor(cx - R*0.5); x <= Math.ceil(cx + R*0.5); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy > (R*0.5)*(R*0.5)) continue;
        const l = L(x, y); n++; mean += l;
        // 阈值要卡在真黑子上：盘心颗粒度本身就让约 2/3 的像素低于 235，
        // 用 235 当判据信号会被淹没（实测极小区/极大区都是 65%，看着像没变化）。
        // 黑子被压暗 75%，落在 100 以下。
        if (l < 180) dark++;
      }
    }
    res({ n, dark, frac: dark / Math.max(n, 1), mean: mean / Math.max(n, 1), R });
  };
}));

const shoot = async (year, name, expect) => {
  await p.evaluate((y) => {
    const g = window.__game;
    g.select('sun');
    g.orbitCam.init(g.orbitEnv, 'sun', 3.2);
    g.simClock.set(2451545.0 + (y - 2000) * 365.25);
    g.simClock.rate = 0;
  }, year);
  await new Promise(r => setTimeout(r, 9000));
  const act = await p.evaluate(() => window.__game.builder.sunEntry.uniforms.uSolarActivity.value);
  const st = await centralDark();
  await p.screenshot({ path: `${OUT}${name}.png` });
  console.log(`${name.padEnd(12)} 预期 ${expect.toFixed(3)} 着色器 ${Number(act).toFixed(3)}   盘心均亮 ${st.mean.toFixed(1)}  黑子覆盖 ${(st.frac*100).toFixed(2)}%`);
  return st.frac;
};

const lo = await shoot(2019.9, 'min-2019', 0.05);
const hi = await shoot(2024.9, 'max-2024', 0.715);
console.log('错误:', errs.length);
const ok = hi > lo * 1.5;
console.log(ok ? '\n极大年黑子显著多于极小年' : `\n✗ 差异不足（${(hi*100).toFixed(2)}% vs ${(lo*100).toFixed(2)}%）`);
await b.close();
process.exit(ok ? 0 : 1);
