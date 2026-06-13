// 复现用户视图：相机贴近土卫一日照面(subsolar，~700km，Mimas 受光)，推进时间直到土星
// 落到 Mimas 之后且其受光面朝向相机 —— 验证 Mimas 是否真正遮挡土星本体。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../docs/sdlc/screenshots/occlusion/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,900', '--hide-scrollbars'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2500);
await page.keyboard.press('KeyO');
await page.evaluate(() => { for (const id of ['hud','left-col','labels']) { const e=document.getElementById(id); if(e) e.style.display='none'; } });

let shots = 0;
for (let step = 0; step < 160 && shots < 4; step++) {
  const info = await page.evaluate(() => {
    const g = window.__game;
    g.simClock.jdTT += 0.012;
    const oc = g.orbitCam; const mim = g.builder.bodies.get('mimas'); const sat = g.builder.bodies.get('saturn');
    // subsolar 框定（相机在 Mimas 受光面一侧）
    oc.flight = null; oc.focusId = 'mimas';
    oc.vLat = oc.vLon = 0; oc.heading = 0; oc.tilt = 0; oc.panOffset.set(0,0,0);
    const V3 = Object.getPrototypeOf(mim.mesh.position).constructor;
    const d = Math.hypot(mim.posKm[0], mim.posKm[1], mim.posKm[2]);
    const v = new V3(-mim.posKm[0]/d, -mim.posKm[1]/d, -mim.posKm[2]/d);
    v.applyQuaternion(mim.mesh.quaternion.clone().invert());
    oc.lat = Math.asin(Math.max(-1,Math.min(1,v.y)));
    oc.lon = Math.atan2(-v.z, v.x);
    oc.dist = oc.distTarget = mim.phys.radiusKm * 3.5;
    return true;
  });
  await sleep(120);
  const r = await page.evaluate(() => {
    const g = window.__game; const cam = g.camera;
    const proj = (grp) => { const v = grp.position.clone().project(cam); return { x:v.x, y:v.y, depth: grp.position.length() }; };
    const mim = g.builder.bodies.get('mimas'); const sat = g.builder.bodies.get('saturn');
    const pm = proj(mim.group), ps = proj(sat.group);
    // 土星受光面朝相机？相机在原点，土星 group.position 指向土星；太阳在 -satWorld 方向
    return { satOnScreen: Math.abs(ps.x)<0.85 && Math.abs(ps.y)<0.85,
      overlap: Math.hypot(pm.x-ps.x, pm.y-ps.y), satBehind: ps.depth>pm.depth,
      mimVisible: mim.mesh.visible };
  });
  if (r.satOnScreen && r.satBehind && r.overlap < 0.45) {
    await sleep(700);
    await page.screenshot({ path: OUT + `sub-${String(step).padStart(3,'0')}.png` });
    console.log(`📷 step ${step}: mimVisible=${r.mimVisible} satBehind=${r.satBehind} overlap=${r.overlap.toFixed(3)}`);
    shots++;
  }
}
if (!shots) console.log('未找到帧');
await browser.close();
