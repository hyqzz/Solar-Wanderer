import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox','--window-position=-2400,-2400','--window-size=1280,760','--hide-scrollbars'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(() => {
  const o = window.matchMedia.bind(window);
  window.matchMedia = (q) => /pointer\s*:\s*coarse/.test(q) ? { matches:false, addEventListener(){}, addListener(){} } : /any-pointer\s*:\s*fine/.test(q) ? { matches:true, addEventListener(){}, addListener(){} } : o(q);
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
await ev(() => { window.__game.quality.detail = true; document.getElementById('directory')?.classList.remove('open'); });
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
async function settle(n = 5) { const m = await ev(() => window.__fc); const t0 = Date.now(); while (Date.now()-t0 < 20000) { await sleep(200); if ((await ev(() => window.__fc)) - m >= n) return; } }
await ev(() => { window.__game.orbitCam.flyTo(window.__game.orbitEnv, 'encke'); });
const t0 = Date.now();
while (Date.now() - t0 < 40000) { await sleep(500); if (await ev(() => { const oc = window.__game.orbitCam; return oc.flight === null && oc.focusId === 'encke'; })) break; }
await settle(5);
console.log('near(km) =', await ev(() => Math.round(window.__game.camera.near)));
await page.screenshot({ path: 'tools/.shot-tour/09-彗星恩克.png' });
await ev(() => { const oc = window.__game.orbitCam; oc.dist = oc.distTarget = 1.0e7; });
await settle(5);
await page.screenshot({ path: 'tools/.shot-tour/09b-彗星恩克远.png' });
await browser.close();
console.log('DONE');
