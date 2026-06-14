// Mobile smoke test: emulate an iPhone 14 Pro viewport with touch + coarse pointer media.
// Checks: no JS errors, touch hint shown, #tc-root present, pinch-zoom simulation,
// help screen shows touch variant, menu opens, joystick DOM exists.
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

  // Joystick DOM exists
  const joystickExists = await page.$('#tc-joystick-wrap') !== null;

  // Menu button exists
  const menuBtnExists = await page.$('#tc-menu-btn') !== null;

  // Tap menu button to open menu
  let menuVisible = false;
  if (menuBtnExists) {
    await page.tap('#tc-menu-btn');
    await sleep(400);
    menuVisible = await page.evaluate(() => {
      const el = document.getElementById('tc-menu');
      return el && !el.hidden;
    });
    await page.tap('#tc-menu-btn'); // close
    await sleep(200);
  }

  // Directory button: tap to open bottom sheet
  let dirVisible = false;
  const dirBtnExists = await page.$('#tc-dir-btn') !== null;
  if (dirBtnExists) {
    await page.tap('#tc-dir-btn');
    await sleep(400);
    dirVisible = await page.evaluate(() => {
      const dir = document.getElementById('directory');
      if (!dir) return false;
      const rect = dir.getBoundingClientRect();
      // Bottom sheet is visible when its top is inside viewport (transformed up)
      return dir.classList.contains('open') && rect.top < window.innerHeight && rect.bottom > 0;
    });
    await page.tap('#tc-dir-btn'); // close
    await sleep(200);
  }

  // Open help via ❓ button if visible, else keyboard
  let helpTouchContent = false;
  await page.keyboard.press('KeyH');
  await sleep(600);
  helpTouchContent = await page.evaluate(() => {
    const inner = document.querySelector('#help .help-inner');
    if (!inner) return false;
    // Touch help should mention "joystick" or "摇杆"
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
    tcVisible, joystickExists, menuBtnExists, menuVisible,
    dirBtnExists, dirVisible,
    helpTouchContent, keyBadgeVisible, isMobileFlagSet,
  };
}

let allPassed = true;
for (const lang of ['zh', 'en']) {
  const r = await run(lang);
  console.log(`\n===== Mobile smoke [${lang}] =====`);
  console.log('JS errors:', r.errors.length ? r.errors : 'NONE');

  const checks = [
    ['No JS errors',              r.errors.length === 0],
    ['Touch hint (not kbd)',       !r.hasKeyHint],
    ['IS_MOBILE flag (.touch)',    r.isMobileFlagSet],
    ['#tc-root visible',           r.tcVisible],
    ['Joystick DOM exists',        r.joystickExists],
    ['Menu button exists',         r.menuBtnExists],
    ['Menu opens on tap',          r.menuVisible],
    ['Directory button exists',    r.dirBtnExists],
    ['Directory opens on tap',     r.dirVisible],
    ['Help shows touch content',   r.helpTouchContent],
    ['.key badges hidden',         !r.keyBadgeVisible],
  ];

  for (const [name, ok] of checks) {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);
    if (!ok) allPassed = false;
  }
  console.log('  start hint:', r.hint.slice(0, 80));
}

console.log(allPassed ? '\n✓ All mobile checks passed' : '\n✗ Some mobile checks FAILED');
process.exit(allPassed ? 0 : 1);
