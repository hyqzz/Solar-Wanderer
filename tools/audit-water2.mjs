import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 440 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x=document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r=>setTimeout(r,9000));
const r = await p.evaluate(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('earth');
  const q = e.mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(...pos) || 1;
  const v = {x:-pos[0]/L, y:-pos[1]/L, z:-pos[2]/L};
  const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
  const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
  const iw=-qx*v.x-qy*v.y-qz*v.z;
  const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  const lat0=Math.asin(Math.max(-1,Math.min(1,ly))), lon0=Math.atan2(-lz,lx);
  const out = [];
  for (const lat of [0, 10, 20, 30, 40, 50]) {
    const Lr = lat*Math.PI/180;
    const dir = { x: Math.cos(Lr)*Math.cos(-lon0), y: Math.sin(Lr), z: -Math.cos(Lr)*Math.sin(-lon0) };
    const V = Object.getPrototypeOf(g.camera.position).constructor;
    const d = new V(dir.x, dir.y, dir.z);
    out.push({ lat,
      isWater: g.terrainMgr.isWater('earth', d),
      height_km: +g.terrainMgr.heightAt('earth', d).toFixed(3),
      baseR: +e.phys.radiusKm.toFixed(1),
    });
  }
  return out;
});
for (const x of r) console.log(`lat ${String(x.lat).padStart(2)}°  isWater=${String(x.isWater).padEnd(5)}  height=${x.height_km} km  (基准 ${x.baseR})`);
await b.close();
