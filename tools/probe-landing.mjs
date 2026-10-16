// 在任意天体上降落并拍地表（用于判断"逼真感"）。用法：node tools/probe-landing.mjs <id> [latDeg]
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-land/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const id = process.argv[2] ?? 'europa';
const latDeg = Number(process.argv[3] ?? 20);
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 640 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 9000));

const ss = await p.evaluate((bid) => {
  const e = window.__game.builder.bodies.get(bid)
    ?? [...window.__game.registry.values()].find(t => t.id === bid);
  const R = e?.phys?.radiusKm ?? e?.radiusKm ?? 1000;
  const mesh = e?.mesh ?? e?.relObj;
  const q = mesh?.quaternion ?? { x:0,y:0,z:0,w:1 };
  const pos = e?.posKm ?? [0,0,0];
  const L = Math.hypot(pos[0],pos[1],pos[2]) || 1;
  const v = { x: -pos[0]/L, y: -pos[1]/L, z: -pos[2]/L };
  const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
  const ix = qw*v.x + qy*v.z - qz*v.y, iy = qw*v.y + qz*v.x - qx*v.z, iz = qw*v.z + qx*v.y - qy*v.x;
  const iw = -qx*v.x - qy*v.y - qz*v.z;
  const lx = ix*qw + iw*-qx + iy*-qz - iz*-qy;
  const ly = iy*qw + iw*-qy + iz*-qx - ix*-qz;
  const lz = iz*qw + iw*-qz + ix*-qy - iy*-qx;
  return { lat: Math.asin(Math.max(-1,Math.min(1,ly))), lon: Math.atan2(-lz,lx), R };
}, id);

await p.evaluate((m, bid) => {
  const g = window.__game, oc = g.orbitCam;
  g.select(bid);
  oc.focusId = bid; oc.flight = null; oc.panOffset.set(0,0,0);
  oc.lat = m.lat; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = m.R + 0.002;
}, ss, id);
for (let i = 0; i < 70; i++) {
  if (await p.evaluate((bid) => window.__game.terrainMgr.baseReady(bid), id)) break;
  await new Promise(r => setTimeout(r, 500));
}
await p.evaluate((m, bid, la) => {
  const g = window.__game, oc = g.orbitCam;
  if (g.getMode() !== 'orbit' || oc.focusId !== bid) return;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const L = la * Math.PI / 180;
  const dir = new V(Math.cos(L)*Math.cos(-m.lon), Math.sin(L), Math.cos(L)*Math.sin(-m.lon));
  oc.dist = oc.distTarget = g.terrainMgr.heightAt(bid, dir) + 0.002;
}, ss, id, latDeg);
for (let i = 0; i < 70; i++) {
  if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break;
  await new Promise(r => setTimeout(r, 500));
}
const mode = await p.evaluate(() => window.__game.getMode());
await new Promise(r => setTimeout(r, 9000));
await p.evaluate(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 0.05; w.yaw = 0; } });
await new Promise(r => setTimeout(r, 3000));
await p.screenshot({ path: `${OUT}${id}-horizon.png` });
await p.evaluate(() => { const w = window.__game.ship.walk; if (w) w.pitch = 1.1; });
await new Promise(r => setTimeout(r, 2500));
await p.screenshot({ path: `${OUT}${id}-up.png` });
console.log(`${id}: ${mode}  错误 ${errs.length} ${errs[0] ?? ''}`);
await b.close();
