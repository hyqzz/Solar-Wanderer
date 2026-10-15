import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox','--window-position=-2400,-2400','--window-size=1280,760','--hide-scrollbars'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(() => {
  const o = window.matchMedia.bind(window);
  window.matchMedia = (q) => /pointer\s*:\s*coarse/.test(q) ? { matches:false, addEventListener(){}, addListener(){} } : /any-pointer\s*:\s*fine/.test(q) ? { matches:true, addEventListener(){}, addListener(){} } : o(q);
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
const ss = await ev(() => {
  const b = window.__game.builder.bodies.get('mars');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const s = { x: -p[0]/l, y: -p[1]/l, z: -p[2]/l };
  const q = b.mesh.quaternion;
  const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
  const ix=qw*s.x+qy*s.z-qz*s.y, iy=qw*s.y+qz*s.x-qx*s.z, iz=qw*s.z+qx*s.y-qy*s.x, iw=-qx*s.x-qy*s.y-qz*s.z;
  const ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return { lat: Math.asin(Math.max(-1,Math.min(1,ly))), lon: Math.atan2(-lz, ix*qw+iw*-qx+iy*-qz-iz*-qy) };
});
await ev((ss) => {
  const g = window.__game, oc = g.orbitCam;
  g.select('mars');
  oc.focusId='mars'; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.lat=ss.lat*0.8; oc.lon=ss.lon; oc.tilt=0.42; oc.heading=0;
  oc.dist=oc.distTarget=3389.5+200;
}, ss);
await sleep(12000);
const info = await ev(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('mars');
  const u = e.mat.userData.uniforms;
  const a = g.terrainMgr.active;
  const f = g.terrainMgr.field('mars');
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const dir = new V(0,0,-1).applyQuaternion(g.camera.quaternion).add(g.camera.position).normalize();
  const sp = f.sampleMap(dir);
  const col = { setRGB(r,gg,b){this.r=r;this.g=gg;this.b=b;return this;} };
  const inner = new V(0,0,-1).applyQuaternion(g.camera.quaternion);
  f.color(inner.normalize(), f.height(inner.normalize()), 0.2, col);
  return {
    uLs: u.uLs?.value, uDetailMode: u.uDetailMode?.value, uSunI: +u.uSunI.value.toFixed(3),
    uGrade: u.uGrade?.value?.toArray?.().map(v=>+v.toFixed(2)), uSat: u.uSat?.value,
    mapSample: sp, terrainColor: [+col.r.toFixed(3), +col.g.toFixed(3), +col.b.toFixed(3)],
    palette: f.sp.palette, ampKm: f.sp.ampKm, levels: a?.patches.levels.length,
  };
});
console.log(JSON.stringify(info));
await browser.close();
