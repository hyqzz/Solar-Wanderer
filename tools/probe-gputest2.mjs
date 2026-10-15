// 一次性诊断：真实 GPU 下等地形淡入收敛后，检查各地体多高度是否仍有地形瓦片接缝
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
mkdirSync('tools/.shot-surface', { recursive: true });

const HEADED = process.argv.includes('--gpu');
const browser = await puppeteer.launch({
  headless: !HEADED,
  args: [
    '--no-sandbox',
    ...(HEADED ? ['--window-position=-2400,-2400', '--window-size=1280,760'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--hide-scrollbars',
  ],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
console.log('RENDERER:', await ev(() => {
  const g = document.createElement('canvas').getContext('webgl2');
  const d = g.getExtension('WEBGL_debug_renderer_info');
  return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
}));

/** 等地形全部级 uFade 收敛到 1 且连续 1s 稳定 */
async function waitSettled(maxMs = 45000) {
  const t0 = Date.now();
  let stableSince = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(300);
    const f = await ev(() => {
      const a = window.__game.terrainMgr.active;
      return a ? a.patches.levels.map((l) => +l.uFade.value.toFixed(3)) : null;
    });
    if (f && f.every((v) => v >= 0.999)) {
      if (!stableSince) stableSince = Date.now();
      else if (Date.now() - stableSince > 1000) return f;
    } else stableSince = 0;
  }
  const f = await ev(() => {
    const a = window.__game.terrainMgr.active;
    return a ? a.patches.levels.map((l) => +l.uFade.value.toFixed(3)) : null;
  });
  console.log('  settle TIMEOUT fades=', JSON.stringify(f));
  return f;
}

async function subsolar(id) {
  return ev((id) => {
    const b = window.__game.builder.bodies.get(id);
    const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
    const s = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
    const q = b.mesh.quaternion;
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const ix = qw * s.x + qy * s.z - qz * s.y, iy = qw * s.y + qz * s.x - qx * s.z;
    const iz = qw * s.z + qx * s.y - qy * s.x, iw = -qx * s.x - qy * s.y - qz * s.z;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, ix * qw + iw * -qx + iy * -qz - iz * -qy) };
  }, id);
}

const CASES = [
  ['earth', 400, 0.42], ['earth', 100, 0.42], ['earth', 20, 0.42],
  ['moon', 200, 0.42], ['moon', 20, 0.42],
  ['mars', 200, 0.42], ['mars', 20, 0.42],
];
for (const [id, alt, tilt] of CASES) {
  const ss = await subsolar(id);
  await ev((id, alt, t, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.8; oc.lon = ss.lon; oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = R + alt;
  }, id, alt, tilt, ss);
  const f = await waitSettled();
  console.log(`${id} ${alt}km settled`, JSON.stringify(f));
  await page.screenshot({ path: `tools/.shot-surface/_gpu2-${id}-${alt}.png` });
}
await browser.close();
console.log('DONE');
