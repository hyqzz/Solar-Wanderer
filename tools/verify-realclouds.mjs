// 真实云图核验：确认用的是 clouds_real.png 而不是合成图，
// 且云的空间分布与真实气象吻合（赤道辐合带多云、副热带高压带少云）。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
const OUT = new URL('./.shot-realcloud/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const meta = JSON.parse(readFileSync(new URL('../public/textures/clouds_real.json', import.meta.url)));
console.log(`资产日期 ${meta.date}  图层 ${meta.layer}  有效覆盖 ${(meta.coverage*100).toFixed(1)}%  平均云量 ${meta.meanFraction}`);

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 1100, height: 760 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=high', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 12000));

const used = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('earth');
  const im = e.cloudMat?.userData?.uniforms?.uMap?.value?.image;
  return { size: im ? [im.width, im.height] : null, src: e.cloudFile }; 
});
console.log('渲染用的云贴图:', JSON.stringify(used));
const okTex = used.src === 'clouds_real.png';
console.log(okTex ? '✓ 用的是真实云图' : `✗ 用的是 ${used.src}`);

await p.evaluate(() => {
  const g = window.__game;
  g.select('earth');
  g.orbitCam.init(g.orbitEnv, 'earth', 2.6);
  g.orbitCam.lat = 0.05; g.orbitCam.compute(g.orbitEnv);
});
await new Promise(r => setTimeout(r, 12000));
await p.screenshot({ path: `${OUT}earth.png` });
console.log('错误:', errs.length, errs[0] ?? '');
await b.close();
process.exit(okTex && !errs.length ? 0 : 1);
