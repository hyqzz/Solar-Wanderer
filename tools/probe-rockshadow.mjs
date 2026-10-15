// 一次性诊断：传送到最大岩石旁验证投影特写
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
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
await page.evaluate(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  const be = g.builder.bodies.get('moon');
  g.select('moon');
  oc.focusId = 'moon'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = 10 * Math.PI / 180; oc.lon = 0; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = be.phys.radiusKm + 0.002;
});
await sleep(2500);
await page.evaluate(() => {
  const g = window.__game;
  g.input.keys.add('KeyG'); g.input.justPressed.add('KeyG');
});
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  if ((await page.evaluate(() => window.__game.getMode())) === 'walk') break;
  await sleep(500);
}
await sleep(7000);
// 找最大岩石，把行走者传送到它旁边 4m，面朝它
const st = await page.evaluate(() => {
  const g = window.__game;
  const tm = g.terrainMgr;
  const rocks = tm.active.patches.rocks;
  const m = rocks.mesh;
  const a = m.instanceMatrix.array;
  let best = -1, bestS = 0;
  for (let i = 0; i < m.count; i++) {
    const s = Math.abs(a[i * 16 + 5]);
    if (s > bestS) { bestS = s; best = i; }
  }
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const rockLocal = new V(a[best * 16 + 12], a[best * 16 + 13], a[best * 16 + 14]).add(m.position);
  const rl = rockLocal.length();
  // 从岩石沿切向退 4m，站高由 updateWalk 吸附
  const u = rockLocal.clone().normalize();
  const east = Math.abs(u.y) > 0.999 ? new V(1, 0, 0) : new V(0, 1, 0).cross(u).normalize();
  const off = east.clone().multiplyScalar(0.004 + bestS * 1.5);
  const pos = rockLocal.clone().add(off);
  g.ship.walk.localPos.copy(pos.normalize().multiplyScalar(rl));
  // 面朝岩石
  const toRock = rockLocal.clone().sub(g.ship.walk.localPos);
  const w = g.ship.walk;
  const fr = { // walkFrame 基
    e: east,
    n: new V().crossVectors(u, east).negate(), // north = u×e 取反? walkFrame: north=cross(u,east)
  };
  const north = new V().crossVectors(u, east);
  w.yaw = Math.atan2(toRock.dot(east), toRock.dot(north));
  w.pitch = -0.12;
  // 阴影装置状态
  let dirLight = null;
  let root = g.camera; while (root.parent) root = root.parent;
  root.traverse((o) => { if (o.isDirectionalLight) dirLight = o; });
  return {
    bestS, rockCount: m.count,
    shadow: dirLight ? {
      visible: dirLight.visible, cast: dirLight.castShadow,
      intensity: +dirLight.intensity.toFixed(3),
      pos: dirLight.position.toArray().map((v) => +v.toFixed(2)),
    } : null,
  };
});
console.log(JSON.stringify(st));
await sleep(1500);
await page.screenshot({ path: 'tools/.shot-surface/_diag-rock-shadow.png' });
await browser.close();
console.log('DONE');
