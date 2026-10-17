import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 440 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
const ss = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('earth');
  const q=e.mesh.quaternion,pos=e.posKm; const L=Math.hypot(...pos)||1;
  const v={x:-pos[0]/L,y:-pos[1]/L,z:-pos[2]/L};
  const [qx,qy,qz,qw]=[-q.x,-q.y,-q.z,q.w];
  const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
  const iw=-qx*v.x-qy*v.y-qz*v.z;
  const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return {lat:Math.asin(Math.max(-1,Math.min(1,ly))),lon:Math.atan2(-lz,lx),R:e.phys.radiusKm};
});
for (const [name, latDeg] of [['land',10],['ocean',30]]) {
  await p.evaluate((m, la) => {
    const g=window.__game,oc=g.orbitCam;
    g.select('earth'); oc.focusId='earth'; oc.flight=null; oc.panOffset.set(0,0,0);
    oc.lat=la*Math.PI/180; oc.lon=m.lon; oc.tilt=0; oc.heading=0; oc.dist=oc.distTarget=m.R+0.002;
  }, ss, latDeg);
  for(let i=0;i<70;i++){ if(await p.evaluate(()=>window.__game.terrainMgr.baseReady('earth'))) break; await new Promise(r=>setTimeout(r,500)); }
  await p.evaluate((m, la)=>{ const g=window.__game,oc=g.orbitCam;
    const V=Object.getPrototypeOf(g.camera.position).constructor; const L=la*Math.PI/180;
    const dir=new V(Math.cos(L)*Math.cos(-m.lon),Math.sin(L),Math.cos(L)*Math.sin(-m.lon));
    oc.dist=oc.distTarget=g.terrainMgr.heightAt('earth',dir)+0.002; }, ss, latDeg);
  for(let i=0;i<70;i++){ if((await p.evaluate(()=>window.__game.getMode()))==='walk') break; await new Promise(r=>setTimeout(r,500)); }
  await new Promise(r=>setTimeout(r,9000));
  await p.evaluate(() => { const w=window.__game.ship.walk; if(w){ w.pitch=0.05; w.yaw=0; } });
  await new Promise(r=>setTimeout(r,2500));
  await p.screenshot({ path: `${OUT}diag-${name}.png` });
  const st = await p.evaluate(() => {
    const g=window.__game, w=g.ship.walk;
    return { mode: g.getMode(), altM: +((w.localPos.length()-(6371+0.001))*1000).toFixed(1),
      camDist: +g.orbitCam.dist.toFixed(3), levelsBuilt: g.terrainMgr.active?.patches?.levels?.filter(l=>l.built).length };
  });
  console.log(name, JSON.stringify(st));
  // 退出行走，回到轨道再落另一处
  await p.evaluate(() => window.__game.setMode?.('orbit'));
  await new Promise(r=>setTimeout(r,2500));
}
await b.close();
