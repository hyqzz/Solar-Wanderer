// 诊断：火星滚轮自动着陆为何未触发——跟踪 dist/altGround/mode
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
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
await ev(() => window.__game.flyTo('mars'));
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 0.3; g.orbitCam.lon = 1.0;
  g.orbitCam.distTarget = 3396 + 5;
});
await sleep(2000);
await page.mouse.move(640, 360);
for (let i = 0; i < 140; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if (i % 10 === 0 || i > 130) {
    const s = await ev(() => {
      const g = window.__game;
      const oc = g.orbitCam;
      // 复算 altGround（与 main.js 相同的公式）
      const mars = g.builder.bodies.get('mars');
      const rel = [
        g.ship.posKm[0] - mars.posKm[0], g.ship.posKm[1] - mars.posKm[1], g.ship.posKm[2] - mars.posKm[2]];
      const q = mars.mesh.quaternion;
      const ix = q.w * rel[0] + q.y * rel[2] - q.z * rel[1];
      const iy = q.w * rel[1] + q.z * rel[0] - q.x * rel[2];
      const iz = q.w * rel[2] + q.x * rel[1] - q.y * rel[0];
      const iw = -q.x * rel[0] - q.y * rel[1] - q.z * rel[2];
      const lx = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
      const ly = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
      const lz = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
      const rl = Math.hypot(lx, ly, lz);
      const dir = { x: lx / rl, y: ly / rl, z: lz / rl };
      const h = g.terrainMgr.heightAt('mars', dir);
      return {
        mode: g.getMode(),
        dist: +oc.dist.toFixed(4), distTarget: +oc.distTarget.toFixed(4),
        altGround_m: +((rl - h) * 1000).toFixed(1),
        flight: !!oc.flight,
      };
    });
    console.log(`i=${i}`, JSON.stringify(s));
    if (s.mode === 'walk') { console.log('✅ 着陆成功'); break; }
  }
}
await browser.close();
