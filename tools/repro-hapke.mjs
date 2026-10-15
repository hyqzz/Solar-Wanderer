// Hapke BRDF 端到端验证：扫过整个相位角范围，检查月面是否出现"冲日增亮"。
//
// Lambert 球面的盘面积分亮度随相位角平滑变化；真实月面在 α→0 时有一个陡峭的额外
// 峰值（相干后向散射 + 阴影隐藏）。这里直接量渲染结果：
//   1) 固定时刻，让相机在月球体固系内绕一圈，从而扫过整个相位角范围
//   2) 由应用自身的几何算出每个视角的相位角
//   3) 用肩部（30–90°）拟合 Lambert 相位函数，再外推到 α=0 作对照
//
// 需要本地服务：npm run build && npx vite preview --port 4179
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4179/';
const STEPS = 36;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 420 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '?clean=1', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => {
  const b = document.getElementById('start-btn');
  return b && !b.disabled;
}, { timeout: 90000 });
await page.click('#start-btn');
await new Promise((r) => setTimeout(r, 8000));

const samples = [];
for (let i = 0; i < STEPS; i++) {
  const phaseDeg = await page.evaluate(async (sweep) => {
    const g = window.__game;
    g.simClock.set(2461360.5);                 // 固定时刻
    g.orbitCam.init(g.orbitEnv, 'moon', 2.6);
    // alignSunward() 内部把纬度乘了 0.6（避免正对日下点的呆板构图）；
    // 除以它即回到严格日照面，相位角才能扫到 0 附近。
    g.orbitCam.lat = g.orbitCam.lat / 0.6;
    g.orbitCam.lon = g.orbitCam.lon + sweep;   // 弧度：相机在体固系里绕月球转
    g.orbitCam.compute(g.orbitEnv);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 340));
    const e = g.builder.bodies.get('moon');
    const sun = e.mat.userData.uniforms.uSunDir.value;
    // 相位角 = 太阳方向 与 相机方向（月球→相机）的夹角。
    // 不能用 mesh.position：卫星 mesh 挂在母星组下，那是组内坐标；
    // 应用又用浮动原点（相机恒在原点），所以取绝对位置 ship.posKm 与 e.posKm。
    const cx = g.ship.posKm[0] - e.posKm[0];
    const cy = g.ship.posKm[1] - e.posKm[1];
    const cz = g.ship.posKm[2] - e.posKm[2];
    const cl = Math.hypot(cx, cy, cz) || 1;
    const cosA = (sun.x * cx + sun.y * cy + sun.z * cz) / cl;
    return Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI;
  }, (i / STEPS) * Math.PI * 2);

  const shot = await page.screenshot({ encoding: 'base64' });
  samples.push({ phaseDeg, shot });
}
await browser.close();

// 用离屏 canvas 算每张截图中心区域的加权亮度
const browser2 = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p2 = await browser2.newPage();
const rows = [];
for (const s of samples) {
  const mean = await p2.evaluate(async (b64) => {
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = 'data:image/png;base64,' + b64;
    });
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    const w = Math.floor(c.width / 3), h = Math.floor(c.height / 3);
    const d = x.getImageData(w, h, w, h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, s.shot);
  rows.push({ phase: s.phaseDeg, mean });
}
await browser2.close();

// 按 10° 分箱取均值：同一相位角上不同视角看到的地形不同，单点抖动大
const bins = new Map();
for (const r of rows) {
  const k = Math.round(r.phase / 10) * 10;
  if (!bins.has(k)) bins.set(k, []);
  bins.get(k).push(r.mean);
}
const curve = [...bins.entries()]
  .map(([deg, v]) => ({ deg, mean: v.reduce((a, b) => a + b, 0) / v.length }))
  .sort((a, b) => a.deg - b.deg);

console.log('相位角(°)  盘面平均亮度（10° 分箱）');
for (const c of curve) console.log(String(c.deg).padStart(8) + c.mean.toFixed(2).padStart(13));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  const tail = detail === undefined ? '' : '  ' + JSON.stringify(detail);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + tail);
};

// Lambert 球盘面积分相位函数；用肩部 30–90° 单参数拟合，再外推到 α=0
const lambert = (a) => {
  const r = (a * Math.PI) / 180;
  return (Math.sin(r) + (Math.PI - r) * Math.cos(r)) / Math.PI;
};
const shoulder = curve.filter((c) => c.deg >= 30 && c.deg <= 90);
const k = shoulder.reduce((s, c) => s + c.mean / lambert(c.deg), 0) / Math.max(shoulder.length, 1);
const expect0 = k * lambert(0);
const head = curve.filter((c) => c.deg <= 10);
const headMean = head.length ? head.reduce((s, c) => s + c.mean, 0) / head.length : 0;

check('α≤10° 的盘面亮度高于同几何下的 Lambert 外推（存在冲日增亮）',
  headMean > expect0 * 1.05, { 实测: +headMean.toFixed(2), Lambert外推: +expect0.toFixed(2) });
check('相位曲线整体单调下降',
  curve.every((c, i) => i === 0 || c.mean <= curve[i - 1].mean * 1.12),
  curve.map((c) => +c.mean.toFixed(1)));
check('无页面错误', errors.length === 0, errors.slice(0, 2));

console.log(failures ? '\n' + failures + ' 项失败' : '\n全部通过');
process.exitCode = failures ? 1 : 0;
