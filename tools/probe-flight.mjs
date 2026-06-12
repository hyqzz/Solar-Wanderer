// 飞行动画状态逐秒采样诊断
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 400)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await new Promise((r) => setTimeout(r, 1500));

// 直接 flyTo 木星，逐秒采样
await page.evaluate(() => window.__game.flyTo('jupiter'));
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await page.evaluate(() => {
    const oc = window.__game.orbitCam;
    return {
      focus: oc.focusId, t: oc.flight?.t?.toFixed(3), dur: oc.flight?.dur?.toFixed(2),
      to: oc.flight?.toId, dist: (oc.dist / 1.496e8).toFixed(3) + 'AU',
      mode: window.__game.getMode(),
    };
  });
  console.log(i + 1 + 's', JSON.stringify(s));
}
await browser.close();
