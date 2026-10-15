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
const t0 = Date.now();
while (Date.now() - t0 < 40000) { await sleep(500); if (await ev(() => { const oc = window.__game.orbitCam; return oc.flight === null && oc.focusId === 'encke'; })) break; }
await sleep(3000);
console.log(JSON.stringify(await ev(() => {
  const g = window.__game;
  const env = g.registry.get('encke');
  const G = env.relObj;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const wp = new V(G.position.x, G.position.y, G.position.z);
  const head = G.children[0];
  const proj = wp.clone().project(g.camera);
  return {
    groupVisible: G.visible, groupPos: G.position.toArray().map(v => +v.toFixed(0)),
    worldPos: wp.length().toFixed(0), camDist: wp.length().toFixed(0),
    camQuat: [+g.camera.quaternion.x.toFixed(2), +g.camera.quaternion.y.toFixed(2), +g.camera.quaternion.z.toFixed(2), +g.camera.quaternion.w.toFixed(2)],
    ndc: [+proj.x.toFixed(2), +proj.y.toFixed(2), +proj.z.toFixed(3)],
    headType: head?.type, headScale: head ? +head.scale.x.toFixed(0) : null,
    headOpacity: head ? +head.material.opacity.toFixed(2) : null,
    headVisible: head ? head.visible : null,
    envQuat: env.quatRef ? 'yes' : 'undefined',
    children: G.children.map(c => c.type),
    ocDist: Math.round(g.orbitCam.dist), ocLat: +g.orbitCam.lat.toFixed(3), ocTilt: +g.orbitCam.tilt.toFixed(3),
    renderOrder: G.renderOrder,
  };
})));
await browser.close();
