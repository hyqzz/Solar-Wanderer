// 冒烟：分别以中文/英文 locale 加载，校验无运行时错误 + UI 文本本地化 + 区域/恒星标签存在。
import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(locale) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,900', '--hide-scrollbars', `--lang=${locale}`],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.emulateTimezone('UTC');
  // 覆盖 navigator.language 以模拟浏览器语言
  await page.evaluateOnNewDocument((loc) => {
    Object.defineProperty(navigator, 'language', { get: () => loc });
    Object.defineProperty(navigator, 'languages', { get: () => [loc] });
  }, locale);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });

  const startTxt = await page.$eval('#start-btn', (e) => e.textContent.trim());
  const subTxt = await page.$eval('.sub', (e) => e.textContent.trim());
  const dirTitle = await page.$eval('.dir-head', (e) => e.textContent.trim());
  await page.click('#start-btn');
  await sleep(2500);
  await page.keyboard.press('KeyH'); // open help
  const helpTitle = await page.$eval('#help h2', (e) => e.textContent.trim()).catch(() => '(none)');
  await page.keyboard.press('KeyH');

  // 区域条目 + 目录分组
  const dir = await page.evaluate(() => {
    const reg = window.__game.registry;
    return {
      hasAsteroidBelt: reg.has('asteroidbelt'), hasKuiperBelt: reg.has('kuiperbelt'), hasOort: reg.has('oortcloud'),
      regionGroup: [...document.querySelectorAll('#dir-body summary')].map((s) => s.textContent),
    };
  });
  // 时间面板（HUD 本地化）
  const timePanel = await page.$eval('#hud-time', (e) => e.textContent.trim());

  await browser.close();
  return { locale, errors, startTxt, subTxt, dirTitle, helpTitle, dir, timePanel };
}

for (const loc of ['zh-CN', 'en-US']) {
  const r = await run(loc);
  console.log('\n===== locale:', r.locale, '=====');
  console.log('errors:', r.errors.length ? r.errors : 'NONE');
  console.log('start-btn:', r.startTxt);
  console.log('subtitle:', r.subTxt);
  console.log('dir-head:', r.dirTitle);
  console.log('help h2:', r.helpTitle);
  console.log('region entries:', r.dir.hasBelts, r.dir.hasOort);
  console.log('dir groups:', r.dir.regionGroup.join(' | '));
  console.log('time panel:', r.timePanel.slice(0, 120));
}
process.exit(0);
