// 闭合上一轮的未确认项：亮冰卫星的反照率改动到底有没有进入渲染。
// 直接读运行时材质：Hapke 的 w、贴图平均亮度、贴图来源。
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 600, height: 400 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 12000));
const st = await p.evaluate(() => {
  const g = window.__game;
  const out = {};
  for (const id of ['mimas','dione','tethys','europa','mercury']) {
    const e = g.builder.bodies.get(id) ?? [...g.registry.values()].find(t => t.id === id);
    const u = e?.mat?.userData?.uniforms;
    if (!u) { out[id] = 'no-mat'; continue; }
    const img = u.uMap?.value?.image;
    let lum = null;
    if (img && img.width) {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, img.width, img.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
      lum = +(s / (d.length/4)).toFixed(1);
    }
    out[id] = {
      w: u.uHapkeW?.value ?? null,
      hasHapke: !!u.uHapkeW,
      texLum: lum,
      texSize: img ? [img.width, img.height] : null,
    };
  }
  return out;
});
console.log(JSON.stringify(st, null, 1));
console.log('错误', errs.length);
await b.close();
