// 逐个天体在太空中的静态外观：日下点、3R 距离、满相。
// 目的：判断"一眼能不能认出这是什么星球"，而不是看整体亮度。
// 用法：node tools/probe-bodies.mjs <url> <outDir> [过滤]
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const url = process.argv[2] ?? 'http://127.0.0.1:4180';
const out = process.argv[3] ?? '.cmp/bodies/local';
const filter = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });

const b = await puppeteer.launch({ headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'] });
const p = await b.newPage();
await p.setViewport({ width: 720, height: 720 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 12000));

const ids = await p.evaluate(() => [...window.__game.builder.bodies.keys()].filter((k) => k !== 'sun'));
console.log('天体数', ids.length, ids.join(' '));

for (const id of ids) {
  if (filter && !id.includes(filter)) continue;
  const ok = await p.evaluate(async (bid) => {
    const g = window.__game, oc = g.orbitCam;
    const e = g.builder.bodies.get(bid);
    if (!e) return false;
    // 日下点方向（体固系）
    const q = e.mesh.quaternion.clone().invert();
    const V = Object.getPrototypeOf(g.camera.position).constructor;
    const L = Math.hypot(...e.posKm) || 1;
    const toSun = new V(-e.posKm[0] / L, -e.posKm[1] / L, -e.posKm[2] / L);
    const local = toSun.applyQuaternion(q);
    const lat = Math.asin(Math.max(-1, Math.min(1, local.y)));
    const lon = Math.atan2(-local.z, local.x);
    g.select(bid);
    oc.focusId = bid; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.tilt = 0; oc.heading = 0;
    oc.lat = lat; oc.lon = lon;
    oc.dist = oc.distTarget = e.phys.radiusKm * 3;
    await new Promise((r) => setTimeout(r, 3200));
    return true;
  }, id);
  if (!ok) { console.log('跳过', id); continue; }
  await p.screenshot({ path: `${out}/${id}.png` });
  console.log('拍完', id);
}
await b.close();
