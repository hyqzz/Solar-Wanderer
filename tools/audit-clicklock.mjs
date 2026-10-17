// 验证"点击天体后拖拽失效"（audit-engine 的 H1，静态阅读结论）。
// 判据：拖拽前后相机方位角变化量。点击前应有明显变化，点击后应 ≈0。
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 960, height: 600 });
await p.goto('http://127.0.0.1:4199/?quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 10000));

const st = () => p.evaluate(() => {
  const oc = window.__game.orbitCam;
  return {
    focus: oc.focusId, pending: oc.pendingFocusId ?? null,
    transition: oc.transition ? { toId: oc.transition.toId, t: +oc.transition.t.toFixed(3), faceT: +oc.transition.faceT.toFixed(3) } : null,
    lat: +(oc.lat * 180 / Math.PI).toFixed(3), lon: +(oc.lon * 180 / Math.PI).toFixed(3),
    heading: +(oc.heading * 180 / Math.PI).toFixed(3),
  };
});

async function drag(dx) {
  await p.mouse.move(480, 300);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(480 + dx * i / 8, 300); await new Promise((r) => setTimeout(r, 30)); }
  await p.mouse.up();
  await new Promise((r) => setTimeout(r, 1500));
}

console.log('起始      ', JSON.stringify(await st()));
await drag(180);
const afterDrag1 = await st();
console.log('拖拽后    ', JSON.stringify(afterDrag1));

// 走"点击天体"的同一条代码路径：main.js:311 的点击处理器就是调 setPendingFocus。
// 不真去点 DOM 标签——鼠标抬起若恰好落在某个标签上会触发标签点击，把焦点也改掉，
// 干扰这个探针要测的东西（相机行为）。
await p.evaluate(() => window.__game.orbitCam.setPendingFocus('mars'));
await new Promise((r) => setTimeout(r, 2500));
const afterClick = await st();
console.log('点击天体后', JSON.stringify(afterClick));

const lonAfterClick = afterClick.lon;
await drag(180);
const afterDrag2 = await st();
console.log('再拖拽后  ', JSON.stringify(afterDrag2));

const dragDeltaAfterClick = Math.abs(afterDrag2.lon - lonAfterClick);
const ok = dragDeltaAfterClick > 5 && !afterDrag2.transition;
console.log(`\n点击后拖拽经度变化 ${dragDeltaAfterClick.toFixed(3)}°  （修复前实测为 0.000°）`);
console.log(`过渡态残留: ${JSON.stringify(afterDrag2.transition)}  （修复前为 {toId,t:0,faceT:1} 卡死）`);
console.log(ok ? '✅ 通过：点击天体后拖拽仍然有效' : '❌ 失败：点击后拖拽仍被吃掉');
console.log('页面错误', errs.length, errs.slice(0, 3));
await b.close();
process.exit(ok ? 0 : 1);
