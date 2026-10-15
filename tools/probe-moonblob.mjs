// 一次性诊断：月球 200km 米色多边形斑块来源隔离
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
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
async function settle(n = 3, maxMs = 20000) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { await sleep(400); if ((await ev(() => window.__fc)) - m >= n) return; }
  console.log('  settle TIMEOUT');
}

await ev(() => {
  const g = window.__game, oc = g.orbitCam;
  const b = g.builder.bodies.get('moon');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const s = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * s.x + qy * s.z - qz * s.y, iy = qw * s.y + qz * s.x - qx * s.z;
  const iz = qw * s.z + qx * s.y - qy * s.x, iw = -qx * s.x - qy * s.y - qz * s.z;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  g.select('moon');
  oc.focusId = 'moon'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly))) * 0.8;
  oc.lon = Math.atan2(-lz, ix * qw + iw * -qx + iy * -qz - iz * -qy);
  oc.tilt = 0.42; oc.heading = 0;
  oc.dist = oc.distTarget = 1737.4 + 200;
});
await settle(4);

const dump = await ev(() => {
  const g = window.__game;
  const ps = g.terrainMgr.active.patches;
  return {
    levels: ps.levels.map((l, i) => ({ i, e: l.extent, vis: l.mesh.visible, fade: +l.uFade.value.toFixed(3) })),
    rocks: ps.rocks.mesh.count,
    groupChildren: ps.group.children.length,
    moonChildren: g.builder.bodies.get('moon').group.children.map((c) => c.type + (c.name ? ':' + c.name : '')),
  };
});
console.log(JSON.stringify(dump));
await page.screenshot({ path: 'tools/.shot-surface/_moonfix-0-base.png' });

// A: 隐藏岩石
await ev(() => { window.__game.terrainMgr.active.patches.rocks.mesh.visible = false; });
await settle(2);
await page.screenshot({ path: 'tools/.shot-surface/_moonfix-A-norocks.png' });

// B: 隐藏最粗 2 级（280/60）
await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  for (const l of ps.levels) if (l.extent >= 60) l.mesh.visible = false;
});
await settle(2);
await page.screenshot({ path: 'tools/.shot-surface/_moonfix-B-notop2.png' });

// C: 全部级复原，隐藏地标
await ev(() => {
  const g = window.__game;
  const ps = g.terrainMgr.active.patches;
  for (const l of ps.levels) l.mesh.visible = true;
  ps.rocks.mesh.visible = true;
  let n = 0;
  g.builder.bodies.get('moon').group.traverse((o) => { if (o.isSprite) { o.visible = false; n++; } });
  window.__hiddenSprites = n;
});
await settle(2);
await page.screenshot({ path: 'tools/.shot-surface/_moonfix-C-nolmk.png' });
console.log('hiddenSprites', await ev(() => window.__hiddenSprites));
await browser.close();
console.log('DONE');
