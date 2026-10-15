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
await ev(() => { window.__game.orbitCam.flyTo(window.__game.orbitEnv, 'encke'); });
let done = false;
const t0 = Date.now();
while (Date.now() - t0 < 40000) { await sleep(500); if (await ev(() => { const oc = window.__game.orbitCam; return oc.flight === null && oc.focusId === 'encke'; })) { done = true; break; } }
await sleep(3000);
console.log(JSON.stringify(await ev(() => {
  const g = window.__game;
  const G = g.registry.get('encke').relObj;
  const chain = [];
  let p = G; while (p) { chain.push(p.type + (p.visible === false ? '(hidden)' : '')); p = p.parent; }
  return { chain, near: g.camera.near, far: g.camera.far, fov: g.camera.fov,
    headMat: { sizeAtt: G.children[0].material.sizeAttenuation, depthTest: G.children[0].material.depthTest, blending: G.children[0].material.blending, hasMap: !!G.children[0].material.map },
    sceneChildren: g.camera.parent ? g.camera.parent.children.length : null };
})));
await page.screenshot({ path: 'tools/.shot-tour/_diag-comet-a.png' });
// 强制放大彗发
await ev(() => { const G = window.__game.registry.get('encke').relObj; G.children[0].scale.setScalar(2e7); });
await sleep(2500);
await page.screenshot({ path: 'tools/.shot-tour/_diag-comet-b.png' });
// 拉近到 5e5 km
await ev(() => { const oc = window.__game.orbitCam; oc.dist = oc.distTarget = 5e5; });
await sleep(3000);
await page.screenshot({ path: 'tools/.shot-tour/_diag-comet-c.png' });
await browser.close();
console.log('DONE');
