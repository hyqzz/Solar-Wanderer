// 极光专项：夜侧极区临边掠射视角（发射壳层光程最长处），uSolarActivity 拉满。
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

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);

await ev(() => window.__game.flyTo('earth'));
await sleep(3000);

// 计算夜侧星下点并把极光强度拉满
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
  // 夜侧极光卵：纬度 65-75°N（poleProx≈0.9），经度正对反日点
  g.orbitCam.lat = 1.22;      // ~70°N
  g.orbitCam.lon = lonSub + Math.PI;
  g.orbitCam.distTarget = 6371 * 1.35; // 2228km 高，临边看壳层
  // 极光拉满 + 恢复细节档
  for (const [, b] of g.builder.bodies) {
    const u = b.mat?.userData.uniforms;
    if (u?.uSolarActivity) u.uSolarActivity.value = 1.0;
    if (u?.uDetailMode) u.uDetailMode.value = (b.phys.type === 'gas' || b.phys.type === 'ice') ? 2 : (b.phys.landable ? 1 : 0);
  }
  // fpsGuard 在软渲染下已把 QUALITY.detail 置 0（极光每帧被清零）——恢复细节档
  g.quality.detail = true;
  // 大气材质的 uniforms 在 atmoMesh.material.userData.uniforms
  // 注意：uSolarActivity/uAuroraStrength 每帧被 builder 覆写，只能从源头改
});
await sleep(3000);
await page.screenshot({ path: OUT + 'fix-aurora-limb.png' });
console.log('📷 fix-aurora-limb（夜侧 70°N 临边，活动度 1.0）');

// 远景：2.2R 从 45°N 夜侧望向极冠——极光卵应呈环绕极区的光带
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 0.79; // 45°N
  g.orbitCam.distTarget = 6371 * 2.2;
});
await sleep(2500);
await page.screenshot({ path: OUT + 'fix-aurora-wide.png' });
console.log('📷 fix-aurora-wide（45°N 2.2R 望极冠）');

if (errors.length) { console.log('错误:'); errors.forEach((e) => console.log('  🔥', e)); }
else console.log('零控制台/页面错误 ✅');
await browser.close();
