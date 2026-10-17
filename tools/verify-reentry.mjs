// 再入验证：把飞船放到 120km 高度、7.8km/s 朝下，跑几秒，看动压/加热/
// 速度是否真的发生变化。判据：峰值加热落在 30–60km，速度显著下降。
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 600, height: 400 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=low', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
const res = await p.evaluate(async () => {
  const g = window.__game, s = g.ship;
  // 进入飞行模式
  g.setMode?.('fly');
  if (g.getMode() !== 'fly') { document.dispatchEvent(new KeyboardEvent('keydown', { code:'KeyF' })); window.dispatchEvent(new KeyboardEvent('keydown', { code:'KeyF' })); }
  await new Promise(r=>setTimeout(r,1500));
  // 定位到地球上方 120km（地球在 registry 里是日心坐标）
  const e = g.registry.get('earth');
  const R = e.phys.radiusKm;
  const dir = [0.3, 0.8, 0.5]; const L = Math.hypot(...dir);
  const u = dir.map(v=>v/L);
  // 先量地球的公转速度（日心系）——飞船速度是日心系量，不减掉它会"被地球甩下"
  const p0 = Float64Array.from(e.posKm);
  const t0 = performance.now();
  await new Promise(r=>setTimeout(r,120));
  const p1 = Float64Array.from(e.posKm);
  const dts = (performance.now() - t0) / 1000;
  const vE = [(p1[0]-p0[0])/dts, (p1[1]-p0[1])/dts, (p1[2]-p0[2])/dts];
  for (let i=0;i<3;i++) s.posKm[i] = e.posKm[i] + u[i]*(R+120);
  s.vel.set(vE[0]-u[0]*7.8, vE[1]-u[1]*7.8, vE[2]-u[2]*7.8);
  s.mode = 'fly';
  s.gravityMode = true;   // 真实引力模式：关掉街机阻尼，否则速度会被 lerp 吃掉，与阻力混淆
  const out = [];
  for (let i=0;i<300;i++) {
    await new Promise(r=>requestAnimationFrame(r));
    if (i % 30 === 0) out.push({ alt:+(s.aero?.alt??0).toFixed(1), q:Math.round(s.aero?.q??0), heat:Math.round((s.aero?.heat??0)/1e9), v:+s.vel.length().toFixed(2) });
  }
  return out;
});
console.log('高度km  动压Pa  加热(×1e9)  速度km/s');
for (const r of res) console.log(String(r.alt).padStart(6), String(r.q).padStart(7), String(r.heat).padStart(10), String(r.v).padStart(8));
const peak = res.reduce((a,b)=>b.heat>a.heat?b:a, res[0]);
console.log(`\n峰值加热在 ${peak.alt} km，最终速度 ${res[res.length-1].v} km/s（初始 7.8）`);
await b.close();
