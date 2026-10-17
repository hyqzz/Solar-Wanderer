import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 460 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
const id='mars';
const ss = await p.evaluate((bid) => {
  const e = window.__game.builder.bodies.get(bid);
  const q=e.mesh.quaternion,pos=e.posKm; const L=Math.hypot(...pos)||1;
  const v={x:-pos[0]/L,y:-pos[1]/L,z:-pos[2]/L};
  const [qx,qy,qz,qw]=[-q.x,-q.y,-q.z,q.w];
  const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
  const iw=-qx*v.x-qy*v.y-qz*v.z;
  const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return {lat:Math.asin(Math.max(-1,Math.min(1,ly))),lon:Math.atan2(-lz,lx),R:e.phys.radiusKm};
}, id);
for (const mult of [3,5,10,20]) {
  await p.evaluate((m, k)=>{ const g=window.__game,oc=g.orbitCam;
    g.select('mars'); oc.focusId='mars'; oc.flight=null; oc.panOffset.set(0,0,0);
    oc.lat=m.lat; oc.lon=m.lon; oc.tilt=0; oc.heading=0; oc.dist=oc.distTarget=m.R*k; }, ss, mult);
  await new Promise(r=>setTimeout(r,5000));
  const v = await p.evaluate(() => new Promise((res) => {
    const g=window.__game, gl=g.renderer.getContext();
    const w=gl.drawingBufferWidth, h=gl.drawingBufferHeight;
    const orig=g.composer.render.bind(g.composer);
    g.composer.render=(...a)=>{ orig(...a); g.composer.render=orig;
      const buf=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
      let n=0,r=0,gg=0,bb=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){ const i=((h-1-y)*w+x)*4;
        const L=buf[i]*0.299+buf[i+1]*0.587+buf[i+2]*0.114; if(L<=15) continue;
        r+=buf[i];gg+=buf[i+1];bb+=buf[i+2];n++; }
      const e=g.builder.bodies.get('mars');
      res({ n, mean:[Math.round(r/n),Math.round(gg/n),Math.round(bb/n)],
        exposure:+g.renderer.toneMappingExposure.toFixed(3),
        sunI:+e.mat.userData.uniforms.uSunI.value.toFixed(4),
        camDist:+g.orbitCam.dist.toFixed(0) });
    };
  }));
  console.log(`${mult}R  实测距离 ${v.camDist} km  盘面像元 ${v.n}  RGB ${v.mean.join(',')}  exposure ${v.exposure} sunI ${v.sunI}`);
}
await b.close();
