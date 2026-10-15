// 云是否随行星自转：把相机锁在**同一体固经纬度**，在不同时刻各拍一张。
//
// 云层的经纬度此前用世界坐标算，而云壳是球——绕球心旋转把球映到自身，
// 片元的 vPosW 分布不随自转改变，于是云挂在惯性系里不跟着地表转。
// 修复后云图应与地表贴图共用体固系：同一经纬度看过去，云相对大陆的位置不变。
//
// 注意照明会随时间变（太阳方向不同），所以不能逐像素比图；这里比的是
// **云相对陆地的位置关系**，靠肉眼判读两张并排图。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-rot/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 8000));

// 固定体固经纬度：南美上空
const aim = () => p.evaluate(() => {
  const g = window.__game;
  g.select('earth');
  g.orbitCam.init(g.orbitEnv, 'earth', 2.2);
  g.orbitCam.lat = -0.25;
  g.orbitCam.lon = -1.05;
  g.orbitCam.compute(g.orbitEnv);
});

const state = () => p.evaluate(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('earth');
  const m = e.cloudMat.userData.uniforms.uBodyInv.value.elements;
  const q = e.mesh.quaternion;
  return {
    t: g.simClock?.jdTT ?? null,
    // uBodyInv 应是 mesh.quaternion 的逆（转置）
    inv00: +m[0].toFixed(4), inv11: +m[4].toFixed(4),
    quat: [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)],
  };
});

await aim();
await new Promise((r) => setTimeout(r, 12000));
await p.screenshot({ path: `${OUT}00-t0.png` });
const s0 = await state();
console.log('t0 :', JSON.stringify(s0));

// 推进 3 小时：地球转 45°，若云是惯性固定的，云相对大陆会明显平移
await p.evaluate(() => {
  const g = window.__game;
  if (g.simClock) { g.simClock.warp = 1; g.simClock.advanceSeconds?.(3 * 3600); }
});
await new Promise((r) => setTimeout(r, 6000));
await aim();
await new Promise((r) => setTimeout(r, 12000));
await p.screenshot({ path: `${OUT}01-t3h.png` });
const s1 = await state();
console.log('t+3h:', JSON.stringify(s1));
console.log('uBodyInv 是否随时间改变（应改变，说明体固系在跟踪自转）:',
  s0.inv00 !== s1.inv00 || s0.inv11 !== s1.inv11);
console.log('错误:', errs.length);
await b.close();
console.log('截图:', OUT);
