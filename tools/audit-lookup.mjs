// 验证"站在地面抬头看天"这一机位：为什么审计里所有 *-ground-up 都退回地球轨道。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 960, height: 600 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

const st = () => p.evaluate(() => {
  const g = window.__game;
  const w = g.ship?.walk;
  return {
    mode: g.getMode(), focus: g.orbitCam.focusId,
    pitch: w ? +w.pitch.toFixed(3) : null, yaw: w ? +w.yaw.toFixed(3) : null,
    dist: +g.orbitCam.dist.toFixed(4), lat: +(g.orbitCam.lat * 180 / Math.PI).toFixed(2),
  };
});

console.log('初始:', JSON.stringify(await st()));

// 直接落到火星，不靠自动登陆
const ss = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('mars');
  const q = e.mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  const v = { x: -pos[0] / L, y: -pos[1] / L, z: -pos[2] / L };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z, iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx), R: e.phys.radiusKm };
});
await p.evaluate((m) => {
  const g = window.__game, oc = g.orbitCam;
  g.select('mars');
  oc.focusId = 'mars'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.tilt = 0; oc.heading = 0; oc.lat = m.lat; oc.lon = m.lon;
  oc.dist = oc.distTarget = m.R + 0.002;
}, ss);
for (let i = 0; i < 70; i++) { if (await p.evaluate(() => window.__game.terrainMgr.baseReady('mars'))) break; await new Promise((r) => setTimeout(r, 500)); }
await p.evaluate((m) => {
  const g = window.__game, oc = g.orbitCam;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const L = 18 * Math.PI / 180;
  const dir = new V(Math.cos(L) * Math.cos(-m.lon), Math.sin(L), Math.cos(L) * Math.sin(-m.lon));
  oc.dist = oc.distTarget = g.terrainMgr.heightAt('mars', dir) + 0.002;
}, ss);
for (let i = 0; i < 70; i++) { if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break; await new Promise((r) => setTimeout(r, 500)); }
await new Promise((r) => setTimeout(r, 8000));
console.log('落地后:', JSON.stringify(await st()));

for (const pitch of [0.05, 0.4, 0.8, 1.15, 1.45]) {
  await p.evaluate((pi) => { const w = window.__game.ship.walk; if (w) { w.pitch = pi; w.yaw = 0; } }, pitch);
  await new Promise((r) => setTimeout(r, 4000));
  const s = await st();
  console.log(`pitch=${pitch}  →`, JSON.stringify(s));
  await p.screenshot({ path: `${OUT}lookup-mars-${String(pitch).replace('.', '_')}.png` });
}

// 再看：抬头时用滚轮/键能不能起飞
await p.evaluate(() => { const w = window.__game.ship.walk; if (w) w.pitch = 1.2; });
await new Promise((r) => setTimeout(r, 2000));
await p.evaluate(() => { window.__game.orbitCam.dist = window.__game.orbitCam.distTarget = 5000; });
await new Promise((r) => setTimeout(r, 6000));
console.log('手动拉远后:', JSON.stringify(await st()));

console.log('页面错误', errs.length, errs.slice(0, 3));
await b.close();
