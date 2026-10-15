// 主循环错误角标回归：异常被兜底捕获时，用户必须看得见，而不是只看到画面卡住。
// 需要本地服务：npm run build && npx vite preview --port 4199
import puppeteer from 'puppeteer';
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:4199/') + '?clean=1';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 640, height: 480 });
await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

let failures = 0;
const check = (n, ok, d) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d === undefined ? '' : '  ' + JSON.stringify(d)}`); };

const before = await p.evaluate(() => {
  const el = document.getElementById('hud-err');
  return { exists: !!el, display: el ? getComputedStyle(el).display : null, errN: window.__errLog?.length ?? 0 };
});
check('无错误时角标不存在或隐藏', !before.exists || before.display === 'none', before);

// 注入一条错误，主循环下一帧应把角标显示出来
await p.evaluate(() => { (window.__errLog = window.__errLog || []).push({ tag: 'selfTest', msg: '注入的测试错误', t: Date.now() }); });
await new Promise(r => setTimeout(r, 2500));
const after = await p.evaluate(() => {
  const el = document.getElementById('hud-err');
  return { display: el ? getComputedStyle(el).display : null, text: el?.textContent ?? '', clickable: el ? getComputedStyle(el).pointerEvents : null };
});
check('注入错误后角标显示', after.display === 'block', after);
check('角标含错误数', /1/.test(after.text), after.text);
check('角标可点击（用于复制详情）', after.clickable === 'auto', after.clickable);

await b.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exitCode = failures ? 1 : 0;
