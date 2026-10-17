// 读运行时 uniform：判断"暗"是光照/曝光还是贴图本身。
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 800, height: 500 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));
const ids = ['earth', 'mars', 'moon', 'enceladus', 'mimas', 'pluto', 'jupiter'];
for (const id of ids) {
  await p.evaluate((bid) => {
    const g = window.__game, oc = g.orbitCam;
    const e = g.builder.bodies.get(bid) ?? [...g.registry.values()].find(t => t.id === bid);
    g.select(bid); oc.focusId = bid; oc.flight = null;
    oc.dist = oc.distTarget = (e.phys?.radiusKm ?? 1000) * 3;
  }, id);
  await new Promise((r) => setTimeout(r, 5000));
  const info = await p.evaluate((bid) => {
    const g = window.__game;
    const e = g.builder.bodies.get(bid) ?? [...g.registry.values()].find(t => t.id === bid);
    const u = e?.mat?.userData?.uniforms;
    const dAU = Math.hypot(...e.posKm) / 1.495978707e8;
    return {
      dAU: +dAU.toFixed(3),
      sunI: u?.uSunI ? +u.uSunI.value.toFixed(4) : null,
      grade: u?.uGrade ? u.uGrade.value.toArray().map(v => +v.toFixed(2)) : null,
      sat: u?.uSat ? +u.uSat.value.toFixed(2) : null,
      exposure: +g.renderer.toneMappingExposure.toFixed(3),
      mapSize: u?.uMap?.value?.image ? `${u.uMap.value.image.width}x${u.uMap.value.image.height}` : null,
      mapFile: u?.uMap?.value?.userData?.file ?? u?.uMap?.value?.name ?? null,
    };
  }, id);
  console.log(id.padEnd(10), JSON.stringify(info));
}
await b.close();
