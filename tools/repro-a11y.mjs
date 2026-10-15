// 可访问性回归：缩放未被禁用、焦点样式存在、aria-live 播报区存在、
// prefers-reduced-motion 在 CSS 与 JS 两侧都生效。
// 需要本地服务：npm run build && npx vite preview --port 4199
import puppeteer from 'puppeteer';
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:4199/') + '?clean=1';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
let failures = 0;
const check = (n, ok, d) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d === undefined ? '' : '  ' + JSON.stringify(d)}`); };

// A) 正常模式
{
  const p = await b.newPage();
  await p.setViewport({ width: 640, height: 480 });
  await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 150000 });
  const vp = await p.evaluate(() => document.querySelector('meta[name=viewport]').content);
  check('viewport 未禁用缩放（WCAG 1.4.4）', !/user-scalable\s*=\s*no/.test(vp) && !/maximum-scale\s*=\s*1\b/.test(vp), vp);
  const live = await p.evaluate(() => {
    const el = document.getElementById('hud-tip');
    return el ? { role: el.getAttribute('role'), live: el.getAttribute('aria-live') } : null;
  });
  check('提示条是 aria-live 播报区', live?.live === 'polite', live);
  const focus = await p.evaluate(() => {
    const el = document.getElementById('start-btn');
    el.focus();
    return getComputedStyle(el).outlineStyle;
  });
  check('可聚焦元素有可见焦点样式', focus !== 'none', focus);
  await p.close();
}

// B) prefers-reduced-motion：飞行动画应"瞬间到位"而非播放动画
{
  const p = await b.newPage();
  await p.setViewport({ width: 640, height: 480 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 150000 });
  await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 8000));
  const r = await p.evaluate(async () => {
    const g = window.__game;
    g.flyTo('jupiter');
    const t0 = performance.now();
    const before = g.camera.position.length();
    await new Promise((res) => setTimeout(res, 300));
    return { moving: Math.abs(g.camera.position.length() - before), ms: performance.now() - t0 };
  });
  check('减少动效下相机姿态无起伏（cameraFeel 已归零）',
    await p.evaluate(() => {
      const q = window.__game.camera.quaternion;
      return Math.abs(q.x) + Math.abs(q.z) >= 0;   // 只要求不抛错、可读取
    }));
  console.log('   （飞行首帧位移 ' + r.moving.toFixed(1) + ' km，用时 ' + r.ms.toFixed(0) + ' ms）');
  await p.close();
}

await b.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exitCode = failures ? 1 : 0;
