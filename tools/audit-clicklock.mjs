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
// 直接点画面中心不行——那里是当前焦点天体本身，会被 hit.id !== focusId 挡掉。
let clicked = null;
const labels = await p.$$('#labels .body-label');
for (const l of labels) {
  const txt = (await l.evaluate((n) => n.textContent)).trim();
  const box = await l.boundingBox();
  if (box && box.x > 40 && box.x < 920 && box.y > 40 && box.y < 560 && !/地球|Earth/.test(txt)) {
    await l.click(); clicked = `label:${txt}`; break;
  }
}
if (!clicked) {
  await p.evaluate(() => window.__game.orbitCam.setPendingFocus('mars'));
  clicked = 'setPendingFocus(mars)';
}
await new Promise((r) => setTimeout(r, 2500));
const afterClick = await st();
console.log(`点击(${clicked})后`, JSON.stringify(afterClick));

await drag(180);
const afterDrag2 = await st();
console.log('再拖拽后  ', JSON.stringify(afterDrag2));

// 向外滚（应能取消过渡）
await p.mouse.move(480, 300);
for (let i = 0; i < 12; i++) { await p.mouse.wheel({ deltaY: 120 }); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 1500));
const afterWheelOut = await st();
console.log('向外滚后  ', JSON.stringify(afterWheelOut));

await drag(180);
const afterDrag3 = await st();
console.log('再拖拽后  ', JSON.stringify(afterDrag3));

const d1 = Math.abs(afterDrag1.lon - (-5.51));
console.log(`\n结论：点击前拖拽经度变化 ${Math.abs(afterDrag1.lon - afterDrag2.lon).toFixed(3)}°(参考)  ` +
  `点击后拖拽经度变化 ${Math.abs(afterDrag3.lon - afterWheelOut.lon).toFixed(3)}°  ` +
  `heading 变化 ${Math.abs(afterDrag3.heading - afterWheelOut.heading).toFixed(3)}°`);
console.log('过渡态残留:', JSON.stringify((await st()).transition));
console.log('页面错误', errs.length, errs.slice(0, 3));
await b.close();
