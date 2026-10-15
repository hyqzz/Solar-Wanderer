import puppeteer from 'puppeteer';
const OUT = 'tools/.shot-tour/';
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
await ev(() => { window.__game.quality.detail = true; document.getElementById('directory')?.classList.remove('open'); });
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
async function settle(n = 5) { const m = await ev(() => window.__fc); const t0 = Date.now(); while (Date.now()-t0 < 20000) { await sleep(200); if ((await ev(() => window.__fc)) - m >= n) return; } }
const ss = await ev(() => {
  const b = window.__game.builder.bodies.get('earth');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const s = { x: -p[0]/l, y: -p[1]/l, z: -p[2]/l };
  const q = b.mesh.quaternion;
  const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
  const ix=qw*s.x+qy*s.z-qz*s.y, iy=qw*s.y+qz*s.x-qx*s.z, iz=qw*s.z+qx*s.y-qy*s.x, iw=-qx*s.x-qy*s.y-qz*s.z;
  const ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return { lat: Math.asin(Math.max(-1,Math.min(1,ly))), lon: Math.atan2(-lz, ix*qw+iw*-qx+iy*-qz-iz*-qy) };
});
// 找一处陆地：以日下点为中心，按角距由近及远扫描（保证落在白昼面，不越过晨昏线）
let lat = 26 * Math.PI / 180, lon = ss.lon;
outer:
for (const r of [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.0, 1.2]) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const la = lat + r * Math.sin(a), lo = lon + r * Math.cos(a) / Math.max(0.35, Math.cos(lat));
    const wet = await ev((la, lo) => {
      const V = Object.getPrototypeOf(window.__game.camera.position).constructor;
      return window.__game.terrainMgr.isWater('earth', new V(Math.cos(la)*Math.cos(-lo), Math.sin(la), Math.cos(la)*Math.sin(-lo)));
    }, la, lo);
    if (!wet) { lat = la; lon = lo; break outer; }
  }
}
console.log('land at lat/lon deg =', (lat*180/Math.PI).toFixed(1), (lon*180/Math.PI).toFixed(1));
await ev((lat, lon) => {
  const g = window.__game, oc = g.orbitCam;
  g.select('earth');
  oc.focusId='earth'; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.lat=lat; oc.lon=lon; oc.tilt=0; oc.heading=0;
  oc.dist = oc.distTarget = 6371 + 0.002;
}, lat, lon);
const t1 = Date.now();
while (Date.now() - t1 < 25000) { if (await ev(() => window.__game.terrainMgr.baseReady('earth'))) break; await sleep(500); }
for (let k = 0; k < 3 && (await ev(() => window.__game.getMode())) !== 'walk'; k++) {
  await ev((lat, lon) => {
    const g = window.__game, oc = g.orbitCam;
    if (g.getMode() === 'walk') return;
    const V = Object.getPrototypeOf(g.camera.position).constructor;
    const dir = new V(Math.cos(lat)*Math.cos(-lon), Math.sin(lat), Math.cos(lat)*Math.sin(-lon));
    oc.dist = oc.distTarget = g.terrainMgr.heightAt('earth', dir) + 0.002;
  }, lat, lon);
  await sleep(3000);
}
const t0 = Date.now();
while (Date.now() - t0 < 30000) { if ((await ev(() => window.__game.getMode())) === 'walk') break; await sleep(400); }
// 等地面沉降稳定
let prev = null, st = 0;
const ts = Date.now();
while (Date.now() - ts < 30000) {
  await sleep(400);
  const h = await ev(() => window.__game.ship.walk?.localPos.length() ?? null);
  if (h == null) continue;
  if (prev != null && Math.abs(h - prev) < 0.004) { if (!st) st = Date.now(); else if (Date.now() - st > 1200) break; }
  else st = 0;
  prev = h;
}
await ev(() => { const w = window.__game.ship.walk; if (w) w.pitch = 0.06; });
await settle(5);
console.log('walk state', JSON.stringify(await ev(() => ({ m: window.__game.getMode(), alt: +(window.__game.orbitCam.dist - 6371).toFixed(3) }))));
await page.screenshot({ path: OUT + '14-地球地表.png' });
await browser.close();
console.log('DONE');
