// 审计补拍：极光/晨昏线/日食正确位置/月面看地球/阿波罗11白昼/恩克彗星
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = 'http://localhost:5173/?quality=high';
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

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);

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
// 世界→体固系方向：qInv * v（四元数-向量旋转，plain math）
// 返回 {lat, lon}（体固系，+X 本初子午线，+Y 北极，lon=atan2(-z,x)）
// 子太阳点：dirWorld = normalize(sunPos - bodyPos) = -bodyPos（日心）
// 子月点（地球看月球）：dirWorld = normalize(moonPos - earthPos)

// ═══ 1. 夜面极光（反太阳点：lat=-latSub, lon=lonSub+π） ═══
console.log('═══ 夜面极光 ═══');
await ev(() => window.__game.flyTo('earth'));
await waitArrival();
await ev(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('earth');
  const p = e.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const sw = [-p[0] / l, -p[1] / l, -p[2] / l]; // 指向太阳（世界系）
  const q = e.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * sw[0] + qy * sw[2] - qz * sw[1];
  const iy = qw * sw[1] + qz * sw[0] - qx * sw[2];
  const iz = qw * sw[2] + qx * sw[1] - qy * sw[0];
  const iw = -qx * sw[0] - qy * sw[1] - qz * sw[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const latSub = Math.asin(Math.max(-1, Math.min(1, ly)));
  const lonSub = Math.atan2(-lz, lx);
  // 反太阳点（夜面中心），极光卵在高磁纬 → 取夜面高纬
  g.orbitCam.lat = Math.max(1.1, -latSub > 0 ? 1.15 : -1.15); // 北半球夜面（当前9月北极极夜边缘）
  g.orbitCam.lon = lonSub + Math.PI;
  g.orbitCam.distTarget = 6371 * 2.0;
});
await sleep(3000); await restoreDetail(); await sleep(400);
await shot('fix-aurora-night'); console.log('  📷 fix-aurora-night');

// ═══ 2. 晨昏线（太空看昼夜分界） ═══
console.log('═══ 晨昏线 ═══');
await ev(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('earth');
  const p = e.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const sw = [-p[0] / l, -p[1] / l, -p[2] / l];
  const q = e.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * sw[0] + qy * sw[2] - qz * sw[1];
  const iy = qw * sw[1] + qz * sw[0] - qx * sw[2];
  const iz = qw * sw[2] + qx * sw[1] - qy * sw[0];
  const iw = -qx * sw[0] - qy * sw[1] - qz * sw[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const latSub = Math.asin(Math.max(-1, Math.min(1, ly)));
  const lonSub = Math.atan2(-lz, lx);
  g.orbitCam.lat = latSub;
  g.orbitCam.lon = lonSub + Math.PI / 2; // 晨线正上方
  g.orbitCam.distTarget = 6371 * 2.6;
});
await sleep(3000); await restoreDetail(); await sleep(400);
await shot('fix-terminator'); console.log('  📷 fix-terminator');

// ═══ 3. 日食：2026-08-12 17:47 UTC，相机在子月点正上方 ═══
console.log('═══ 日食 ═══');
await ev(() => {
  const g = window.__game;
  const jdUT = Date.UTC(2026, 7, 12, 17, 47, 0) / 86400000 + 2440587.5;
  g.simClock.set(jdUT + 69.184 / 86400);
  g.simClock.paused = true;
});
await sleep(1500); // 星历/食系统刷新
const eclipseGeo = await ev(() => {
  const g = window.__game;
  const earth = g.builder.bodies.get('earth');
  const moon = g.builder.bodies.get('moon');
  const dx = moon.posKm[0] - earth.posKm[0], dy = moon.posKm[1] - earth.posKm[1], dz = moon.posKm[2] - earth.posKm[2];
  const l = Math.hypot(dx, dy, dz);
  const mw = [dx / l, dy / l, dz / l]; // 地→月（世界系）
  const q = earth.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * mw[0] + qy * mw[2] - qz * mw[1];
  const iy = qw * mw[1] + qz * mw[0] - qx * mw[2];
  const iz = qw * mw[2] + qx * mw[1] - qy * mw[0];
  const iw = -qx * mw[0] - qy * mw[1] - qz * mw[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx), moonDist: l };
});
console.log('  子月点 lat/lon:', (eclipseGeo.lat * 180 / Math.PI).toFixed(1), (eclipseGeo.lon * 180 / Math.PI).toFixed(1), '月距', (eclipseGeo.moonDist / 1000).toFixed(0), '千km');
await ev((geo) => {
  const g = window.__game;
  g.orbitCam.lat = geo.lat;
  g.orbitCam.lon = geo.lon;
  g.orbitCam.distTarget = 6371 * 3.2;
}, eclipseGeo);
await sleep(3000); await restoreDetail(); await sleep(400);
await shot('fix-eclipse-sublunar'); console.log('  📷 fix-eclipse-sublunar');
await ev(() => { window.__game.orbitCam.distTarget = 6371 * 1.4; });
await sleep(2500);
await shot('fix-eclipse-close'); console.log('  📷 fix-eclipse-close');
await ev(() => { window.__game.simClock.paused = false; window.__game.simClock.setNow(); });

// ═══ 4. 月面行走看地球 ═══
console.log('═══ 月面看地球 ═══');
await ev(() => window.__game.flyTo('moon'));
await waitArrival();
// 计算子地点（月球上正对地球的点），把登陆点放在其 75° 外（地球在地平线上 ~15° 仰角）
const site = await ev(() => {
  const g = window.__game;
  const moon = g.builder.bodies.get('moon');
  const earth = g.builder.bodies.get('earth');
  const dx = earth.posKm[0] - moon.posKm[0], dy = earth.posKm[1] - moon.posKm[1], dz = earth.posKm[2] - moon.posKm[2];
  const l = Math.hypot(dx, dy, dz);
  const ew = [dx / l, dy / l, dz / l]; // 月→地（世界系）
  const q = moon.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * ew[0] + qy * ew[2] - qz * ew[1];
  const iy = qw * ew[1] + qz * ew[0] - qx * ew[2];
  const iz = qw * ew[2] + qx * ew[1] - qy * ew[0];
  const iw = -qx * ew[0] - qy * ew[1] - qz * ew[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const subLat = Math.asin(Math.max(-1, Math.min(1, ly)));
  const subLon = Math.atan2(-lz, lx);
  // 登陆点：子地点向"西"偏 75°（地球位于东方地平线仰角 ~15°）
  return { lat: subLat, lon: subLon - 75 * Math.PI / 180, subLat, subLon };
});
await ev((s) => {
  const g = window.__game;
  g.orbitCam.lat = s.lat; g.orbitCam.lon = s.lon;
  g.orbitCam.distTarget = 1737.4 * 1.05;
}, site);
await sleep(2500);
// 滚轮登陆
await page.mouse.move(640, 360);
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
console.log('  mode:', await ev(() => window.__game.getMode()));
await sleep(6000); // DEM 全级扫掠
// 看向地球：重算地球在体固系方向 → walk.yaw/pitch
const aim = await ev(() => {
  const g = window.__game;
  const moon = g.builder.bodies.get('moon');
  const earth = g.builder.bodies.get('earth');
  // 站点体固系位置
  const sp = g.ship.posKm; // 世界系（浮动原点即相机）
  const mp = moon.posKm;
  const rel = [sp[0] - mp[0], sp[1] - mp[1], sp[2] - mp[2]];
  const rl = Math.hypot(rel[0], rel[1], rel[2]);
  const q = moon.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const rot = (v) => {
    const ix = qw * v[0] + qy * v[2] - qz * v[1];
    const iy = qw * v[1] + qz * v[0] - qx * v[2];
    const iz = qw * v[2] + qx * v[1] - qy * v[0];
    const iw = -qx * v[0] - qy * v[1] - qz * v[2];
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ];
  };
  const upL = [rel[0] / rl, rel[1] / rl, rel[2] / rl];
  const upLocal = rot(upL); // 体固系 up
  const ew = [earth.posKm[0] - mp[0], earth.posKm[1] - mp[1], earth.posKm[2] - mp[2]];
  const el = Math.hypot(ew[0], ew[1], ew[2]);
  const eLocal = rot([ew[0] / el, ew[1] / el, ew[2] / el]); // 体固系指向地球
  const u = upLocal;
  const east = Math.abs(u[1]) > 0.999 ? [1, 0, 0] : (() => { const t = [-u[2], 0, u[0]]; const tl = Math.hypot(t[0], t[2]); return [t[0] / tl, 0, t[2] / tl]; })();
  // north = u × east
  const north = [u[1] * east[2] - u[2] * east[1], u[2] * east[0] - u[0] * east[2], u[0] * east[1] - u[1] * east[0]];
  const eDotUp = eLocal[0] * u[0] + eLocal[1] * u[1] + eLocal[2] * u[2];
  const eDotE = eLocal[0] * east[0] + eLocal[1] * east[1] + eLocal[2] * east[2];
  const eDotN = eLocal[0] * north[0] + eLocal[1] * north[1] + eLocal[2] * north[2];
  const yaw = Math.atan2(eDotE, eDotN);
  const pitch = Math.asin(Math.max(-1, Math.min(1, eDotUp)));
  g.ship.walk.yaw = yaw;
  g.ship.walk.pitch = pitch;
  return { yawDeg: yaw * 180 / Math.PI, pitchDeg: pitch * 180 / Math.PI };
});
console.log('  看向地球 yaw/pitch:', JSON.stringify(aim));
await sleep(1200);
await shot('fix-moon-earthview'); console.log('  📷 fix-moon-earthview');

// ═══ 5. 阿波罗 11（白昼条件，行走视角） ═══
console.log('═══ 阿波罗 11 ═══');
// 起飞回轨道
await ev(() => { window.__game.input.wheel += 1; });
{
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    if ((await ev(() => window.__game.getMode())) === 'orbit') break;
    await sleep(300);
  }
}
// 跳时间直到静海基地白昼（太阳方向与站点方向点积 > 0.35）
const siteDir = { lat: 0.6875 * Math.PI / 180, lon: 23.4334 * Math.PI / 180 };
for (let step = 0; step < 60; step++) {
  const lit = await ev((sd) => {
    const g = window.__game;
    const moon = g.builder.bodies.get('moon');
    const p = moon.posKm;
    const l = Math.hypot(p[0], p[1], p[2]);
    const sw = [-p[0] / l, -p[1] / l, -p[2] / l];
    const q = moon.mesh.quaternion;
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const ix = qw * sw[0] + qy * sw[2] - qz * sw[1];
    const iy = qw * sw[1] + qz * sw[0] - qx * sw[2];
    const iz = qw * sw[2] + qx * sw[1] - qy * sw[0];
    const iw = -qx * sw[0] - qy * sw[1] - qz * sw[2];
    const sx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    const sy = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const sz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    // 站点方向（体固系）：lat/lon → dir
    const cd = [Math.cos(sd.lat) * Math.cos(sd.lon), Math.sin(sd.lat), -Math.cos(sd.lat) * Math.sin(sd.lon)];
    const dot = sx * cd[0] + sy * cd[1] + sz * cd[2];
    if (dot > 0.35) return true;
    g.simClock.set(g.simClock.jdTT + 0.5); // 前进 12 小时
    return false;
  }, siteDir);
  if (lit) break;
}
console.log('  静海基地已白昼');
await ev((sd) => {
  const g = window.__game;
  g.orbitCam.lat = sd.lat; g.orbitCam.lon = sd.lon;
  g.orbitCam.distTarget = 1737.4 * 1.02;
}, siteDir);
await sleep(2500);
await page.mouse.move(640, 360);
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
console.log('  mode:', await ev(() => window.__game.getMode()));
await sleep(6000);
// 环视找登月舱（低仰角环视）
await ev(() => { window.__game.ship.walk.pitch = 0.05; });
await shot('fix-apollo11-a');
for (let k = 0; k < 4; k++) {
  await ev(() => { window.__game.ship.walk.yaw += Math.PI / 2; });
  await sleep(600);
  await shot(`fix-apollo11-${'abcd'[k]}`);
}
console.log('  📷 fix-apollo11-*');
// 恢复实时钟
await ev(() => { window.__game.simClock.setNow(); });

// ═══ 6. 恩克彗星 ═══
console.log('═══ 恩克彗星 ═══');
const enckeId = await ev(() => {
  for (const [id, r] of window.__game.registry) {
    if ((r.nameZh ?? '').includes('恩克')) return id;
  }
  return null;
});
console.log('  id =', enckeId);
if (enckeId) {
  await ev((id) => window.__game.flyTo(id), enckeId);
  await waitArrival();
  await sleep(2000);
  await shot('fix-encke');
  console.log('  📷 fix-encke');
  // 拉远看彗尾
  await ev(() => { window.__game.orbitCam.distTarget = window.__game.orbitCam.dist * 8; });
  await sleep(2500);
  await shot('fix-encke-tail');
  console.log('  📷 fix-encke-tail');
}

console.log('\n════ 汇总 ════');
if (errors.length) { console.log('错误:'); errors.forEach((e) => console.log('  🔥', e)); }
else console.log('零控制台/页面错误 ✅');
await browser.close();
process.exit(errors.length ? 1 : 0);
