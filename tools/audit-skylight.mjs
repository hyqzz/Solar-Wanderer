import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 440 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
const ss = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('mars');
  const q=e.mesh.quaternion,pos=e.posKm; const L=Math.hypot(...pos)||1;
  const v={x:-pos[0]/L,y:-pos[1]/L,z:-pos[2]/L};
  const [qx,qy,qz,qw]=[-q.x,-q.y,-q.z,q.w];
  const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
  const iw=-qx*v.x-qy*v.y-qz*v.z;
  const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return {lat:Math.asin(Math.max(-1,Math.min(1,ly))),lon:Math.atan2(-lz,lx),R:e.phys.radiusKm};
});
await p.evaluate((m) => {
  const g=window.__game,oc=g.orbitCam;
  g.select('mars'); oc.focusId='mars'; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.lat=m.lat; oc.lon=m.lon+80*Math.PI/180; oc.tilt=0; oc.heading=0;
  oc.dist=oc.distTarget=m.R+0.002;
}, ss);
for(let i=0;i<70;i++){ if(await p.evaluate(()=>window.__game.terrainMgr.baseReady('mars'))) break; await new Promise(r=>setTimeout(r,500)); }
await p.evaluate((m)=>{ const g=window.__game,oc=g.orbitCam;
  const V=Object.getPrototypeOf(g.camera.position).constructor; const L=18*Math.PI/180;
  const dir=new V(Math.cos(L)*Math.cos(-m.lon),Math.sin(L),Math.cos(L)*Math.sin(-m.lon));
  oc.dist=oc.distTarget=g.terrainMgr.heightAt('mars',dir)+0.002; }, ss);
for(let i=0;i<70;i++){ if((await p.evaluate(()=>window.__game.getMode()))==='walk') break; await new Promise(r=>setTimeout(r,500)); }
await new Promise(r=>setTimeout(r,8000));
const info = await p.evaluate(() => {
  const g = window.__game; const out = { hemi: [], point: [], ambient: [] };
  g.builder.group?.parent?.traverse?.(o => {});
  let root = g.camera; while (root.parent) root = root.parent;
  root.traverse((o) => {
    if (o.isHemisphereLight) out.hemi.push({ i:+o.intensity.toFixed(3), c:o.color.getHexString(), gc:o.groundColor?.getHexString?.() });
    if (o.isPointLight) out.point.push({ i:+o.intensity.toFixed(3), v:o.visible });
    if (o.isAmbientLight) out.ambient.push({ i:+o.intensity.toFixed(3) });
  });
  return out;
});
console.log(JSON.stringify(info));
await b.close();
