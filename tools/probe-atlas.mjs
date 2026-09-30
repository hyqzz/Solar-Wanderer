// 全天体"图册"截图：每个主要天体在日下点附近取景（近满相位，便于与真实影像对比纹理/颜色/大气），
// 输出到 tools/.shot-atlas/。另附土星环倾角视角、地球夜面、月面/火星/土卫六地表行走视角。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-atlas/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const BODIES = [
  ['sun', 2.5], ['mercury', 2.8], ['venus', 2.5], ['earth', 2.4], ['moon', 2.6],
  ['mars', 2.5], ['jupiter', 2.2], ['saturn', 2.6], ['uranus', 2.3], ['neptune', 2.3],
  ['pluto', 2.6], ['io', 2.8], ['europa', 2.8], ['ganymede', 2.6], ['callisto', 2.8],
  ['titan', 2.6], ['triton', 2.8],
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
// 锁死画质：阻止 fpsGuard 中途降档影响截图
await ev(() => { window.__game.quality.detail = true; });

// 相机放到日下点外侧（世界系：体位置 - 指向太阳方向 × dist），看向天体 = 近满相位
async function frameSubsolar(id, distR) {
  await ev((id, distR) => {
    const g = window.__game;
    g.quality.detail = true;
    const b = g.builder.bodies.get(id);
    const R = b.phys?.radiusKm ?? 1;
    const p = b.posKm;
    const l = Math.hypot(p[0], p[1], p[2]);
    const toSun = id === 'sun' ? { x: 1, y: 0.35, z: 0 } : { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
    // 世界方向 → 体固系经纬（与 probe-sun-occlusion 相同的四元数逆变换）
    const q = b.mesh.quaternion;
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
    const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
    const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
    const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
    const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    const oc = g.orbitCam;
    g.select(id);
    oc.focusId = id; // select() 只更新信息面板，焦点必须直接赋值
    oc.flight = null;
    oc.panOffset.set(0, 0, 0);
    oc.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
    oc.lon = Math.atan2(-lz, lx);
    oc.tilt = 0; oc.heading = 0;
    const rings = b.phys?.rings?.outerKm;
    oc.dist = oc.distTarget = Math.max(R, rings ?? 0) * distR;
  }, id, distR);
  await sleep(2600);
}

for (const [id, distR] of BODIES) {
  await frameSubsolar(id, distR);
  await page.screenshot({ path: `${OUT}${id}.png` });
  console.log('shot', id);
}

// 土星环侧倾角视角（环立体感检验）
await ev(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  oc.focusId = 'saturn';
  oc.lat = 0.42; // 环上方 24°
  oc.dist = oc.distTarget = 60268 * 3.2;
});
await sleep(2600);
await page.screenshot({ path: `${OUT}saturn-rings.png` });
console.log('shot saturn-rings');

// 地球夜面（城市灯光检验）：相机放背日点
await ev(() => {
  const g = window.__game;
  const b = g.builder.bodies.get('earth');
  const p = b.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const away = { x: p[0] / l, y: p[1] / l, z: p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * away.x + qy * away.z - qz * away.y;
  const iy = qw * away.y + qz * away.x - qx * away.z;
  const iz = qw * away.z + qx * away.y - qy * away.x;
  const iw = -qx * away.x - qy * away.y - qz * away.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const oc = g.orbitCam;
  oc.focusId = 'earth';
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  oc.lon = Math.atan2(-lz, lx);
  oc.dist = oc.distTarget = 6371 * 2.4;
});
await sleep(2600);
await page.screenshot({ path: `${OUT}earth-night.png` });
console.log('shot earth-night');
await browser.close();
console.log('DONE');
