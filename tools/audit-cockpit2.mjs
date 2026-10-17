import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 560 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
await p.click('canvas'); await new Promise(r=>setTimeout(r,300)); await p.keyboard.press('KeyF');
await new Promise(r=>setTimeout(r,1500));
const info = await p.evaluate(() => {
  const g = window.__game, cam = g.camera;
  const ck = cam.children.find(o => o.userData?.isCockpit);
  const out = { mode: g.getMode(), camChildren: cam.children.length, camPos: cam.position.toArray().map(v=>+v.toFixed(6)),
    camScale: cam.scale.toArray(), near: cam.near, far: cam.far };
  if (ck) {
    out.ck = { visible: ck.visible, pos: ck.position.toArray(), scale: ck.scale.x,
      children: ck.children.length, inScene: !!ck.parent };
    // 第一根框条的包围球
    const m = ck.children[0];
    if (m) { m.geometry.computeBoundingSphere();
      out.bar = { bs: { c: m.geometry.boundingSphere.center.toArray(), r: m.geometry.boundingSphere.radius },
                  worldPos: (()=>{ const v = new (Object.getPrototypeOf(cam.position).constructor)(); m.getWorldPosition(v); return v.toArray().map(x=>+x.toFixed(6)); })() }; }
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await b.close();
