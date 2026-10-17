import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 460 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
for (const id of ['moon','enceladus','mars']) {
  const ss = await p.evaluate((bid) => {
    const e = window.__game.builder.bodies.get(bid) ?? [...window.__game.registry.values()].find(t=>t.id===bid);
    const q=e.mesh.quaternion,pos=e.posKm; const L=Math.hypot(...pos)||1;
    const v={x:-pos[0]/L,y:-pos[1]/L,z:-pos[2]/L};
    const [qx,qy,qz,qw]=[-q.x,-q.y,-q.z,q.w];
    const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
    const iw=-qx*v.x-qy*v.y-qz*v.z;
    const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
    return {lat:Math.asin(Math.max(-1,Math.min(1,ly))),lon:Math.atan2(-lz,lx),R:e.phys?.radiusKm??e.radiusKm};
  }, id);
  await p.evaluate((m,bid)=>{ const g=window.__game,oc=g.orbitCam;
    g.select(bid); oc.focusId=bid; oc.flight=null; oc.panOffset.set(0,0,0);
    oc.lat=m.lat; oc.lon=m.lon; oc.tilt=0; oc.heading=0; oc.dist=oc.distTarget=m.R*3.0; }, ss, id);
  await new Promise(r=>setTimeout(r,5000));
  const v = await p.evaluate(() => new Promise((res) => {
    const g=window.__game, gl=g.renderer.getContext();
    const w=gl.drawingBufferWidth, h=gl.drawingBufferHeight;
    const orig=g.composer.render.bind(g.composer);
    g.composer.render=(...a)=>{ orig(...a); g.composer.render=orig;
      const buf=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
      // 盘心 40×40
      let n=0,r=0,gg=0,bb=0;
      const cx=w/2|0, cy=h/2|0;
      for(let y=cy-20;y<cy+20;y++) for(let x=cx-20;x<cx+20;x++){
        const i=((h-1-y)*w+x)*4; r+=buf[i]; gg+=buf[i+1]; bb+=buf[i+2]; n++;
      }
      res({ center:[Math.round(r/n),Math.round(gg/n),Math.round(bb/n)] });
    };
  }));
  const u = await p.evaluate((bid)=>{ const e=window.__game.builder.bodies.get(bid)??[...window.__game.registry.values()].find(t=>t.id===bid);
    const uu=e.mat.userData.uniforms;
    return { sunI:+uu.uSunI.value.toFixed(4), norm:uu.uHapkeNorm?+uu.uHapkeNorm.value.toFixed(3):null,
             grade:+uu.uGrade.value.x.toFixed(3), exposure:+window.__game.renderer.toneMappingExposure.toFixed(3) }; }, id);
  console.log(id.padEnd(10), '盘心', JSON.stringify(v.center), JSON.stringify(u));
}
await b.close();
