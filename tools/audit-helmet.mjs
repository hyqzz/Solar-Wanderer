import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 560 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium&pr=1', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
// 直接落到月球
const ss = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('moon');
  const q=e.mesh.quaternion,pos=e.posKm; const L=Math.hypot(...pos)||1;
  const v={x:-pos[0]/L,y:-pos[1]/L,z:-pos[2]/L};
  const [qx,qy,qz,qw]=[-q.x,-q.y,-q.z,q.w];
  const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
  const iw=-qx*v.x-qy*v.y-qz*v.z;
  const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return {lat:Math.asin(Math.max(-1,Math.min(1,ly))),lon:Math.atan2(-lz,lx),R:e.phys.radiusKm};
});
await p.evaluate((m)=>{ const g=window.__game,oc=g.orbitCam;
  g.select('moon'); oc.focusId='moon'; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.lat=m.lat; oc.lon=m.lon; oc.dist=oc.distTarget=m.R+0.002; }, ss);
for(let i=0;i<70;i++){ if(await p.evaluate(()=>window.__game.terrainMgr.baseReady('moon'))) break; await new Promise(r=>setTimeout(r,500)); }
await p.evaluate((m)=>{ const g=window.__game,oc=g.orbitCam;
  const V=Object.getPrototypeOf(g.camera.position).constructor; const L=8*Math.PI/180;
  const dir=new V(Math.cos(L)*Math.cos(-m.lon),Math.sin(L),Math.cos(L)*Math.sin(-m.lon));
  oc.dist=oc.distTarget=g.terrainMgr.heightAt('moon',dir)+0.002; }, ss);
for(let i=0;i<70;i++){ if((await p.evaluate(()=>window.__game.getMode()))==='walk') break; await new Promise(r=>setTimeout(r,500)); }
await new Promise(r=>setTimeout(r,6000));
const v = await p.evaluate(() => {
  const g=window.__game;
  return { mode: g.getMode(),
    camQ: g.camera.quaternion.toArray().map(x=>+x.toFixed(3)),
    shipQ: g.ship.quat.toArray().map(x=>+x.toFixed(3)),
    overlayQ: g.overlayCam.quaternion.toArray().map(x=>+x.toFixed(3)),
    overlayPos: g.overlayCam.position.toArray(),
    sameQ: g.camera.quaternion.angleTo(g.overlayCam.quaternion).toFixed(4) };
});
console.log(JSON.stringify(v));
await b.close();
