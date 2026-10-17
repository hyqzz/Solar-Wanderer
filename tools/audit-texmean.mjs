import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
const files = ['enceladus.jpg','mimas.jpg','tethys.jpg','dione.jpg','rhea.jpg','europa.png','io.jpg','callisto.jpg','earth_day.jpg','mars.jpg','moon.jpg','mercury.jpg','pluto.jpg','jupiter.jpg','saturn.jpg','uranus.jpg','neptune.jpg','venus_atmosphere.jpg','titan.jpg','ganymede.jpg','iapetus.jpg','triton.jpg','charon.jpg','earth_clouds.jpg','clouds_real.png','earth_night.jpg','sun.jpg','milkyway.jpg'];
const out = await p.evaluate(async (files) => {
  const res = [];
  for (const f of files) {
    try {
      const img = new Image();
      img.src = '/textures/' + f;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 256, 128);
      const d = g.getImageData(0, 0, 256, 128).data;
      // sRGB → 线性（着色器里 texture2D 拿到的是线性值，标定必须在线性域做）
      const s2l = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      let r = 0, gg = 0, bb = 0, n = 0, mx = 0, lr = 0, lg = 0, lb = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; gg += d[i+1]; bb += d[i+2]; n++; mx = Math.max(mx, d[i]);
        lr += s2l(d[i]); lg += s2l(d[i+1]); lb += s2l(d[i+2]);
      }
      res.push({ f, w: img.naturalWidth, h: img.naturalHeight,
        mean: [Math.round(r/n), Math.round(gg/n), Math.round(bb/n)], max: mx,
        lin: [lr/n, lg/n, lb/n] });
    } catch (e) { res.push({ f, err: String(e).slice(0, 40) }); }
  }
  return res;
}, files);
for (const r of out) console.log(r.err ? `${r.f.padEnd(24)} 失败 ${r.err}`
  : `${r.f.padEnd(24)} ${String(r.w)+'x'+r.h} 均值 ${r.mean.join(',')} 峰值 ${r.max} 线性均值 ${r.lin.map(v=>v.toFixed(4)).join(',')}`);
await b.close();
