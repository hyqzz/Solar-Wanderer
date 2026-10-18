import puppeteer from 'puppeteer';
const url = process.argv[2] ?? 'http://127.0.0.1:4180';
const extra = process.argv[3] ?? '';
const out = process.argv[4] ?? '.cmp/jup-test.png';
const BODY = process.argv[5] ?? 'jupiter';
const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 720, height: 720 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1${extra}`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 12000));
await p.evaluate(async (BID) => {
  const g = window.__game, oc = g.orbitCam, e = g.builder.bodies.get(BID);
  const q = e.mesh.quaternion.clone().invert();
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const L = Math.hypot(...e.posKm) || 1;
  const local = new V(-e.posKm[0]/L, -e.posKm[1]/L, -e.posKm[2]/L).applyQuaternion(q);
  g.select(BID); oc.focusId=BID; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.tilt=0; oc.heading=0;
  oc.lat = Math.asin(Math.max(-1,Math.min(1,local.y)));
  oc.lon = Math.atan2(-local.z, local.x);
  oc.dist = oc.distTarget = e.phys.radiusKm * 3;
  await new Promise(r => setTimeout(r, 3500));
});
await p.screenshot({ path: out });
console.log('写出', out);
await b.close();
