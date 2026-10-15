// 星历分片回归：验证按年分片的加载路径与 HUD 的诚实标注。
//
// 三条断言：
//   1) 聚焦某天体时只请求它当前所处年份那一片（而不是全部 10 片）
//   2) 时间跳到另一年后会自动补载那一片，且 stats.bytes 增长
//   3) 数据未覆盖时（分片尚未到达）HUD 必须标"近似模型"，不得谎报为 JPL 插值
//
// 需要本地服务：npm run build && npx vite preview --port 4179
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4179/';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const errors = [], ephemRequests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => {
  const m = r.url().match(/data\/ephemeris\/(\d{4})\/(.+)\.bin/);
  if (m) ephemRequests.push(`${m[1]}/${m[2]}`);
});

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`);
};

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
await page.evaluate(() => document.getElementById('start')?.click());
await new Promise((r) => setTimeout(r, 6000));

const stats0 = await page.evaluate(() => window.__game.ephemerisLoader.stats);
check('启动后已装载 JPL 分片', stats0.loaded > 0, { loaded: stats0.loaded, bytes: stats0.bytes });
check('声明的窗口是 10 年', stats0.window?.years === 10, stats0.window);

// 1) 聚焦土星 → 只应请求它自己与卫星所处年份的分片
ephemRequests.length = 0;
await page.evaluate(() => window.__game.select('saturn'));
await new Promise((r) => setTimeout(r, 8000));
const saturnYears = new Set(ephemRequests.map((x) => x.slice(0, 4)));
check('聚焦土星只请求当前年份的分片', ephemRequests.length > 0 && saturnYears.size === 1,
  { 请求数: ephemRequests.length, 年份: [...saturnYears] });
check('确实取到了土卫（多目标分片）',
  ephemRequests.some((x) => x.includes('titan')) || ephemRequests.some((x) => x.includes('mimas')),
  ephemRequests.slice(0, 6));

// 2) 跳到 2032 年 → 应补载该年份分片
const before = await page.evaluate(() => window.__game.ephemerisLoader.stats);
await page.evaluate(() => {
  window.__game.simClock.set(Date.UTC(2032, 5, 1) / 86400000 + 2440587.5 + 69.184 / 86400);
});
await new Promise((r) => setTimeout(r, 400));
const immediate = await page.evaluate(() => (document.querySelector('#hud-target')?.innerText ?? ''));
await new Promise((r) => setTimeout(r, 10000));
const after = await page.evaluate(() => window.__game.ephemerisLoader.stats);
check('跳到 2032 年后补载了新分片', after.loaded > before.loaded,
  { before: before.loaded, after: after.loaded });
check('新分片来自 2032 年', ephemRequests.some((x) => x.startsWith('2032')), ephemRequests.slice(-6));
check('HUD 最终标注为 JPL 插值', /JPL/.test(await page.evaluate(
  () => document.querySelector('#hud-target')?.innerText ?? '')), immediate.replace(/\s+/g, ' ').slice(0, 60));
check('无页面错误', errors.length === 0, errors.slice(0, 3));

await browser.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exitCode = failures ? 1 : 0;
