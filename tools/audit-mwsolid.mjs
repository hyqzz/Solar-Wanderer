import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 560 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium&pr=1', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
await p.evaluate(() => { const g=window.__game, oc=g.orbitCam; g.select('earth'); oc.focusId='earth'; oc.dist=oc.distTarget=6371*3.2; });
await new Promise(r=>setTimeout(r,6000));
await p.evaluate(() => {
  const mesh = window.__game.sky.group.children[0];
  mesh.material.map = null;
  mesh.material.color.setHex(0x2a3340);
  mesh.material.needsUpdate = true;
});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({ path: `${OUT}mw-solid.png` });
const v = await p.evaluate(() => {
  const g = window.__game, gl = g.renderer.getContext();
  return { pr: g.renderer.getPixelRatio(), buf: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
});
console.log(JSON.stringify(v));
await b.close();
