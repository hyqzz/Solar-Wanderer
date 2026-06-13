// 诊断 Mimas 不遮挡 Saturn 的根因：复现几何后转储渲染管线关键状态 + 逐项开关实验。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../docs/sdlc/screenshots/occlusion/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1400,900','--hide-scrollbars'],
  defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2500);
await page.keyboard.press('KeyO');
await page.evaluate(() => { for (const id of ['hud','left-col','labels']) { const e=document.getElementById(id); if(e) e.style.display='none'; } });

// 复现几何：推进 ~0.396 天后 subsolar 框定 Mimas
async function frame() {
  await page.evaluate(() => {
    const g = window.__game; const oc = g.orbitCam; const mim = g.builder.bodies.get('mimas');
    oc.flight = null; oc.focusId = 'mimas'; oc.vLat=oc.vLon=0; oc.heading=0; oc.tilt=0; oc.panOffset.set(0,0,0);
    const V3 = Object.getPrototypeOf(mim.mesh.position).constructor;
    const d = Math.hypot(mim.posKm[0],mim.posKm[1],mim.posKm[2]);
    const v = new V3(-mim.posKm[0]/d,-mim.posKm[1]/d,-mim.posKm[2]/d);
    v.applyQuaternion(mim.mesh.quaternion.clone().invert());
    oc.lat = Math.asin(Math.max(-1,Math.min(1,v.y))); oc.lon = Math.atan2(-v.z, v.x);
    oc.dist = oc.distTarget = mim.phys.radiusKm * 3.5;
  });
}
await page.evaluate(() => { window.__game.simClock.jdTT += 0.396; });
for (let i=0;i<5;i++){ await frame(); await sleep(150); }

const diag = await page.evaluate(() => {
  const g = window.__game;
  // 找 renderer/composer：从模块作用域不可见，尝试常见暴露点
  const out = {};
  const r = g.renderer || (window.__renderer);
  if (r) {
    out.isWebGL2 = r.capabilities.isWebGL2;
    out.logDepthCapable = r.capabilities.logarithmicDepthBuffer;
    out.sortObjects = r.sortObjects;
    out.autoClear = r.autoClear;
  } else out.rendererFound = false;
  out.camNear = g.camera.near; out.camFar = g.camera.far;
  const mim = g.builder.bodies.get('mimas'); const sat = g.builder.bodies.get('saturn');
  out.mimMatHasLogDepth = /logdepthbuf_fragment/.test(mim.mesh.material.fragmentShader || '');
  out.satMatHasLogDepth = /logdepthbuf_fragment/.test(sat.mesh.material.fragmentShader || '');
  out.mimDepth = mim.group.position.length(); out.satDepth = sat.group.position.length();
  return out;
});
console.log('DIAG', JSON.stringify(diag, null, 2));
await page.screenshot({ path: OUT + 'diag-baseline.png' }); console.log('📷 diag-baseline');

// 实验：把 camera.near 调大（降低 far/near 比），看遮挡是否恢复
await page.evaluate(() => { window.__game.camera.near = 1e-3; window.__game.camera.updateProjectionMatrix(); });
await sleep(500); await page.screenshot({ path: OUT + 'diag-near1e-3.png' }); console.log('📷 diag-near1e-3 (near=1m)');

await page.evaluate(() => { window.__game.camera.near = 0.1; window.__game.camera.updateProjectionMatrix(); });
await sleep(500); await page.screenshot({ path: OUT + 'diag-near0.1.png' }); console.log('📷 diag-near0.1 (near=100m)');

await browser.close();
