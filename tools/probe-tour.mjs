// 全功能展示截图（真实 GPU / headed）：探索、登陆行走、天体特写、彗星、搜索。
// SwiftShader 会因低帧率抓到陈旧帧，故统一走真实 GPU + rAF 帧计数 + 地形淡入/
// 地面沉降等待。输出 tools/.shot-tour/。用法：node tools/probe-tour.mjs
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/.shot-tour/';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--window-position=-2400,-2400', '--window-size=1280,760', '--hide-scrollbars'],
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
await ev(() => { window.__game.quality.detail = true; }); // 高品质细节（大气/极光/风暴）
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
console.log('RENDERER:', await ev(() => {
  const g = document.createElement('canvas').getContext('webgl2');
  const d = g.getExtension('WEBGL_debug_renderer_info');
  return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
}));

/** 等 n 个新帧呈现 */
async function settle(n = 4, maxMs = 20000) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(200);
    if ((await ev(() => window.__fc)) - m >= n) return;
  }
  console.log('  settle TIMEOUT');
}
/** 等地形各级淡入收敛到不透明 */
async function waitFades(maxMs = 45000) {
  const t0 = Date.now(); let st = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(300);
    const f = await ev(() => { const a = window.__game.terrainMgr.active; return a ? a.patches.levels.map((l) => l.uFade.value) : null; });
    if (f && f.every((v) => v >= 0.999)) { if (!st) st = Date.now(); else if (Date.now() - st > 700) return; }
    else st = 0;
  }
  console.log('  fades TIMEOUT');
}
/** 等行走高度稳定（DEM 精修使地面高度收敛） */
async function groundStable(maxMs = 40000) {
  const t0 = Date.now();
  let prev = null, st = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(400);
    const h = await ev(() => {
      const w = window.__game.ship.walk;
      return w ? w.localPos.length() : null;
    });
    if (h == null) continue;
    if (prev != null && Math.abs(h - prev) < 0.004) { if (!st) st = Date.now(); else if (Date.now() - st > 1200) return; }
    else st = 0;
    prev = h;
  }
  console.log('  ground TIMEOUT');
}

const setCatalog = (open) => ev((open) => { document.getElementById('directory')?.classList.toggle('open', open); }, open);

async function subsolarLatLon(id) {
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

async function shot(name, focus) {
  const st = await ev(() => {
    const g = window.__game;
    return { focus: g.orbitCam.focusId, mode: g.getMode(), dist: Math.round(g.orbitCam.dist) };
  });
  const ok = !focus || st.focus === focus;
  console.log(`shot ${name}`, JSON.stringify(st), ok ? '' : `!! 期望焦点 ${focus}`);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

/** 环绕视角（绕过飞行动画直接落位） */
async function view(id, distKm, lat, tilt, lon) {
  await ev((id, dist, la, t, lo) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = la; oc.lon = lo; oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = R + dist;
  }, id, distKm, lat, tilt, lon);
  await waitFades();
  await settle(4);
}

/** 登陆并走到稳定地面 */
async function land(id, latDeg, tries = 3) {
  const ss = await subsolarLatLon(id);
  await ev((id, la, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = la; oc.lon = ss.lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = R + 0.002;
  }, id, latDeg * Math.PI / 180, ss);
  // DEM 基础层就绪后按真实高程精降
  const t1 = Date.now();
  while (Date.now() - t1 < 25000) {
    if (await ev((id) => window.__game.terrainMgr.baseReady(id), id)) break;
    await sleep(500);
  }
  for (let k = 0; k < tries && (await ev(() => window.__game.getMode())) !== 'walk'; k++) {
    await ev((id, la, ss) => {
      const g = window.__game, oc = g.orbitCam;
      if (g.getMode() === 'walk') return;
      const V = Object.getPrototypeOf(g.camera.position).constructor;
      const dir = new V(Math.cos(la) * Math.cos(-ss.lon), Math.sin(la), Math.cos(la) * Math.sin(-ss.lon));
      oc.dist = oc.distTarget = g.terrainMgr.heightAt(id, dir) + 0.002;
    }, id, latDeg * Math.PI / 180, ss);
    await sleep(3000);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) { if ((await ev(() => window.__game.getMode())) === 'walk') break; await sleep(400); }
  await waitFades();
  await groundStable();
  await settle(4);
}

async function look(pitch) {
  await ev((p) => { const w = window.__game.ship.walk; if (w) w.pitch = p; }, pitch);
  await settle(3);
}

await setCatalog(false);

// ── 1. 系统全景：黄道面俯视（轨道线 + 行星 + 柯伊伯带）──
await view('sun', 45 * 1.496e8, 72 * Math.PI / 180, 0.0, 0);
await shot('01-系统全景', 'sun');

// ── 2. 内太阳系 ──
await view('sun', 2.2 * 1.496e8, 60 * Math.PI / 180, 0.25, 0);
await shot('02-内太阳系', 'sun');

// ── 3. 地球 LEO（400km 白昼半球 + 云 + 大气边）──
{
  const ss = await subsolarLatLon('earth');
  await view('earth', 400, ss.lat * 0.8, 0.42, ss.lon);
  await shot('03-地球低轨', 'earth');
}

// ── 4. 地球夜面（城市灯光）──
{
  const ss = await subsolarLatLon('earth');
  await view('earth', 8000, 18 * Math.PI / 180, 0.3, ss.lon + Math.PI);
  await shot('04-地球夜面', 'earth');
}

// ── 5. 木星（云带 + 大红斑 + 伽利略卫星）──
await view('jupiter', 260000, 8 * Math.PI / 180, 0.22, 0);
await shot('05-木星', 'jupiter');

// ── 6. 土星环低角度 ──
await view('saturn', 320000, 4 * Math.PI / 180, 0.12, 0);
await shot('06-土星与环', 'saturn');

// ── 7. 月球轨道近观（高地/月海）──
await view('moon', 1800, 18 * Math.PI / 180, 0.35, 0);
await shot('07-月球轨道', 'moon');

// ── 8. 冥王星与冥卫一 ──
await view('pluto', 22000, 12 * Math.PI / 180, 0.3, 0);
await shot('08-冥王星', 'pluto');

// ── 9. 彗星（当前唯一活跃彗星：恩克 2.16AU）──
await ev(() => { const g = window.__game; g.orbitCam.flyTo(g.orbitEnv ?? undefined, 'encke'); });
{
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    await sleep(500);
    if (await ev(() => { const oc = window.__game.orbitCam; return oc.flight === null && oc.focusId === 'encke'; })) break;
  }
  await settle(5);
  await ev(() => { const oc = window.__game.orbitCam; oc.lat = 0.5; oc.tilt = 0.6; oc.dist = oc.distTarget = 1.2e7; });
  await settle(5);
  await shot('09-彗星恩克', 'encke');
}

// ── 10. 柯伊伯带 ──
await ev(() => {
  const g = window.__game, oc = g.orbitCam;
  g.select('kuiper'); oc.focusId = 'kuiper'; oc.flight = null;
  oc.lat = 0.6; oc.lon = 0; oc.tilt = 0.2; oc.heading = 0;
  oc.dist = oc.distTarget = 40 * 1.496e8;
});
await settle(5);
await shot('10-柯伊伯带');

// ── 11. 月球地表行走 ──
await land('moon', 10);
await look(0.05);
await shot('11-月球地表', 'moon');
await look(1.05);
await shot('12-月球仰望星空');
await ev(() => { window.__game.input.wheel += 1; });
await settle(4);

// ── 13. 火星地表行走 ──
await land('mars', -5);
await look(0.05);
await shot('13-火星地表', 'mars');
await ev(() => { window.__game.input.wheel += 1; });
await settle(4);

// ── 14. 地球地表（海岸/大地）──
await land('earth', 20);
await look(0.05);
await shot('14-地球地表', 'earth');
await ev(() => { window.__game.input.wheel += 1; });
await settle(4);

// ── 15. 搜索面板 ──
await setCatalog(true);
await ev(() => {
  const inp = document.querySelector('#directory input[type="search"], #directory input');
  if (inp) { inp.value = '月'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); }
});
await sleep(900);
await shot('15-搜索', 'earth');
await setCatalog(false);

await browser.close();
console.log('DONE');
