// 参照一致性测量台：逐天体在**多个日期**的日下点渲染，与已知资料对照。
//
// 为什么要多日期：同一天体在不同时刻呈现出的是不同的地貌面（自转）与不同的
// 太阳活动/季节。只测一个机位会把"这一面恰好偏暗"误判成"模型错了"。
// 相机始终放在**日下点**（相位角恒为 0°），所以各次采样的光照条件一致，
// 变化的只有朝向相机的地貌——这正是我们要平均掉的那部分。
//
// 目标值由定义推出，不是拍脑袋：
//   盘面平均亮度(线性) = 几何反照率 × (2/3) × 曝光系数
//   · 2/3：完美兰伯特球的盘面积分亮度（几何反照率的定义基准）
//   · 曝光：ACES 内部先乘 toneMappingExposure/0.6；本项目的曝光 = 0.75·d²，
//     而场景辐亮度 ∝ 1/d²，所以 ACES 输入 = 反照率×NdotL×1.25
//   最后要经过 ACES + sRGB 变换再与实测的 0-255 值比。
//
// 用法：node tools/verify-reference.mjs [body1,body2,...]
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('./.reference/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const IDS = (process.argv[2] ?? 'earth,mars,moon,mercury,venus,enceladus,mimas,europa,io,ganymede,titan,jupiter,saturn,pluto,uranus,neptune').split(',');
const DATES_D = (process.env.REF_DATES ?? '0,60').split(',').map(Number);   // 相对当前时刻的天数偏移

// 实测几何反照率（贴图所描绘的那一层）。无实测值的天体跳过比较。
const A = {
  mercury: 0.106, venus: 0.67, earth: 0.20, moon: 0.136, mars: 0.25,
  jupiter: 0.538, saturn: 0.499, uranus: 0.488, neptune: 0.442, pluto: 0.52,
  io: 0.63, europa: 0.67, ganymede: 0.43, callisto: 0.17, mimas: 0.962,
  enceladus: 0.99, tethys: 0.80, dione: 0.998, rhea: 0.949, titan: 0.22,
  iapetus: 0.25, triton: 0.76, charon: 0.38,
};

// three 的 ACESFilmicToneMapping（含矩阵与 RRTAndODTFit）
function acesMat(m, v) { return m.map((r) => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]); }
function acesOne(x) {
  const IN = [[0.59719,0.35458,0.04823],[0.07600,0.90834,0.01566],[0.02840,0.13383,0.83777]];
  const OUTM = [[1.60475,-0.53108,-0.07367],[-0.10208,1.10813,-0.00605],[-0.00327,-0.07276,1.07602]];
  const fit = (v) => (v*(v+0.0245786)-0.000090537) / (v*(0.983729*v+0.4329510)+0.238081);
  return Math.min(1, Math.max(0, acesMat(OUTM, acesMat(IN, [x,x,x]).map(fit))[0]));
}
const l2s = (x) => (x <= 0.0031308 ? x*12.92 : 1.055*Math.pow(Math.max(x,0), 1/2.4) - 0.055);
const EXPOSURE_FACTOR = 1.25;   // 0.75 / 0.6
const DISK_FACTOR = 2/3;

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 760, height: 520 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

const jd0 = await p.evaluate(() => window.__game.simClock.jdTT);

async function aim(id) {
  const ss = await p.evaluate((bid) => {
    const e = window.__game.builder.bodies.get(bid) ?? [...window.__game.registry.values()].find((t) => t.id === bid);
    if (!e) return null;
    const mesh = e.mesh ?? e.relObj ?? e.group;
    const q = mesh.quaternion ?? { x:0,y:0,z:0,w:1 };
    const pos = e.posKm ?? [0,0,0];
    const L = Math.hypot(pos[0],pos[1],pos[2]) || 1;
    const v = { x:-pos[0]/L, y:-pos[1]/L, z:-pos[2]/L };
    const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
    const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
    const iw=-qx*v.x-qy*v.y-qz*v.z;
    const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
    return { lat: Math.asin(Math.max(-1,Math.min(1,ly))), lon: Math.atan2(-lz,lx),
             R: e.phys?.radiusKm ?? e.radiusKm };
  }, id);
  if (!ss) return null;
  await p.evaluate((m, bid) => {
    const g = window.__game, oc = g.orbitCam;
    g.select(bid); oc.focusId = bid; oc.flight = null; oc.panOffset.set(0,0,0);
    oc.lat = m.lat; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = m.R * 20.0;   // 远距：入射/出射近似平行，才对应几何反照率的定义
  }, ss, id);
  await new Promise((r) => setTimeout(r, 4200));
  return ss;
}

const diskStats = (Rkm) => p.evaluate((R) => new Promise((res) => {
  const g = window.__game, gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    // 只统计**画面中心**的一个圆：相机始终对准天体中心，所以盘面在中心。
    // 不这样做的话，远距时盘面只有几十像素、而满天星点会被一起统计进来——
    // 实测 20R 处火星被平均成 (33,31,30) 的中性灰，其实是星星的颜色。
    const cx = w/2, cy = h/2;
    // 固定中心圆：相机始终对准天体中心，取画面中心 6% 半径的一块。
    // （试过按几何算盘半径，但 orbitCam.dist 与相机实际位置的口径不一致，掩膜会落空。）
    const rad = Math.min(w, h) * 0.06;
    let n=0, r=0, gg=0, bb=0, blown=0; const ls=[];
    for (let y=Math.floor(cy-rad); y<=cy+rad; y++) for (let x=Math.floor(cx-rad); x<=cx+rad; x++) {
      if ((x-cx)**2 + (y-cy)**2 > rad*rad) continue;
      const i=((h-1-y)*w+x)*4;
      const R=buf[i], G=buf[i+1], B=buf[i+2];
      const L=R*0.299+G*0.587+B*0.114;
      if (L<=15) continue;
      n++; r+=R; gg+=G; bb+=B; if (L>245) blown++; ls.push(L);
    }
    if (!n) return res({ n:0 });
    const mean=[r/n, gg/n, bb/n].map((v)=>Math.round(v));
    const lm=ls.reduce((a,c)=>a+c,0)/n;
    const sd=Math.sqrt(ls.reduce((s,v)=>s+(v-lm)**2,0)/n);
    res({ n, mean, std:+sd.toFixed(1), blown:+(blown/n*100).toFixed(1),
          lum: Math.round((mean[0]+mean[1]+mean[2])/3) });
  };
}));

const rows = [];
for (const id of IDS) {
  const samples = [];
  for (const dDays of DATES_D) {
    await p.evaluate((jd) => window.__game.simClock.set(jd), jd0 + dDays);
    await new Promise((r) => setTimeout(r, 700));
    const ss = await aim(id);
    if (!ss) break;
    const s = await diskStats(ss.R);
    if (s.n) samples.push(s);
  }
  if (!samples.length) { console.log(`${id}: 无盘面像元`); continue; }
  const mean = [0,1,2].map((k) => Math.round(samples.reduce((a,s)=>a+s.mean[k],0)/samples.length));
  const lum = Math.round(samples.reduce((a,s)=>a+s.lum,0)/samples.length);
  const lumMin = Math.min(...samples.map(s=>s.lum)), lumMax = Math.max(...samples.map(s=>s.lum));
  const blown = +(samples.reduce((a,s)=>a+s.blown,0)/samples.length).toFixed(1);
  const a = A[id];
  let target = null, ratio = null;
  if (a) {
    target = Math.round(l2s(acesOne(a * EXPOSURE_FACTOR * DISK_FACTOR)) * 255);
    ratio = +(lum / target).toFixed(2);
  }
  rows.push({ id, mean, lum, lumMin, lumMax, blown, target, ratio, samples: samples.length });
  const flag = ratio == null ? '' : (ratio < 0.82 || ratio > 1.22 ? '  ← 不达标' : '  ✓');
  console.log(`${id.padEnd(10)} RGB ${mean.join(',').padEnd(12)} 亮度 ${String(lum).padStart(3)}`
    + ` (${lumMin}–${lumMax}, ${samples.length}次)  目标 ${target == null ? '—' : String(target).padStart(3)}`
    + `  比值 ${ratio == null ? '—' : ratio}  过曝 ${blown}%${flag}`);
}
// 恢复时间
await p.evaluate((jd) => window.__game.simClock.set(jd), jd0);
writeFileSync(OUT + 'reference.json', JSON.stringify({ when: new Date().toISOString(), jd0, rows }, null, 1));
console.log(`\n页面错误 ${errs.length}`);
console.log(`结果 → ${OUT}reference.json`);
await b.close();
