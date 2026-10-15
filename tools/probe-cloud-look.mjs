import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 820, height: 620 });
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4199/') + '?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 10000));
// 用应用自己的前往流程（相机状态机由它维护），等待飞行结束
await p.evaluate(() => window.__game.flyTo('earth'));
await new Promise(r => setTimeout(r, 16000));
const shoot = async (vol, name) => {
  await p.evaluate((v) => {
    const e = window.__game.builder.bodies.get('earth');
    e.cloudMat.userData.uniforms.uVolumetric.value = v;
    e.cloudMat.needsUpdate = false;
  }, vol);
  await new Promise(r => setTimeout(r, 4000));
  await p.screenshot({ path: `tools/.shotc/${name}.png` });
  console.log(name, '已拍');
};
await shoot(0, 'light');
await shoot(1, 'volumetric');
await b.close();
