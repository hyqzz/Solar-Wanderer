// Issues #58/#59/#60 复现+验证（需 dev server: npm run dev）
// #58 左侧天体目录内容超高时无法滚动 —— 桌面端 #directory 缺 max-height、#dir-body 缺 min-height:0
// #59 时间倍率进入负数后按 ] 无法回到正数 —— warpUp 未处理负号方向
// #60 备案号硬编码 —— 自部署域名也显示官方 ICP 号；改为仅 *.icodestar.net 显示
// 用法：node tools/repro-issues-58-59-60.mjs [port]

import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.argv[2] || '5173';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

// 视口须 >1024 以避开移动端判定（quality.js smallScreen 分支，触屏机型上会切成底部抽屉布局）。
// 目录全展开后内容 ~2300px，1100px 视口下仍必然溢出，可复现 #58 场景。
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,1100', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 1100 },
});
const page = await browser.newPage();
// 触屏开发机上 headless 会继承 pointer:coarse / maxTouchPoints —— 伪装成纯桌面设备，
// 否则 quality.js 判定为移动端、目录切成底部抽屉，无法测桌面路径
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
  const origMM = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer:\s*coarse/.test(q)) {
      return { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
    }
    return origMM(q);
  };
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });

// ---- #60 备案号：非官方域名（localhost）不得显示 ----
console.log('\n[Issue-60] 备案号仅官方域名显示');
const beian = await page.evaluate(() => {
  const el = document.getElementById('beian');
  return { exists: !!el, hidden: el?.hidden, text: el?.textContent ?? '', visible: el ? getComputedStyle(el).display !== 'none' && !el.hidden && el.textContent.length > 0 : false };
});
check('localhost 下 #beian 不显示（hidden 且无文本）', beian.exists && beian.hidden && beian.text === '',
  JSON.stringify(beian));
// 域名门控正则本身的正反用例
const re = /(^|\.)icodestar\.net$/;
check('正则匹配官方域名 sw.icodestar.net / icodestar.net',
  re.test('sw.icodestar.net') && re.test('icodestar.net'));
check('正则拒绝自部署域名（example.com / evil-icodestar.net / hyqzz.github.io）',
  !re.test('example.com') && !re.test('evil-icodestar.net') && !re.test('hyqzz.github.io'));

// ---- 进入应用 ----
await page.click('#start-btn');
await sleep(3000);

// ---- #58 目录滚动 ----
console.log('\n[Issue-58] 天体目录超高时可滚动');
const isTouchLayout = await page.evaluate(() => document.documentElement.classList.contains('touch'));
check('桌面布局生效（非移动端抽屉）', !isTouchLayout, 'html.touch 被激活，需增大视口');
const dir = await page.evaluate(() => {
  // 展开全部分组，最大化内容高度（复现截图中的长目录）
  document.querySelectorAll('#dir-body details').forEach((d) => { d.open = true; });
  const panel = document.getElementById('directory');
  const body = document.getElementById('dir-body');
  const pr = panel.getBoundingClientRect();
  const overflow = body.scrollHeight > body.clientHeight;
  const before = body.scrollTop;
  body.scrollTop = 99999;
  const after = body.scrollTop;
  body.scrollTop = 0;
  return {
    panelBottom: pr.bottom, viewportH: innerHeight,
    scrollH: body.scrollHeight, clientH: body.clientHeight,
    overflow, scrolled: after > before,
  };
});
check('复现：内容高于可视区（scrollHeight > clientHeight）', dir.overflow,
  `scrollH=${dir.scrollH}, clientH=${dir.clientH}（未复现说明视口不够矮或目录太短）`);
check('面板底边不超出视口（max-height 生效）', dir.panelBottom <= dir.viewportH + 1,
  `panelBottom=${dir.panelBottom.toFixed(0)}, viewport=${dir.viewportH}`);
check('#dir-body 可实际滚动（scrollTop 可变）', dir.scrolled,
  `scrollTop 设置后=${dir.scrolled}`);

// 静态断言：桌面基础规则（media query 之外）必须带视口内 max-height —— 纯桌面
// fine-pointer 机器不落入 @media (pointer:coarse) 分支，全靠这条规则修复 #58
const cssRules = await page.evaluate(() => {
  const found = { dirMaxHeight: null, bodyMinHeight: null };
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.type !== CSSRule.STYLE_RULE) continue; // 只看顶层规则，排除 @media 内
      if (r.selectorText === '#directory' && r.style.maxHeight) found.dirMaxHeight = r.style.maxHeight;
      if (r.selectorText === '#dir-body' && r.style.minHeight) found.bodyMinHeight = r.style.minHeight;
    }
  }
  return found;
});
// CSSOM 可能把 calc(100dvh - 124px) 序列化为 calc(-124px + 100dvh)
check('桌面基础规则 #directory 带 max-height（calc 视口内）',
  /calc\((100d?vh - 124px|-124px \+ 100d?vh)\)/.test(cssRules.dirMaxHeight ?? ''), `maxHeight=${cssRules.dirMaxHeight}`);
check('桌面基础规则 #dir-body 带 min-height:0（flex 收缩前提）',
  cssRules.bodyMinHeight === '0px', `minHeight=${cssRules.bodyMinHeight}`);

// ---- #59 时间倍率：负 → 正可恢复 ----
console.log('\n[Issue-59] 时间倍率负数后可回到正数');
const rate = () => page.evaluate(() => window.__game.simClock.rate);
// 每次按键后等倍率实际变化（帧循环消费 tapped 有延迟，固定 sleep 会丢按键）
const press = async (code, n = 1) => {
  for (let i = 0; i < n; i++) {
    const before = await rate();
    await page.keyboard.press(code, { delay: 60 });
    const t0 = Date.now();
    while (Date.now() - t0 < 1500 && (await rate()) === before) await sleep(50);
  }
};
const r0 = await rate();
check('初始倍率 = 1', r0 === 1, `rate=${r0}`);

await press('BracketLeft', 3); // 1 → −1 → −10 → −60
const rNeg = await rate();
check('按 [ ×3 进入负倍率（−60）', rNeg === -60, `rate=${rNeg}`);

await press('BracketRight', 3); // −60 → −10 → −1 → +1
const rBack = await rate();
check('按 ] ×3 回到 +1（修复点：负倍率下 ] 向正方向走）', rBack === 1, `rate=${rBack}`);

await press('BracketRight', 1);
const rUp = await rate();
check('继续按 ] 正常加速到 +10', rUp === 10, `rate=${rUp}`);

// 负方向仍正常：[ 从 +1 翻到 −1
await press('BracketLeft', 2); // 10 → 1 → −1
const rFlip = await rate();
check('按 [ 从 +1 翻到 −1（原有行为未破坏）', rFlip === -1, `rate=${rFlip}`);
await press('BracketRight', 1); // −1 → +1
const rFlip2 = await rate();
check('−1 时按 ] 翻回 +1', rFlip2 === 1, `rate=${rFlip2}`);

check('全程无页面运行时错误', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
