import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 460 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,8000));
const id='moon';
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
await p.evaluate((m)=>{ const g=window.__game,oc=g.orbitCam;
  g.select('moon'); oc.focusId='moon'; oc.flight=null; oc.panOffset.set(0,0,0);
  oc.lat=m.lat; oc.lon=m.lon; oc.tilt=0; oc.heading=0; oc.dist=oc.distTarget=m.R*3.0; }, ss);
await new Promise(r=>setTimeout(r,6000));
const prof = await p.evaluate(() => new Promise((res) => {
  const g=window.__game, gl=g.renderer.getContext();
  const w=gl.drawingBufferWidth, h=gl.drawingBufferHeight;
  const orig=g.composer.render.bind(g.composer);
  g.composer.render=(...a)=>{ orig(...a); g.composer.render=orig;
    const buf=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    const L=(x,y)=>{ const i=((h-1-y)*w+x)*4; return buf[i]*0.299+buf[i+1]*0.587+buf[i+2]*0.114; };
    const cx=w/2|0, cy=h/2|0;
    // 找盘半径：沿水平向右扫，亮度跌破 10 的位置
    let R=0; for (let r=0;r<w/2;r++){ if (L(cx+r,cy) < 10) { R=r; break; } }
    if (!R) R = Math.min(w,h)/2;
    const out=[];
    for (const f of [0.05,0.2,0.4,0.6,0.75,0.85,0.93,0.98]) {
      const r=Math.round(R*f);
      // 取一圈的平均
      let s=0,n=0;
      for (let a=0;a<180;a++){ const th=a/180*Math.PI*2; const x=Math.round(cx+r*Math.cos(th)), y=Math.round(cy+r*Math.sin(th));
        if(x>2&&x<w-2&&y>2&&y<h-2){ s+=L(x,y); n++; } }
      out.push({ f, lum:+(s/n).toFixed(1) });
    }
    // 兰伯特理论：L(μ)=μ，μ=sqrt(1-f²)，以中心归一
    const theo = out.map(o=>+(Math.sqrt(Math.max(0,1-o.f*o.f))*out[0].lum).toFixed(1));
    res({ R, prof: out, theo });
  };
}));
console.log('盘半径', prof.R, 'px');
console.log('r/R   实测亮度   兰伯特理论');
prof.prof.forEach((o,i)=>console.log(String(o.f).padEnd(5), String(o.lum).padStart(7), String(prof.theo[i]).padStart(11)));
await b.close();
