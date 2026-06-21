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
page.on('pageerror', e => console.log('ERR:', e.message.slice(0,80)));

async function waitArrival(ms=40000){const t0=Date.now();while(Date.now()-t0<ms){try{if(!(await page.evaluate(()=>!!window.__game?.orbitCam?.flight)))return true;}catch{}await sleep(300);}}
async function waitMode(t,ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{if((await page.evaluate(()=>window.__game?.getMode?.()))===t)return true;}catch{}await sleep(250);}}

await page.goto('http://localhost:5174/?quality=high',{waitUntil:'networkidle2',timeout:90000});
await page.waitForSelector('#start-btn',{visible:true,timeout:60000});
await page.click('#start-btn');
await sleep(2500);

// === 太空视角 ===
await page.evaluate(()=>window.__game.flyTo('venus'));
await waitArrival(30000);
await sleep(1000);

await page.evaluate(()=>{ window.__game.orbitCam.distTarget = 6051.8 * 4; });
await sleep(3000);
await page.screenshot({ path: OUT+'venus-space-mid.png' });
console.log('✅ 太空中距离');

await page.evaluate(()=>{ window.__game.orbitCam.distTarget = 6051.8 * 1.5; });
await sleep(3000);
await page.screenshot({ path: OUT+'venus-space-close.png' });
console.log('✅ 太空近距离');

// === 降落地表 ===
await page.evaluate(()=>{ window.__game.orbitCam.distTarget = 1; });
await waitMode('walk', 25000);
await sleep(3000);
console.log('Mode:', await page.evaluate(()=>window.__game.getMode()));

// 地表仰望（关闭标签，纯净天空）
await page.evaluate(()=>{
  window.__game.input.justPressed.add('KeyL');
  window.__game.input.justPressed.add('KeyO');
  const w = window.__game.ship.walk;
  w.pitch = 0.9; w.smy = 0.9;
});
await sleep(3000);
await page.screenshot({ path: OUT+'venus-surface-sky.png' });
console.log('✅ 地表仰望天空');

// 水平看地平线
await page.evaluate(()=>{ const w=window.__game.ship.walk; w.pitch=0.03; w.smy=0.03; });
await sleep(2000);
await page.screenshot({ path: OUT+'venus-surface-horizon.png' });
console.log('✅ 地表地平线');

// 背对太阳（暗侧天空）
await page.evaluate(async ()=>{
  const game=window.__game, w=game.ship.walk;
  const me=game.builder.bodies.get('venus'), mp=me.posKm;
  const len=Math.sqrt(mp[0]**2+mp[1]**2+mp[2]**2);
  const sun3=[(-mp[0]/len), (-mp[2]/len)*(-1), (mp[1]/len)];
  // 指向太阳反方向
  const lp=w.localPos, ll=Math.sqrt(lp.x**2+lp.y**2+lp.z**2)||1;
  const upL={x:lp.x/ll,y:lp.y/ll,z:lp.z/ll};
  const q=me.mesh.quaternion,{x:qx,y:qy,z:qz,w:qw}=q;
  const vx=upL.x,vy=upL.y,vz=upL.z;
  const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx;
  const ccx=qy*cz-qz*cy,ccy=qz*cx-qx*cz,ccz=qx*cy-qy*cx;
  const ux=vx+2*(qw*cx+ccx),uy=vy+2*(qw*cy+ccy),uz=vz+2*(qw*cz+ccz);
  const dot=sun3[0]*ux+sun3[1]*uy+sun3[2]*uz;
  const hx=sun3[0]-dot*ux,hy=sun3[1]-dot*uy,hz=sun3[2]-dot*uz;
  const hl=Math.sqrt(hx*hx+hy*hy+hz*hz)||1;
  w.yaw=Math.atan2(hx/hl,hz/hl)+Math.PI; // 背对太阳
  w.pitch=0.4; w.smx=w.yaw; w.smy=w.pitch;
});
await sleep(2000);
await page.screenshot({ path: OUT+'venus-surface-away-sun.png' });
console.log('✅ 地表背太阳');

await browser.close();
