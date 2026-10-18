import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1100, height: 1500 });
await p.goto('file:///C:/Users/hyqzz/Projects/solorsystem/.cmp/Solar-Wanderer-%E7%89%88%E6%9C%AC%E5%AF%B9%E6%AF%94.html', { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: '.cmp/report-top.png' });
const info = await p.evaluate(() => ({
  imgs: [...document.images].length,
  broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
  h: document.body.scrollHeight,
  w: document.body.scrollWidth,
  title: document.title,
}));
console.log(JSON.stringify(info));
// 滚到图册
await p.evaluate(() => { const h2 = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('补充图册')); h2?.scrollIntoView(); });
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: '.cmp/report-gallery.png' });
await b.close();
