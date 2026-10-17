import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 560 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
await p.click('canvas'); await new Promise(r=>setTimeout(r,300)); await p.keyboard.press('KeyF');
await new Promise(r=>setTimeout(r,2500));
const info = await p.evaluate(() => {
  const g = window.__game, ck = g.cockpit, cam = g.overlayCam;
  const halfH = Math.tan(cam.fov*Math.PI/360)*0.62;
  return {
    fov: cam.fov, aspect: +cam.aspect.toFixed(3), halfH: +halfH.toFixed(3), halfW: +(halfH*cam.aspect).toFixed(3),
    camPos: cam.position.toArray(), camQ: cam.quaternion.toArray().map(v=>+v.toFixed(3)),
    ckVisible: ck.visible, ckScale: ck.scale.x,
    bars: ck.children.slice(0,4).map(o=>({ p:o.position.toArray().map(v=>+v.toFixed(3)), s:o.scale.toArray().map(v=>+v.toFixed(2)) })),
    childCount: ck.children.length,
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
