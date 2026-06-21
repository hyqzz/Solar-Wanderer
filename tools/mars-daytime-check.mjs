import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = 'docs/sdlc/screenshots/';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
         '--window-size=1920,1080','--hide-scrollbars','--disable-setuid-sandbox'],
  defaultViewport: { width: 1920, height: 1080 }
});
const page = await browser.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
page.on('pageerror', e => console.log('ERR:', e.message));

async function waitArrival(ms=30000) {
  const t0 = Date.now();
  while (Date.now()-t0<ms) {
    try { if (!(await page.evaluate(()=>!!window.__game?.orbitCam?.flight))) return true; } catch{}
    await sleep(300);
  }
}
async function waitMode(target, ms=15000) {
  const t0 = Date.now();
  while (Date.now()-t0<ms) {
    try { if ((await page.evaluate(()=>window.__game?.getMode?.()))===target) return true; } catch{}
    await sleep(250);
  }
}

await page.goto('http://localhost:5173/?quality=high', {waitUntil:'networkidle2',timeout:60000});
await page.waitForSelector('#start-btn', {visible:true,timeout:30000});
await page.click('#start-btn');
await sleep(2500);

await page.evaluate(()=>window.__game.flyTo('mars'));
await waitArrival(20000);
await sleep(800);
await page.evaluate(()=>{ window.__game.orbitCam.distTarget=1; });
await waitMode('walk',15000);
await sleep(2000);

// 推进时钟找白昼正午（太阳仰角 > 45°）
const noonInfo = await page.evaluate(async ()=>{
  const game = window.__game;
  const w = game.ship.walk;
  const clock = game.simClock;
  const STEP = 88642.663/86400 * 0.05; // 0.05 火星日

  function getSunElev() {
    const me = game.builder.bodies.get('mars');
    const mp = me.posKm;
    const len = Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
    const seEcl = [-mp[0]/len,-mp[1]/len,-mp[2]/len];
    const sun3 = [seEcl[0],seEcl[2],-seEcl[1]];
    const lp = w.localPos;
    const lpLen = Math.sqrt(lp.x**2+lp.y**2+lp.z**2)||1;
    const upL = {x:lp.x/lpLen,y:lp.y/lpLen,z:lp.z/lpLen};
    const q = me.mesh.quaternion;
    const {x:qx,y:qy,z:qz,w:qw}=q;
    const vx=upL.x,vy=upL.y,vz=upL.z;
    const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx;
    const ccx=qy*cz-qz*cy,ccy=qz*cx-qx*cz,ccz=qx*cy-qy*cx;
    const ux=vx+2*(qw*cx+ccx),uy=vy+2*(qw*cy+ccy),uz=vz+2*(qw*cz+ccz);
    const dot=sun3[0]*ux+sun3[1]*uy+sun3[2]*uz;
    return Math.asin(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
  }

  let best = null;
  for (let i=0; i<40; i++) {
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const e = getSunElev();
    if (e > 45) { best = { elev:e, step:i }; break; }
    if (e > (best?.elev ?? -90)) best = {elev:e, step:i};
    clock.jdTT += STEP;
    await new Promise(r=>requestAnimationFrame(r));
  }

  // 设置行走方向：朝太阳，45° 仰角望天
  const me = game.builder.bodies.get('mars');
  const mp = me.posKm;
  const len = Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
  const seEcl = [-mp[0]/len,-mp[1]/len,-mp[2]/len];
  const sun3 = [seEcl[0],seEcl[2],-seEcl[1]];
  const lp = w.localPos;
  const lpLen = Math.sqrt(lp.x**2+lp.y**2+lp.z**2)||1;
  const upL = {x:lp.x/lpLen,y:lp.y/lpLen,z:lp.z/lpLen};
  const q = me.mesh.quaternion;
  const {x:qx,y:qy,z:qz,w:qw}=q;
  const vx=upL.x,vy=upL.y,vz=upL.z;
  const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx;
  const ccx=qy*cz-qz*cy,ccy=qz*cx-qx*cz,ccz=qx*cy-qy*cx;
  const ux=vx+2*(qw*cx+ccx),uy=vy+2*(qw*cy+ccy),uz=vz+2*(qw*cz+ccz);
  const dot=sun3[0]*ux+sun3[1]*uy+sun3[2]*uz;
  const hx=sun3[0]-dot*ux,hy=sun3[1]-dot*uy,hz=sun3[2]-dot*uz;
  const hl=Math.sqrt(hx*hx+hy*hy+hz*hz)||1;
  w.yaw = Math.atan2(hx/hl, hz/hl);
  w.pitch = 0.7; // ~40° 仰角
  w.smx=w.yaw; w.smy=w.pitch;
  return { elev: getSunElev(), step: best?.step };
});

console.log('白昼：太阳仰角', noonInfo.elev?.toFixed(1), '°');
await sleep(3000);

// 截图1：朝太阳方向仰望（白昼天空）
await page.screenshot({ path: OUT + 'mars-day-towardsun.png' });
console.log('✅ 朝太阳截图');

// 截图2：背对太阳仰望（白昼背景天空）
await page.evaluate(()=>{ const w=window.__game.ship.walk; w.yaw+=Math.PI; w.smx=w.yaw; });
await sleep(1500);
await page.screenshot({ path: OUT + 'mars-day-awaysun.png' });
console.log('✅ 背太阳截图');

// 截图3：地平线（水平朝任意方向）
await page.evaluate(()=>{ const w=window.__game.ship.walk; w.pitch=0.02; w.smy=0.02; });
await sleep(1500);
await page.screenshot({ path: OUT + 'mars-day-horizon.png' });
console.log('✅ 水平截图');

await browser.close();
