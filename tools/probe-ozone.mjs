import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 640, height: 400 });
await p.goto('http://127.0.0.1:4179/?clean=1', { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 9000));

// 把地球放到晨昏线附近看起来最有对比
const setup = async (ozone) => {
  await p.evaluate(async (oz) => {
    const g = window.__game;
    g.select('earth');
    g.orbitCam.init(g.orbitEnv, 'earth', 1.35);   // 贴近地平线，让大气占满下半屏
    g.builder.bodies.get('earth').atmoMesh.material.userData.uniforms.uOzone.value = oz;
    await new Promise((r) => setTimeout(r, 500));
  }, ozone);
  await new Promise((r) => setTimeout(r, 4500));
  const shot = await p.screenshot({ encoding: 'base64' });
  return shot;
};
const withOz = await setup(1.0);
const without = await setup(0.0);

const b2 = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p2 = await b2.newPage();
const stats = await p2.evaluate(async (a, bb) => {
  const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
  const mean = async (s) => {
    const im = await load(s);
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
    return [r / n, g / n, bl / n];
  };
  return { on: await mean(a), off: await mean(bb) };
}, withOz, without);
await b2.close(); await b.close();

const f = (v) => v.map((x) => x.toFixed(2)).join(' / ');
console.log('臭氧开 RGB:', f(stats.on));
console.log('臭氧关 RGB:', f(stats.off));
const dR = stats.on[0] - stats.off[0], dB = stats.on[2] - stats.off[2];
console.log('差值  R', dR.toFixed(2), ' B', dB.toFixed(2));
console.log(dR < 0 && dB > dR ? '✅ 臭氧使画面向蓝偏移（吸收黄红多于蓝），符合 Chappuis 带' : '❌ 未见预期的蓝移');
