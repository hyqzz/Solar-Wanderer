// Mobile smoke test: emulate an iPhone 14 Pro viewport with touch + coarse pointer media.
// Checks (v2.0.0 UI): no JS errors, touch hint shown, #tc-root present, joystick DOM,
// ☰ (tc-menu-btn) opens the directory bottom sheet, directory auto-hides on body select,
// persistent time widget (tc-time-btn) expands/collapses the time+display panel,
// help screen shows touch variant.
// Requires: dev server running at http://localhost:5173
import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(lang) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=390,844',
      '--hide-scrollbars',
      `--lang=${lang === 'en' ? 'en-US' : 'zh-CN'}`,
    ],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  await page.emulateTimezone('UTC');

  // Force coarse-pointer media query and touch detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    const origMatchMedia = window.matchMedia;
    window.matchMedia = (query) => {
      if (query === '(pointer: coarse)') {
        return { matches: true, media: query, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
      }
      return origMatchMedia(query);
    };
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = lang === 'en' ? 'http://localhost:5173/en/' : 'http://localhost:5173/';
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });

  // Check start screen touch hint (should say pinch/tap, not keyboard shortcuts)
  const hint = await page.$eval('.hint', (e) => e.textContent.trim()).catch(() => '');
  const hasKeyHint = hint.includes('W/S');

  // Check start screen title order matches requested locale
  const titleOrder = await page.evaluate(() => {
    const main = [...document.querySelectorAll('.title-block .main-title')].find((e) => window.getComputedStyle(e).display !== 'none');
    if (!main) return 'missing';
    return main.textContent.trim();
  });
  const titleCorrect = lang === 'zh' ? titleOrder === '遨游太阳系' : titleOrder === 'Solar Wanderer';

  // Tap start button via touch
  const startBtn = await page.$('#start-btn');
  await startBtn.tap();
  await sleep(3000);

  // #tc-root (touch controls) should now be visible
  const tcVisible = await page.evaluate(() => {
    const el = document.getElementById('tc-root');
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none';
  });

  // Directory should be closed by default on mobile
  const dirClosedByDefault = await page.evaluate(() => {
    const dir = document.getElementById('directory');
    return dir && !dir.classList.contains('open');
  });

  // Joystick DOM exists
  const joystickExists = await page.$('#tc-joystick-wrap') !== null;

  // Orbit-mode action bar should NOT contain a fly button on mobile
  const flyBtnInOrbit = await page.evaluate(() => {
    const btn = document.getElementById('tc-fly-btn');
    return !!btn;
  });

  // Persistent time widget: button always visible, panel collapsed by default
  const timeBtnExists = await page.$('#tc-time-btn') !== null;
  const timeValExists = await page.$('#tc-time-val') !== null;
  const timePanelHiddenByDefault = await page.evaluate(() => {
    const p = document.getElementById('tc-time-panel');
    return !!p && p.hidden === true;
  });

  // Tap time button → panel expands; tap again → collapses
  let timePanelOpens = false;
  let timePanelCloses = false;
  if (timeBtnExists) {
    await page.tap('#tc-time-btn');
    await sleep(400);
    timePanelOpens = await page.evaluate(() => {
      const p = document.getElementById('tc-time-panel');
      return !!p && p.hidden === false;
    });
    await page.tap('#tc-time-btn');
    await sleep(300);
    timePanelCloses = await page.evaluate(() => {
      const p = document.getElementById('tc-time-panel');
      return !!p && p.hidden === true;
    });
  }

  // ☰ (tc-menu-btn) is the directory button in v2.0.0
  const menuBtnExists = await page.$('#tc-menu-btn') !== null;
  let dirOpens = false;
  let dirAutoHides = false;
  let backdropDimming = false;
  if (menuBtnExists) {
    await page.tap('#tc-menu-btn');
    await sleep(400);
    dirOpens = await page.evaluate(() => {
      const dir = document.getElementById('directory');
      if (!dir) return false;
      const rect = dir.getBoundingClientRect();
      return dir.classList.contains('open') && rect.top < window.innerHeight && rect.bottom > 0;
    });
    // Backdrop should not dim (transparent background)
    backdropDimming = await page.evaluate(() => {
      const bd = document.getElementById('tc-backdrop');
      if (!bd || !bd.classList.contains('visible')) return false;
      const bg = window.getComputedStyle(bd).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    });
    // Tap first body item (Sun) and verify directory auto-closes
    dirAutoHides = await page.evaluate(() => {
      const item = [...document.querySelectorAll('.dir-item')].find((b) => b.textContent.includes('太阳') || b.textContent.includes('Sun'));
      if (item) item.click();
      const dir = document.getElementById('directory');
      return dir && !dir.classList.contains('open');
    });
    await sleep(200);
  }

  // Target (ℹ️) drawer button exists
  const tgtBtnExists = await page.$('#tc-tgt-btn') !== null;

  // Open help via keyboard and confirm touch-variant content
  await page.keyboard.press('KeyH');
  await sleep(600);
  const helpTouchContent = await page.evaluate(() => {
    const inner = document.querySelector('#help .help-inner');
    if (!inner) return false;
    return inner.textContent.includes('joystick') || inner.textContent.includes('摇杆');
  });
  await page.keyboard.press('KeyH');

  // Keyboard shortcut badges should be hidden on mobile
  const keyBadgeVisible = await page.evaluate(() => {
    const el = document.querySelector('.key');
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
  });

  // IS_MOBILE should be true
  const isMobileFlagSet = await page.evaluate(() => {
    return document.documentElement.classList.contains('touch');
  });

  await browser.close();

  return {
    lang, errors, hint, hasKeyHint,
    tcVisible, joystickExists,
    timeBtnExists, timeValExists, timePanelHiddenByDefault, timePanelOpens, timePanelCloses,
    menuBtnExists, dirOpens, dirClosedByDefault, dirAutoHides, tgtBtnExists,
    flyBtnInOrbit, backdropDimming,
    helpTouchContent, keyBadgeVisible, isMobileFlagSet,
    titleOrder, titleCorrect,
  };
}

let allPassed = true;
for (const lang of ['zh', 'en']) {
  const r = await run(lang);
  console.log(`\n===== Mobile smoke [${lang}] =====`);
  console.log('JS errors:', r.errors.length ? r.errors : 'NONE');

  const checks = [
    ['No JS errors',                r.errors.length === 0],
    ['Touch hint (not kbd)',         !r.hasKeyHint],
    ['Title order correct',          r.titleCorrect],
    ['IS_MOBILE flag (.touch)',      r.isMobileFlagSet],
    ['#tc-root visible',             r.tcVisible],
    ['Joystick DOM exists',          r.joystickExists],
    ['Time button exists',           r.timeBtnExists],
    ['Time value span exists',       r.timeValExists],
    ['Time panel hidden by default', r.timePanelHiddenByDefault],
    ['Time panel opens on tap',      r.timePanelOpens],
    ['Time panel closes on 2nd tap', r.timePanelCloses],
    ['Menu (☰) button exists',       r.menuBtnExists],
    ['Target (ℹ️) button exists',    r.tgtBtnExists],
    ['Directory closed by default',  r.dirClosedByDefault],
    ['☰ opens directory',            r.dirOpens],
    ['Directory auto-hides on go',   r.dirAutoHides],
    ['No orbit-mode fly button',     !r.flyBtnInOrbit],
    ['Backdrop does not dim',        !r.backdropDimming],
    ['Help shows touch content',     r.helpTouchContent],
    ['.key badges hidden',           !r.keyBadgeVisible],
  ];

  for (const [name, ok] of checks) {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);
    if (!ok) allPassed = false;
  }
  console.log('  start hint:', r.hint.slice(0, 80));
}

console.log(allPassed ? '\n✓ All mobile checks passed' : '\n✗ Some mobile checks FAILED');
process.exit(allPassed ? 0 : 1);
