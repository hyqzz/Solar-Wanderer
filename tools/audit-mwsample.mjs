import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium&pr=1', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
const v = await p.evaluate(() => {
  const t = window.__game.sky.group.children[0].material.map;
  const c = t.image;               // canvas
  const g2 = c.getContext('2d');
  const W = c.width, H = c.height;
  // 取中间一行的一百个采样，看有没有大块跳变
  const row = g2.getImageData(0, Math.floor(H*0.35), W, 1).data;
  const vals = [];
  for (let x = 0; x < W; x += Math.floor(W/40)) vals.push(row[x*4]);
  return { W, H, vals };
});
console.log(JSON.stringify(v));
await b.close();
