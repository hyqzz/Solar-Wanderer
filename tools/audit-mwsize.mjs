import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium&pr=1', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
const v = await p.evaluate(() => {
  const mesh = window.__game.sky.group.children[0];
  const t = mesh.material.map;
  return { imgW: t.image.width, imgH: t.image.height, mag: t.magFilter, min: t.minFilter,
    gen: t.generateMipmaps, aniso: t.anisotropy, needsUpdate: t.needsUpdate, colorSpace: t.colorSpace };
});
console.log(JSON.stringify(v));
await b.close();
