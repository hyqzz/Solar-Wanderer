import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 10000));
// 放到地球晨昏线附近、贴近地平线：体积云厚度最看得出来
await p.evaluate(() => {
  const g = window.__game;
  g.select('earth');
  g.orbitCam.init(g.orbitEnv, 'earth', 1.22);
  g.orbitCam.lat = 0.05;
  g.orbitCam.compute(g.orbitEnv);
});
await new Promise(r => setTimeout(r, 12000));
await p.screenshot({ path: 'tools/.cloud-limb.png' });

// 帧率：两种档位都量一遍（本机是软件渲染 swiftshader，只作相对参考）
const fps = await p.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now();
  let n = 0;
  const tick = () => {
    const now = performance.now(); t.push(now - last); last = now;
    if (++n < 120) requestAnimationFrame(tick);
    else { const s = t.slice(10).sort((a, b) => a - b); res({ p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)] }); }
  };
  requestAnimationFrame(tick);
}));
console.log('地球近地视角 帧间隔 p50/p95 =', fps.p50.toFixed(1), '/', fps.p95.toFixed(1), 'ms');
console.log('错误:', errs.length);
await b.close();
