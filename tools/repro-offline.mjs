// 离线能力回归：Service Worker 是否注册并接管，以及断网后页面是否仍可打开。
// 需要本地服务：npm run build && npx vite preview --port 4199
import puppeteer from 'puppeteer';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4199/';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 640, height: 480 });
let failures = 0;
const check = (n, ok, d) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d === undefined ? '' : '  ' + JSON.stringify(d)}`); };

await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 150000 });
await new Promise((r) => setTimeout(r, 4000));
const reg = await p.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { has: !!r, active: !!r?.active, scope: r?.scope ?? null };
});
check('Service Worker 已注册并激活', reg.has && reg.active, reg);

// 让 SW 缓存下页面与主脚本，然后断开网络重新导航
await new Promise((r) => setTimeout(r, 6000));
await p.setOfflineMode(true);
let ok = true, detail = '';
try {
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  const title = await p.evaluate(() => document.title);
  detail = title;
  ok = !!title;
} catch (e) { ok = false; detail = String(e).slice(0, 80); }
check('断网后仍可重新打开页面', ok, detail);
await p.setOfflineMode(false);
await b.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exitCode = failures ? 1 : 0;
