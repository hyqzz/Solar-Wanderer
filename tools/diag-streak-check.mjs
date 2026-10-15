// 条带是否消失：同页同一机位，High 档，云开/云关各一张
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-streak/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=high', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));
await p.evaluate(() => { const g = window.__game; g.select('earth'); g.orbitCam.init(g.orbitEnv,'earth',1.9); g.orbitCam.lat=0.1; g.orbitCam.compute(g.orbitEnv); });
await new Promise(r => setTimeout(r, 28000));
await p.screenshot({ path: `${OUT}30-fixed.png` });
console.log('错误:', errs.length);
await b.close();
