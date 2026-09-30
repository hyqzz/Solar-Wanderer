// NaN 猎手：扫描地形各级 position/normal/color 数组中的 NaN/Infinity。
import puppeteer from 'puppeteer';

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
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => window.__game.flyTo('moon'));
await sleep(2500);
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = -59.8 * Math.PI / 180;
  g.orbitCam.lon = 0;
  g.orbitCam.distTarget = 1737.4 + 30;
});
await sleep(3000);
await page.mouse.move(800, 450);
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
await sleep(3500);

const scan = await ev(() => {
  const ps = window.__game.terrainMgr.active?.patches;
  if (!ps) return 'no patches';
  const out = [];
  for (let li = 0; li < ps.levels.length; li++) {
    const lv = ps.levels[li];
    const rep = { li, extent: lv.extent };
    for (const attr of ['position', 'normal', 'color', 'slope', 'water']) {
      const arr = lv.geo.attributes[attr]?.array;
      if (!arr) { rep[attr] = 'missing'; continue; }
      let nan = 0, inf = 0, big = 0, firstBad = -1;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (Number.isNaN(v)) { nan++; if (firstBad < 0) firstBad = i; }
        else if (!Number.isFinite(v)) { inf++; if (firstBad < 0) firstBad = i; }
        else if (Math.abs(v) > 1e6) { big++; if (firstBad < 0) firstBad = i; }
      }
      rep[attr] = { nan, inf, big, firstBad };
    }
    out.push(rep);
  }
  return out;
});
for (const r of scan) {
  console.log(`L${r.li} extent=${r.extent}: pos=${JSON.stringify(r.position)} nrm=${JSON.stringify(r.normal)} col=${JSON.stringify(r.color)} slope=${JSON.stringify(r.slope)} water=${JSON.stringify(r.water)}`);
}
await browser.close();
