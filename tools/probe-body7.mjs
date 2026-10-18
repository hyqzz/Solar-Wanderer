// 单个天体在日下点 3R 的定妆照，可加 URL 开关（如 &noatmo=1&nofog=1）做对照。
// 用法: node tools/probe-body7.mjs <url> <bodyId> <out.png> [extraQuery]
import puppeteer from 'puppeteer';
const [url, bodyId, out, extra = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 720, height: 720 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1${extra}`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 12000));
await p.evaluate(async (bid) => {
  const g = window.__game, oc = g.orbitCam;
  const e = g.builder.bodies.get(bid);
  const q = e.mesh.quaternion.clone().invert();
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const L = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]) || 1;
  const loc = new V(-e.posKm[0] / L, -e.posKm[1] / L, -e.posKm[2] / L).applyQuaternion(q);
  g.select(bid); oc.focusId = bid; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.tilt = 0; oc.heading = 0;
  oc.lat = Math.asin(Math.max(-1, Math.min(1, loc.y)));
  oc.lon = Math.atan2(-loc.z, loc.x);
  oc.dist = oc.distTarget = e.phys.radiusKm * 3;
  await new Promise((r) => setTimeout(r, 3600));
}, bodyId);
await p.screenshot({ path: out });
console.log('写出', out);
await b.close();
