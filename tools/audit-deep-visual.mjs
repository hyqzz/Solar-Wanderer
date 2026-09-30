// 深度视觉审查：全覆盖场景截图 + 状态断言 + 渲染统计。
// 与 test-journey.mjs（功能旅程）互补：本脚本专注"看起来对不对"——
// 行星白昼面、卫星、彗星、TNO、深空、日出、极光、日食、地标、英文版。
// 用法：node tools/audit-deep-visual.mjs [url]
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] ?? 'http://localhost:5173/?quality=high';
const OUT = new URL('./.shot-audit/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = (name) => page.screenshot({ path: OUT + name + '.png' });

console.log('加载（quality=high 强制高画质档）…');
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);

// fpsGuard 在软渲染下 4s 后必然降档（关掉行星片元细节）——恢复之，让截图代表真实 GPU 高画质
async function restoreDetail() {
  await ev(() => {
    const g = window.__game;
    for (const [, e] of g.builder.bodies) {
      if (e.mat?.userData.uniforms?.uDetailMode) {
        e.mat.userData.uniforms.uDetailMode.value =
          (e.phys.type === 'gas' || e.phys.type === 'ice') ? 2 : (e.phys.landable ? 1 : 0);
      }
    }
  });
}

async function waitArrival(timeoutMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await ev(() => !!window.__game.orbitCam.flight))) return true;
    await sleep(400);
  }
  return false;
}

// 计算星下点（太阳直射点）体固系经纬 → 让相机正对白昼半球
async function faceDaySide(latShift = 0) {
  await ev((ds) => {
    const g = window.__game;
    const cam = g.orbitCam;
    const e = g.builder.bodies.get(cam.focusId);
    if (!e) return;
    const p = e.posKm;
    const l = Math.hypot(p[0], p[1], p[2]);
    const sw = [-p[0] / l, -p[1] / l, -p[2] / l]; // 世界系指向太阳
    const q = e.mesh.quaternion; // local→world
    // 四元数求逆（共轭）作用于 sw：world→local
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const [x, y, z] = sw;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    cam.lat = Math.asin(Math.max(-1, Math.min(1, ly))) + ds;
    cam.lon = Math.atan2(-lz, lx);
  }, latShift);
}

async function visitBody(id, name, distRadii, { daySide = true, latShift = 0, settleMs = 1800 } = {}) {
  await ev((b) => window.__game.flyTo(b), id);
  await waitArrival();
  const R = await ev((b) => window.__game.registry.get(b)?.phys?.radiusKm ?? 1, id);
  await ev((d) => { window.__game.orbitCam.distTarget = d; }, R * distRadii);
  if (daySide) await faceDaySide(latShift);
  await sleep(settleMs + 1500);
  await restoreDetail();
  await sleep(400);
  await shot(name);
  console.log('  📷', name);
}

// ═══ 1. 八大行星白昼面 ═══
console.log('═══ 行星白昼面 ═══');
await visitBody('mercury', 'p1-mercury', 3.2);
await visitBody('venus', 'p2-venus-day', 3.2);
await visitBody('earth', 'p3-earth-day', 3.0);
await visitBody('mars', 'p4-mars-day', 3.0);
await visitBody('jupiter', 'p5-jupiter-day', 2.6);
await visitBody('saturn', 'p6-saturn-day', 2.4, { latShift: 0.35 });
await visitBody('uranus', 'p7-uranus', 3.0);
await visitBody('neptune', 'p8-neptune', 3.0);
await visitBody('pluto', 'p9-pluto', 4.0);

// ═══ 2. 卫星 ═══
console.log('═══ 卫星 ═══');
await visitBody('moon', 'm1-moon-orbit', 3.0);
await visitBody('io', 'm2-io', 3.5);
await visitBody('europa', 'm3-europa', 3.5);
await visitBody('ganymede', 'm4-ganymede', 3.0);
await visitBody('callisto', 'm5-callisto', 3.0);
await visitBody('titan', 'm6-titan', 3.0);
await visitBody('triton', 'm7-triton', 3.5);

// ═══ 3. 小天体/彗星/探测器/深空 ═══
console.log('═══ 小天体与深空 ═══');
await visitBody('ceres', 's1-ceres', 4.0);
// 恩克彗星（当前 1.2 AU 活跃期）
const enckeId = await ev(() => {
  for (const [id, r] of window.__game.registry) {
    if ((r.phys?.nameZh ?? '').includes('恩克')) return id;
  }
  return null;
});
console.log('  恩克彗星 id =', enckeId);
if (enckeId) await visitBody(enckeId, 's2-encke-comet', 12, { daySide: false });
// 旅行者1号
await visitBody('voyager1', 's3-voyager1', 60, { daySide: false });
// 奥尔特云深处回望
await ev(() => { window.__game.select('sun'); window.__game.orbitCam.distTarget = 1.2e13; });
await sleep(3500);
await shot('s4-oort-deep'); console.log('  📷 s4-oort-deep');
// 柯伊伯带俯瞰
await ev(() => { window.__game.select('sun'); window.__game.orbitCam.distTarget = 9e9; window.__game.orbitCam.lat = 1.1; });
await sleep(3000);
await shot('s5-kuiper-top'); console.log('  📷 s5-kuiper-top');

// ═══ 4. 地球特殊时刻 ═══
console.log('═══ 地球特殊时刻 ═══');
// 晨昏线视角（太空看晨昏）
await ev(() => window.__game.flyTo('earth'));
await waitArrival();
await ev(() => {
  const g = window.__game;
  g.orbitCam.distTarget = 6371 * 2.2;
});
await faceDaySide(Math.PI / 2 * 0.9); // 移到晨昏线附近
await sleep(2500); await restoreDetail(); await sleep(300);
await shot('e1-earth-terminator'); console.log('  📷 e1-earth-terminator');
// 极光：夜侧极区
await faceDaySide(Math.PI); // 正对夜面
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 1.15; // 高纬度
  g.orbitCam.distTarget = 6371 * 1.6;
});
await sleep(2500); await restoreDetail(); await sleep(300);
await shot('e2-earth-aurora'); console.log('  📷 e2-earth-aurora');

// 日食：2026-08-12 17:47 UTC（西班牙上空全食）
console.log('═══ 日食（2026-08-12 西班牙） ═══');
await ev(() => {
  const g = window.__game;
  const jdUT = Date.UTC(2026, 7, 12, 17, 47, 0) / 86400000 + 2440587.5;
  g.simClock.set(jdUT + 69.184 / 86400); // UT→TT
  g.simClock.paused = true;
});
await sleep(1200);
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 40.3 * Math.PI / 180; // 马德里纬度
  g.orbitCam.lon = -3.7 * Math.PI / 180;
  g.orbitCam.distTarget = 6371 * 8;
});
await sleep(3000); await restoreDetail(); await sleep(300);
await shot('e3-eclipse-wide'); console.log('  📷 e3-eclipse-wide');
await ev(() => { window.__game.orbitCam.distTarget = 6371 * 1.8; });
await sleep(2500);
await shot('e4-eclipse-close'); console.log('  📷 e4-eclipse-close');
// 恢复实时钟
await ev(() => { window.__game.simClock.paused = false; window.__game.simClock.setNow(); });

// ═══ 5. 月面看地球（情感镜头） ═══
console.log('═══ 月面看地球 ═══');
await ev(() => window.__game.flyTo('moon'));
await waitArrival();
// 找地球在月球天空的方向：相机放到对地一侧
await ev(() => {
  const g = window.__game;
  const moon = g.builder.bodies.get('moon');
  const earth = g.builder.bodies.get('earth');
  const dx = earth.posKm[0] - moon.posKm[0], dy = earth.posKm[1] - moon.posKm[1], dz = earth.posKm[2] - moon.posKm[2];
  const l = Math.hypot(dx, dy, dz);
  const ew = [dx / l, dy / l, dz / l];
  const q = moon.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * ew[0] + qy * ew[2] - qz * ew[1];
  const iy = qw * ew[1] + qz * ew[0] - qx * ew[2];
  const iz = qw * ew[2] + qx * ew[1] - qy * ew[0];
  const iw = -qx * ew[0] - qy * ew[1] - qz * ew[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  g.orbitCam.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  g.orbitCam.lon = Math.atan2(-lz, lx);
  g.orbitCam.distTarget = 1737.4 + 0.06; // 60m 低空
});
await sleep(4000);
await shot('e5-moon-earthview'); console.log('  📷 e5-moon-earthview');

// ═══ 6. 阿波罗地标近景 ═══
console.log('═══ 阿波罗 11 地标 ═══');
await ev(() => {
  const g = window.__game;
  // 静海基地：lat 0.6875°N, lon 23.4334°E
  g.orbitCam.lat = 0.6875 * Math.PI / 180;
  g.orbitCam.lon = 23.4334 * Math.PI / 180;
  g.orbitCam.distTarget = 1737.4 + 0.0015; // 贴近地表 1.5m
});
await sleep(4000);
await shot('e6-apollo11'); console.log('  📷 e6-apollo11');

// ═══ 7. 性能与渲染统计 ═══
console.log('═══ 渲染统计 ═══');
const stats = await ev(() => new Promise((res) => {
  const g = window.__game;
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res({
    fpsSwiftshader: +(n / 3).toFixed(1),
  }); };
  requestAnimationFrame(tick);
}));
console.log('  FPS(swiftshader):', stats.fpsSwiftshader);
const info = await ev(() => {
  const c = document.querySelector('canvas');
  return { w: c.width, h: c.height };
});
console.log('  canvas:', JSON.stringify(info));

// ═══ 汇总 ═══
console.log('\n════════ 汇总 ════════');
if (errors.length) { console.log('错误:'); errors.forEach((e) => console.log('  🔥', e)); }
else console.log('零控制台/页面错误 ✅');
await browser.close();
process.exit(errors.length ? 1 : 0);
