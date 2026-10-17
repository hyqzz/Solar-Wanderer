// 验证环境贴图对金属材质的作用：把相机放到阿波罗 11 着陆点旁，看登月舱/月球车
// 是否还是暗剪影。判据是画面里金属几何的平均亮度。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 560 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
const info = await p.evaluate(() => {
  const g = window.__game;
  const L = g.apolloLandmarks;
  if (!L) return { err: 'no landmarks' };
  const e = L.entries?.[0];
  if (!e) return { err: 'no entries', n: L.entries?.length };
  const mesh = e.model ?? e.group;
  // 把相机放在地标上方 60m
  const dir = e.dir;
  const R = 1737.4;
  const oc = g.orbitCam;
  g.select('moon'); oc.focusId='moon'; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.lat = Math.asin(Math.max(-1,Math.min(1,dir.y)));
  oc.lon = Math.atan2(-dir.z, dir.x);
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = R + 0.06;
  return { ok: true, id: e.site?.id ?? e.id, env: !!g.renderer && !!g.camera.parent?.environment };
});
console.log('landmark:', JSON.stringify(info));
await new Promise(r=>setTimeout(r,9000));
const m = await p.evaluate(() => new Promise((res) => {
  const g = window.__game, gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => { orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    let n=0,sum=0; for (let i=0;i<buf.length;i+=4){ const L=buf[i]*0.299+buf[i+1]*0.587+buf[i+2]*0.114; if(L>10){n++;sum+=L;} }
    res({ n, mean: n? +(sum/n).toFixed(1):0 }); };
}));
console.log('画面:', JSON.stringify(m));
await p.screenshot({ path: `${OUT}landmark-apollo.png` });
await b.close();
