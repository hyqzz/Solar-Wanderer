// 快速探针：打印页面控制台与错误，检查加载状态
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 600)));
page.on('requestfailed', (r) => console.log('[REQFAIL]', r.url().slice(0, 200), r.failure()?.errorText));
await page.goto(process.argv[2] ?? 'http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 15000));
const state = await page.evaluate(() => ({
  loading: document.getElementById('loading')?.style.display,
  progress: document.getElementById('loading-progress')?.textContent,
  btn: document.getElementById('start-btn')?.style.display,
  game: !!window.__game,
}));
console.log('STATE:', JSON.stringify(state));
await browser.close();
