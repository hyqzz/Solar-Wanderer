import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.setViewport({ width: 900, height: 560 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
// 进入飞行模式
await p.click('canvas'); await new Promise(r=>setTimeout(r,300)); await p.keyboard.press('KeyF');
await new Promise(r=>setTimeout(r,1200));
// 拉远一点，让画面里有东西
await p.evaluate(() => { const g=window.__game, oc=g.orbitCam; g.select('earth'); oc.focusId='earth'; oc.dist=oc.distTarget=6371*2.2; });
await new Promise(r=>setTimeout(r,3000));
const st1 = await p.evaluate(() => ({ mode: window.__game.getMode() }));
await p.screenshot({ path: `${OUT}cockpit-first.png` });
// 切第三人称
await p.keyboard.press('KeyV');
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({ path: `${OUT}cockpit-third.png` });
const st2 = await p.evaluate(() => {
  let ck=null, sm=null;
  window.__game.camera.traverse?.(o=>{ if(o.userData?.isCockpit) ck=o.visible; });
  let root=window.__game.camera; while(root.parent) root=root.parent;
  root.traverse(o=>{ if(o.userData?.isShipModel) sm=o.visible; });
  return { cockpit: ck, ship: sm, camPos: window.__game.camera.position.toArray().map(v=>+(v*1000).toFixed(1)) };
});
console.log('飞行模式:', JSON.stringify(st1));
console.log('第三人称:', JSON.stringify(st2));
console.log('页面错误', errs.length, errs[0] ?? '');
await b.close();
