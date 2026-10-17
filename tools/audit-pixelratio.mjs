import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 600 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,12000));
const v = await p.evaluate(() => {
  const g = window.__game, gl = g.renderer.getContext();
  return { pixelRatio: g.renderer.getPixelRatio(), dpr: window.devicePixelRatio,
    buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], viewport: [window.innerWidth, window.innerHeight],
    quality: g.quality?.tier };
});
console.log(JSON.stringify(v));
await b.close();
