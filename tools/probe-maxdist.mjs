// #7：用 orbitCam 把相机推到 ~400 AU 俯视太阳系，统计可见标签（应含 TNO/恒星/区域）。
import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,900', '--hide-scrollbars'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2000);

const stats = await page.evaluate(async () => {
  const g = window.__game; const oc = g.orbitCam; const AU = 149597870.7;
  oc.flight = null; oc.cancelFlight?.(); oc.focusId = 'sun';
  oc.pendingFocusId = null; oc.transition = null;
  oc.lat = Math.PI / 2 - 0.001; oc.lon = 0; oc.heading = 0; oc.tilt = 0;
  oc.panOffset?.set?.(0, 0, 0);
  oc.dist = oc.distTarget = 400 * AU;
  await new Promise((r) => setTimeout(r, 800));
  const container = document.getElementById('labels');
  const vis = [...container.children].filter((el) => el.style.display !== 'none');
  const texts = vis.map((el) => el.querySelector('.ln')?.textContent).filter(Boolean);
  return {
    camDistAU: Math.hypot(g.ship.posKm[0], g.ship.posKm[1], g.ship.posKm[2]) / AU,
    total: container.children.length, visible: vis.length, texts,
  };
});
console.log(`camera at ${stats.camDistAU.toFixed(0)} AU from Sun`);
console.log(`labels visible: ${stats.visible}/${stats.total}`);
console.log('texts:', stats.texts.join(', '));
const hasOort = stats.texts.some((t) => /奥尔特|Oort/.test(t));
const hasBelts = stats.texts.some((t) => /星带|Belt/.test(t));
const tnoCount = stats.texts.filter((t) => /Gonggong|Eris|Sedna|Makemake|Haumea|Quaoar|Orcus|Ixion|Chaos|Farout|阋神|妊神|鸟神|创神|共工/.test(t)).length;
console.log(`region: Oort=${hasOort} Belts=${hasBelts}; TNO labels=${tnoCount}`);
console.log('page errors:', errs.length ? errs : 'NONE');
await browser.close();
process.exit(0);
