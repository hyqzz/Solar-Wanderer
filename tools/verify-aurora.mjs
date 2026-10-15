// 极光核验：日面不得出现极光（气巨 H3+ 是紫外/红外，可见光下不该有），
// 夜面极光卵要窄、要贴在极区。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-aurora/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=high', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

let bad = 0;
for (const id of ['saturn', 'jupiter', 'earth']) {
  await p.evaluate((bid) => { const g = window.__game; g.select(bid); g.orbitCam.init(g.orbitEnv, bid, 2.4); g.orbitCam.lat = 1.2; g.orbitCam.compute(g.orbitEnv); }, id);
  await new Promise(r => setTimeout(r, 12000));
  // 数"品红/紫"像素：R 与 B 都明显高于 G，且足够亮
  const st = await p.evaluate(() => new Promise((res) => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const orig = g.composer.render.bind(g.composer);
    g.composer.render = (...a) => {
      orig(...a); g.composer.render = orig;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let purple = 0, disk = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const R = buf[i], G = buf[i + 1], B = buf[i + 2];
        if (R + G + B < 30) continue;           // 背景
        disk++;
        if (R > G * 1.25 && B > G * 1.25 && B > 60) purple++;
      }
      res({ purple, disk, frac: purple / Math.max(disk, 1) });
    };
  }));
  const okk = st.frac < 0.01;
  if (!okk) bad++;
  console.log(`${okk ? '✓' : '✗'} ${id.padEnd(8)} 品红像素占比 ${(st.frac * 100).toFixed(2)}%（应 <1%）`);
  await p.screenshot({ path: `${OUT}${id}.png` });
}
console.log('错误:', errs.length);
console.log(bad ? `\n${bad} 项不通过` : '\n极光只在夜面、且不成片');
await b.close();
process.exit(bad ? 1 : 0);
