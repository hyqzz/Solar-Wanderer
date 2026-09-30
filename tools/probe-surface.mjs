// 地表图册探针：登陆各可登陆天体，拍摄地平线视角 + 仰天视角，
// 用于与真实地表影像（阿波罗/好奇号/惠更斯/ISS）对标的沉浸感审查。
// 输出 tools/.shot-surface/。用法：node tools/probe-surface.mjs
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-surface/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

// [id, 半径km, 着陆纬度(度), 是否跳过水下检测]
const BODIES = [
  ['moon', 1737.4, 10], ['mars', 3389.5, -5], ['mercury', 2439.7, 15],
  ['venus', 6051.8, 10], ['titan', 2574.7, 10], ['pluto', 1188.3, 20],
  ['earth', 6371.0, 20],
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--hide-scrollbars'],
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
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });

// 日下点体固系经纬（与 probe-atlas 相同的四元数逆变换）
async function subsolarLatLon(id) {
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
    return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx) };
  }, id);
}

async function waitWalk(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if ((await ev(() => window.__game.getMode())) === 'walk') return true;
    await sleep(400);
  }
  return false;
}

for (const [id, R, latDeg] of BODIES) {
  const ss = await subsolarLatLon(id);
  // 着陆点：日下经度（白昼）+ 指定纬度；地球避开海洋（换经度重试）
  let lat = latDeg * Math.PI / 180, lon = ss.lon;
  if (id === 'earth') {
    for (const off of [0, 0.6, 1.2, 1.8, 2.4]) {
      const wet = await ev((id, la, lo) => {
        const v = new (Object.getPrototypeOf(window.__game.camera.position).constructor)(
          Math.cos(la) * Math.cos(-lo), Math.sin(la), Math.cos(la) * Math.sin(-lo));
        return window.__game.terrainMgr.isWater(id, v);
      }, id, lat, lon + off);
      if (!wet) { lon += off; break; }
    }
  }
  await ev((id, R, lat, lon) => {
    const g = window.__game;
    g.quality.detail = true;
    const oc = g.orbitCam;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = lat; oc.lon = lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = R + 0.002; // 2m 高度 → 自动登陆
  }, id, R, lat, lon);
  // DEM 天体（月/火/地球）：等基础层就绪后按真实高程精降（真实地表可低于
  // 基准球面数公里，固定 R+0.002 会悬空不落）
  const t1 = Date.now();
  while (Date.now() - t1 < 20000) {
    const ready = await ev((id) => window.__game.terrainMgr.baseReady(id), id);
    if (ready) break;
    await sleep(500);
  }
  await ev((id, lat, lon) => {
    const g = window.__game;
    const oc = g.orbitCam;
    if (g.getMode() !== 'orbit' || oc.focusId !== id) return;
    const V = Object.getPrototypeOf(g.camera.position).constructor;
    const dir = new V(
      Math.cos(lat) * Math.cos(-lon), Math.sin(lat), Math.cos(lat) * Math.sin(-lon));
    const h = g.terrainMgr.heightAt(id, dir);
    oc.dist = oc.distTarget = h + 0.002;
  }, id, lat, lon);
  const ok = await waitWalk();
  console.log(id, ok ? 'walk' : 'WALK-TIMEOUT');
  if (!ok) continue;
  await sleep(4000); // 等地形 LOD / DEM 与天空稳定
  // 星淡诊断：白昼大气内星点/光点必须已被淹没
  const fade = await ev(() => {
    const g = window.__game;
    let root = g.camera;
    while (root.parent) root = root.parent;
    const starMats = [];
    root.traverse((o) => {
      if (o.isPoints && [11000, 900, 129].includes(o.geometry?.attributes?.position?.count)) {
        starMats.push(o.material.opacity);
      }
    });
    let glintNonZero = 0;
    for (const [, e] of g.builder.bodies) if (e.glint && e.glint.material.opacity > 0.01) glintNonZero++;
    return { starMats, glintNonZero, hasAtmo: !!g.builder.bodies.get(g.orbitCam.focusId)?.phys.atmosphere };
  });
  console.log(id, 'fade:', JSON.stringify(fade));
  await ev(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 0.05; } });
  await sleep(700);
  await page.screenshot({ path: `${OUT}${id}-horizon.png` });
  await ev(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 1.05; } });
  await sleep(700);
  await page.screenshot({ path: `${OUT}${id}-sky.png` });
  console.log('shot', id);
  // 起飞回探索模式再前往下一天体
  await ev(() => { window.__game.input.wheel += 1; });
  await sleep(800);
}
await browser.close();
console.log('DONE');
