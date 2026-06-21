// 验证火星蓝色日落：降落→推进仿真时钟找日落时刻→截图
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/sdlc/screenshots/';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1920,1080', '--hide-scrollbars', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1920, height: 1080 }
});

const page = await browser.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

async function waitArrival(ms=30000) {
  const t0 = Date.now();
  while (Date.now()-t0<ms) {
    try { if(!(await page.evaluate(()=>!!window.__game?.orbitCam?.flight))) return true; } catch{}
    await sleep(300);
  }
  return false;
}
async function waitMode(target, ms=20000) {
  const t0 = Date.now();
  while (Date.now()-t0<ms) {
    try { if((await page.evaluate(()=>window.__game?.getMode?.()))===target) return true; } catch{}
    await sleep(250);
  }
  return false;
}

await page.goto('http://localhost:5173/?quality=high', {waitUntil:'networkidle2',timeout:60000});
await page.waitForSelector('#start-btn', {visible:true,timeout:30000});
await page.click('#start-btn');
await sleep(2500);

// 飞到火星 → 降落
await page.evaluate(()=>window.__game.flyTo('mars'));
await waitArrival(20000);
await sleep(800);
await page.evaluate(()=>{ window.__game.orbitCam.distTarget=1; });
await waitMode('walk',15000);
await sleep(2000);
console.log('Mode:', await page.evaluate(()=>window.__game.getMode()));

// 通过推进仿真时钟（每步 0.1 火星恒星日）找日落（太阳仰角 2°~15°）
const result = await page.evaluate(async ()=>{
  const game = window.__game;
  const ship = game.ship;
  const w = ship.walk;
  const clock = game.simClock;

  // 火星恒星日 ≈ 88642.663 s = 88642.663/86400 天
  const MARS_SIDEREAL_DAY_JD = 88642.663 / 86400;

  function getSunElevDeg() {
    const marsEntry = game.builder.bodies.get('mars');
    const mp = marsEntry.posKm; // 黄道系
    const len = Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
    // 太阳方向（黄道 → Three.js 世界）
    const sx = -mp[0]/len, sye = -mp[1]/len, sz2 = -mp[2]/len;
    const sun3 = [sx, sz2, -sye]; // (x,y,z)_ecl → (x,z,-y)_world

    // 当前站立点法线（体固系 → 世界坐标）
    const lp = w.localPos;
    const lpLen = Math.sqrt(lp.x**2+lp.y**2+lp.z**2)||1;
    const upL = {x:lp.x/lpLen,y:lp.y/lpLen,z:lp.z/lpLen};
    const q = marsEntry.mesh.quaternion;
    // 体固 → 世界 (apply quaternion)
    const {x:qx,y:qy,z:qz,w:qw} = q;
    const vx=upL.x,vy=upL.y,vz=upL.z;
    const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx;
    const ccx=qy*cz-qz*cy,ccy=qz*cx-qx*cz,ccz=qx*cy-qy*cx;
    const ux=vx+2*(qw*cx+ccx),uy=vy+2*(qw*cy+ccy),uz=vz+2*(qw*cz+ccz);
    
    const dot = sun3[0]*ux+sun3[1]*uy+sun3[2]*uz;
    return Math.asin(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
  }

  // 搜索步骤：最多推进 2 个火星日，每 0.05 日一步
  const stepJD = MARS_SIDEREAL_DAY_JD * 0.05;
  let found = null;
  for (let i=0; i<40; i++) {
    // 等待渲染循环更新星历（requestAnimationFrame）
    await new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const elev = getSunElevDeg();
    if (elev >= 3 && elev <= 15) {
      found = { elev, jd: clock.jdTT, step: i };
      break;
    }
    clock.jdTT += stepJD; // 推进时钟
    // 等待下一帧让星历刷新
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  
  if (!found) return { found: false, lastElev: getSunElevDeg() };

  // 设置朝向
  const marsEntry = game.builder.bodies.get('mars');
  const mp = marsEntry.posKm;
  const len = Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
  const sun3 = [-mp[0]/len, -mp[2]/len /* z→-y */, mp[1]/len /* y→z */];
  // 修正：黄道→world: x→x, y→z, z→-y
  const sunW = [-mp[0]/len, -mp[2]/len, mp[1]/len];
  
  const lp = w.localPos;
  const lpLen = Math.sqrt(lp.x**2+lp.y**2+lp.z**2)||1;
  const upL = {x:lp.x/lpLen,y:lp.y/lpLen,z:lp.z/lpLen};
  const q = marsEntry.mesh.quaternion;
  const {x:qx,y:qy,z:qz,w:qw}=q;
  const vx=upL.x,vy=upL.y,vz=upL.z;
  const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx;
  const ccx=qy*cz-qz*cy,ccy=qz*cx-qx*cz,ccz=qx*cy-qy*cx;
  const ux=vx+2*(qw*cx+ccx),uy=vy+2*(qw*cy+ccy),uz=vz+2*(qw*cz+ccz);

  const seEcl = [-mp[0]/len,-mp[1]/len,-mp[2]/len];
  const sunW2 = [seEcl[0], seEcl[2], -seEcl[1]];
  
  const dotS = sunW2[0]*ux+sunW2[1]*uy+sunW2[2]*uz;
  const hx=sunW2[0]-dotS*ux,hy=sunW2[1]-dotS*uy,hz=sunW2[2]-dotS*uz;
  const hl=Math.sqrt(hx*hx+hy*hy+hz*hz)||1;
  
  w.yaw = Math.atan2(hx/hl, hz/hl);
  w.pitch = 0.04; // 仰角约 2°
  w.smx=w.yaw; w.smy=w.pitch;
  
  return { found: true, elev: found.elev, step: found.step, yaw: w.yaw*180/Math.PI };
});

console.log('搜索结果:', JSON.stringify(result));
await sleep(3500);

// === 截图1：日落地平线（应看到蓝色光晕）===
await page.screenshot({ path: OUT + 'mars-sunset-surface.png' });
console.log('✅ 日落地平线截图');

// === 截图2：仰天 30° ===
await page.evaluate(()=>{
  const w = window.__game.ship.walk;
  w.pitch=0.5; w.smy=0.5;
});
await sleep(2000);
await page.screenshot({ path: OUT + 'mars-sunset-sky.png' });
console.log('✅ 日落天空截图');

// === 截图3：白昼（从太空看弧光）===
await page.evaluate(()=>window.__game.flyTo('mars'));
await waitArrival(10000);
await sleep(500);
await page.evaluate(()=>{
  const c = window.__game.orbitCam;
  const marsEntry = window.__game.builder.bodies.get('mars');
  const mp = marsEntry.posKm;
  const len = Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
  const seEcl = [-mp[0]/len,-mp[1]/len,-mp[2]/len];
  const sun3 = [seEcl[0],seEcl[2],-seEcl[1]];
  let rx=-sun3[2],rz=sun3[0];
  const rl=Math.sqrt(rx*rx+rz*rz)||1; rx/=rl; rz/=rl;
  const a=88*Math.PI/180;
  const tx=sun3[0]*Math.cos(a)+rx*Math.sin(a);
  const ty=sun3[1]*Math.cos(a);
  const tz=sun3[2]*Math.cos(a)+rz*Math.sin(a);
  function qI(vx,vy,vz,qx,qy,qz,qw){
    const ix=-qx,iy=-qy,iz=-qz,iw=qw;
    const cx=iy*vz-iz*vy,cy=iz*vx-ix*vz,cz=ix*vy-iy*vx;
    const ccx=iy*cz-iz*cy,ccy=iz*cx-ix*cz,ccz=ix*cy-iy*cx;
    return[vx+2*(iw*cx+ccx),vy+2*(iw*cy+ccy),vz+2*(iw*cz+ccz)];
  }
  const q=marsEntry.mesh.quaternion;
  const [lx,ly,lz]=qI(tx,ty,tz,q.x,q.y,q.z,q.w);
  c.lat=Math.asin(Math.max(-1,Math.min(1,ly)));
  c.heading=Math.atan2(lx,lz);
  c.distTarget=3389.5*5; c.tilt=0;
});
await sleep(3000);
await page.screenshot({ path: OUT + 'mars-sunset-space.png' });
console.log('✅ 太空截图');

if (errors.length) console.log('错误:', errors.slice(0,3));
await browser.close();
