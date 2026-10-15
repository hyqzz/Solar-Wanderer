// 功能场景截图探针：系统全景 / 内太阳系 / LEO / 彗星 / 搜索 / 岩石阴影特写
// SwiftShader 渲染慢（每帧可达秒级），截图前必须等帧落地（frameSettle），
// 否则会抓到上一场景的陈旧帧。输出 tools/.shot-features/。
// 用法：node tools/probe-features.mjs  （需 dev server 已启动）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-features/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--hide-scrollbars'],
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
// rAF 帧计数钩子：settle 以此确认状态变更后确有新帧呈现
await ev(() => {
  window.__fc = 0;
  const tick = () => { window.__fc++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

/** 等至少 n 个新帧呈现（SwiftShader 每帧慢，超时兜底） */
async function frameSettle(n = 3, maxMs = 18000) {
  const mark = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(400);
    if ((await ev(() => window.__fc)) - mark >= n) return;
  }
  console.log('  settle TIMEOUT');
}

/** 截图并校验环绕焦点符合预期 */
async function shot(name, expectFocus) {
  const st = await ev(() => {
    const g = window.__game;
    return { focus: g.orbitCam.focusId, mode: g.getMode(), dist: Math.round(g.orbitCam.dist) };
  });
  console.log(`shot ${name}`, JSON.stringify(st));
  if (expectFocus && st.focus !== expectFocus) console.log(`  !! focus 应为 ${expectFocus}`);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

/** 目录面板开关（风景照收起，搜索照展开） */
const setCatalog = (open) => ev((open) => {
  document.getElementById('directory')?.classList.toggle('open', open);
}, open);

/** 通用视角设置（绕过飞行动画直接落位） */
async function view(id, distKm, latDeg, tilt, lonDeg = 0) {
  await ev((id, dist, la, t, lo) => {
    const g = window.__game;
    const oc = g.orbitCam;
    const be = g.builder.bodies.get(id);
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = la * Math.PI / 180; oc.lon = lo * Math.PI / 180;
    oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = (be ? be.phys.radiusKm : 0) + dist;
  }, id, distKm, latDeg, tilt, lonDeg);
  await frameSettle();
}

/** 日下点体固系经纬（四元数逆变换，与 probe-surface 相同） */
function subsolarLatLon(id) {
  return ev((id) => {
    const b = window.__game.builder.bodies.get(id);
    const p = b.posKm;
    const l = Math.hypot(p[0], p[1], p[2]);
    const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
    const q = b.mesh.quaternion;
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
    const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
    const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
    const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
    const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return { lat: Math.asin(Math.max(-1, Math.min(1, ly))) * 180 / Math.PI, lon: Math.atan2(-lz, lx) * 180 / Math.PI };
  }, id);
}

// 1. 全系统俯瞰（轨道线 + 行星光点 + 柯伊伯带）
await setCatalog(false);
await view('sun', 55 * 1.496e8, 62, 0.9);
await shot('feat-overview', 'sun');

// 2. 内太阳系（类地行星轨道）
await view('sun', 2.2 * 1.496e8, 55, 0.85);
await shot('feat-inner', 'sun');

// 3. 地球 LEO 视角（400km 高度白昼半球，弧面+云层+大气边缘）
{
  const ss = await subsolarLatLon('earth');
  await view('earth', 400, ss.lat, 0.42, ss.lon);
  await shot('feat-earth-leo', 'earth');
}

// 4. 哈雷彗星（flyTo 注册表目标，展示彗发）
await ev(() => { const g = window.__game; g.orbitCam.flyTo(g.orbitEnv ?? undefined, 'halley'); });
{
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    await sleep(500);
    const done = await ev(() => {
      const oc = window.__game.orbitCam;
      return oc.flight === null && oc.focusId === 'halley';
    });
    if (done) break;
  }
  await frameSettle();
  // 拉到 250 万 km 看彗发整体
  await ev(() => {
    const oc = window.__game.orbitCam;
    oc.lat = 0.5; oc.tilt = 0.6;
    oc.dist = oc.distTarget = 2.5e6;
  });
  await frameSettle();
  await shot('feat-comet-halley', 'halley');
}

// 5. 土星环平面低角度
await view('saturn', 320000, 4, 0.12);
await shot('feat-saturn-low', 'saturn');

// 6. 搜索面板（输入"火"）
await setCatalog(true);
await ev(() => {
  const inp = document.querySelector('#directory input[type="search"], #directory input');
  if (inp) {
    inp.value = '火';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  }
});
await sleep(800);
await shot('feat-search');
await ev(() => {
  const inp = document.querySelector('#directory input');
  if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.blur(); }
});
await setCatalog(false);

// 7. 月球岩石阴影特写（日下点西 62°，太阳高度 ~28°）
await ev(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  const be = g.builder.bodies.get('moon');
  g.select('moon');
  oc.focusId = 'moon'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  const q = be.mesh.quaternion;
  const p = be.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const vx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const vy = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const vz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  oc.lat = 10 * Math.PI / 180;
  oc.lon = Math.atan2(-vz, vx) + 62 * Math.PI / 180;
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = be.phys.radiusKm + 0.002;
});
await sleep(2500);
for (let k = 0; k < 3; k++) {
  await ev(() => { const g = window.__game; g.input.keys.add('KeyG'); g.input.justPressed.add('KeyG'); });
  await sleep(2500);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
await sleep(7000);
// 传送到最大岩石旁并面朝它
await ev(() => {
  const g = window.__game;
  const rocks = g.terrainMgr.active.patches.rocks;
  const m = rocks.mesh;
  const a = m.instanceMatrix.array;
  let best = -1, bestS = 0;
  for (let i = 0; i < m.count; i++) {
    const s = Math.abs(a[i * 16 + 5]);
    if (s > bestS) { bestS = s; best = i; }
  }
  if (best < 0) return;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const rockLocal = new V(a[best * 16 + 12], a[best * 16 + 13], a[best * 16 + 14]).add(m.position);
  const u = rockLocal.clone().normalize();
  const east = Math.abs(u.y) > 0.999 ? new V(1, 0, 0) : new V(0, 1, 0).cross(u).normalize();
  const pos = rockLocal.clone().addScaledVector(east, 0.006);
  g.ship.walk.localPos.copy(pos);
  const toRock = rockLocal.clone().sub(pos);
  const north = new V().crossVectors(u, east);
  const w = g.ship.walk;
  w.yaw = Math.atan2(toRock.dot(east), toRock.dot(north));
  w.pitch = -0.06;
  w.groundSmooth = null;
});
await frameSettle(2);
await shot('feat-walk-rock-shadow');

// 8. 行走起飞过渡（滚轮起飞后回望地表）
await ev(() => { window.__game.input.wheel += 1; });
await frameSettle(3);
await shot('feat-takeoff', 'moon');

await browser.close();
console.log('DONE');
