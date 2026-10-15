import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 700 });
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4199/') + '?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 10000));
await p.evaluate(() => { const g = window.__game; g.select('earth'); g.orbitCam.init(g.orbitEnv, 'earth', 2.2); });
await new Promise(r => setTimeout(r, 9000));

const measure = async (visible, volumetric) => {
  await p.evaluate(({ v, vol }) => {
    const e = window.__game.builder.bodies.get('earth');
    e.cloudMesh.visible = v;
    if (vol !== null) e.cloudMat.userData.uniforms.uVolumetric.value = vol;
  }, { v: visible, vol: volumetric });
  await new Promise(r => setTimeout(r, 1500));
  return p.evaluate(() => new Promise((res) => {
    const t = []; let last = performance.now(); let n = 0;
    const tick = () => { const now = performance.now(); t.push(now - last); last = now;
      if (++n < 90) requestAnimationFrame(tick);
      else { const s = t.slice(10).sort((a, b2) => a - b2); res(s[Math.floor(s.length * 0.5)]); } };
    requestAnimationFrame(tick);
  }));
};
const off = await measure(false, 0);
const light = await measure(true, 0);
const vol = await measure(true, 1);
console.log('地球充满画面（SwiftShader 软件渲染，只作相对比较；本机 tier =', await p.evaluate(() => window.__game.quality.tier), '）');
console.log('  云层关闭          p50 =', off.toFixed(1), 'ms');
console.log('  轻量路径（单次采样）p50 =', light.toFixed(1), 'ms   净代价', (light - off).toFixed(1), 'ms');
console.log('  体积路径（步进）   p50 =', vol.toFixed(1), 'ms   净代价', (vol - off).toFixed(1), 'ms');
console.log('  体积 vs 轻量       = ' + ((vol / light - 1) * 100).toFixed(0) + '% 增加');
await b.close();
