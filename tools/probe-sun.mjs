import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const url = process.argv[2], out = process.argv[3];
mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 720, height: 720 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 12000));
for (const [name, mul] of [['sun-3R', 3], ['sun-6R', 6], ['sun-20R', 20]]) {
  await p.evaluate((m) => {
    const g = window.__game, oc = g.orbitCam;
    g.select('sun'); oc.focusId = 'sun'; oc.flight = null; oc.panOffset.set(0,0,0);
    oc.tilt = 0; oc.heading = 0; oc.lat = 0; oc.lon = 0;
    oc.dist = oc.distTarget = 696000 * m;
  }, mul);
  await new Promise((r) => setTimeout(r, 3800));
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log('拍完', name);
}
await b.close();
