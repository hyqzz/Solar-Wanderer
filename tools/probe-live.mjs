import puppeteer from 'puppeteer';
const b = await puppeteer.launch({
  headless: true,
  acceptInsecureCerts: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list'],
});
const p = await b.newPage();
await p.setViewport({ width: 480, height: 300 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const t0 = Date.now();
try {
  await p.goto('https://sw.icodestar.net/?clean=1&quality=medium&pr=1', { waitUntil: 'networkidle2', timeout: 180000 });
  await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
  console.log('加载完成', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 12000));
  const info = await p.evaluate(() => {
    const g = window.__game;
    return {
      hasGame: !!g,
      mode: g?.getMode?.(),
      bodies: g?.builder?.bodies?.size ?? null,
      quality: g?.quality?.name ?? null,
      exposure: g?.renderer?.toneMappingExposure ?? null,
      // 本轮新增能力的探针：本地有、线上若无则是"本地领先"
      hasEvaSuit: (() => { let f = false; g?.overlayScene?.traverse?.((o) => { if (o.userData?.update && o.children.length >= 2) f = true; }); return f; })(),
      hasShapeModel: !!(g?.builder?.bodies?.get?.('phobos')),
      fogRef: !!g?.renderer?.__fogRef,
    };
  });
  console.log(JSON.stringify(info));
  console.log('页面错误', errs.length, errs.slice(0, 3));
  await p.screenshot({ path: 'tools/.shot-live-smoke.png' });
} catch (e) {
  console.log('失败:', e.message);
  console.log('页面错误', errs.slice(0, 5));
}
await b.close();
