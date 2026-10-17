// 首屏传输量：打开页面并统计所有网络响应的字节数，按类型分组。
// 用途：构建产物 362MB 里有多少是**首屏必须**的？其余是否都走按需/后台？
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const bytes = new Map();
p.on('response', async (r) => {
  try {
    const h = r.headers()['content-length'];
    const n = h ? +h : (await r.buffer().catch(() => null))?.length ?? 0;
    const u = new URL(r.url());
    const key = u.pathname.replace(/^.*\./, '.').replace(/^.*\/([^/]*)$/, '$1');
    bytes.set(key, (bytes.get(key) ?? 0) + n);
  } catch { /* 忽略 */ }
});
const t0 = Date.now();
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium&pr=1', { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 180000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 20000));
let total = 0;
const rows = [...bytes.entries()].sort((a, c) => c[1] - a[1]);
for (const [k, v] of rows) total += v;
console.log(`首屏 + 20s 后台：共 ${(total / 1048576).toFixed(1)} MB，${rows.length} 类`);
for (const [k, v] of rows.slice(0, 14)) console.log(`  ${(v / 1048576).toFixed(2).padStart(8)} MB  ${k}`);
await b.close();
