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

async function waitArrival(ms=30000){const t0=Date.now();while(Date.now()-t0<ms){try{if(!(await page.evaluate(()=>!!window.__game?.orbitCam?.flight)))return true;}catch{}await sleep(300);}}
async function waitMode(t,ms=15000){const t0=Date.now();while(Date.now()-t0<ms){try{if((await page.evaluate(()=>window.__game?.getMode?.()))===t)return true;}catch{}await sleep(250);}}

await page.goto('http://localhost:5173/?quality=high',{waitUntil:'networkidle2',timeout:60000});
await page.waitForSelector('#start-btn',{visible:true,timeout:30000});
await page.click('#start-btn');
await sleep(2500);

await page.evaluate(()=>window.__game.flyTo('mars'));
await waitArrival(20000);
await sleep(800);
await page.evaluate(()=>{ window.__game.orbitCam.distTarget=1; });
await waitMode('walk',15000);
await sleep(2000);

// 找正午，精确朝太阳
const info = await page.evaluate(async ()=>{
  const game=window.__game, w=game.ship.walk, clock=game.simClock;
  const STEP=88642.663/86400*0.05;
  function state(){
    const me=game.builder.bodies.get('mars'),mp=me.posKm;
    const len=Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
    const seEcl=[-mp[0]/len,-mp[1]/len,-mp[2]/len];
    const sun3=[seEcl[0],seEcl[2],-seEcl[1]];
    const lp=w.localPos,ll=Math.sqrt(lp.x**2+lp.y**2+lp.z**2)||1;
    const upL={x:lp.x/ll,y:lp.y/ll,z:lp.z/ll};
    const q=me.mesh.quaternion,{x:qx,y:qy,z:qz,w:qw}=q;
    const vx=upL.x,vy=upL.y,vz=upL.z;
    const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx;
    const ccx=qy*cz-qz*cy,ccy=qz*cx-qx*cz,ccz=qx*cy-qy*cx;
    const ux=vx+2*(qw*cx+ccx),uy=vy+2*(qw*cy+ccy),uz=vz+2*(qw*cz+ccz);
    const dot=sun3[0]*ux+sun3[1]*uy+sun3[2]*uz;
    const hx=sun3[0]-dot*ux,hy=sun3[1]-dot*uy,hz=sun3[2]-dot*uz;
    const hl=Math.sqrt(hx*hx+hy*hy+hz*hz)||1;
    return {elev:Math.asin(Math.max(-1,Math.min(1,dot)))*180/Math.PI,hx:hx/hl,hz:hz/hl,elevRad:Math.asin(Math.max(-1,Math.min(1,dot)))};
  }
  for(let i=0;i<40;i++){
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    if(state().elev>55) break;
    clock.jdTT+=STEP;
    await new Promise(r=>requestAnimationFrame(r));
  }
  const s=state();
  // 精确朝太阳：yaw=水平太阳方向，pitch=太阳仰角
  w.yaw=Math.atan2(s.hx,s.hz);
  w.pitch=s.elevRad;  // 正对太阳
  w.smx=w.yaw; w.smy=w.pitch;
  return {elev:s.elev};
});
console.log('太阳仰角:', info.elev?.toFixed(1), '°');
await sleep(5000);

// 截图1：直视太阳
await page.screenshot({ path: OUT+'mars-sun-direct.png' });
console.log('✅ 直视太阳');

// 截图2：略偏太阳（旁边天空）
await page.evaluate(()=>{
  const w=window.__game.ship.walk;
  w.yaw+=0.15; w.smx=w.yaw; // 偏15°
});
await sleep(2000);
await page.screenshot({ path: OUT+'mars-sky-beside-sun.png' });
console.log('✅ 太阳旁侧天空');

// 截图3：太空中距离
await page.evaluate(()=>window.__game.flyTo('mars'));
await waitArrival(10000);
await sleep(500);
await page.evaluate(()=>{ window.__game.orbitCam.distTarget=3389.5*2.5; });
await sleep(3000);
await page.screenshot({ path: OUT+'mars-space-final.png' });
console.log('✅ 太空');

await browser.close();
