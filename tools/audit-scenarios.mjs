// 全角度真实度审计：把"用户能到达的各种机位"逐一定位并截图。
// 用法：node tools/audit-scenarios.mjs [场景名过滤]
//
// 与 bench-realism.mjs 的分工：bench 只做四个标准视角、天体级对比；
// 本工具做"场景级"覆盖——低轨、暮光、仰天、水下、环平面、彗星、小天体等
// 容易被漏掉、却恰恰是"身临其境"最吃紧的机位。
//
// 每个场景都**重新打开页面**：落地会切到行走模式，而从行走模式回轨道在本环境里
// 不可靠（bench-realism.mjs 就因此把地球之后所有天体的地面图都拍成了同一帧海面）。
// 重开页面的代价是每场景约 12 s 启动，换来的是"每张图都真的在目标天体上"。
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const FILTER = process.argv[2] ?? '';

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let p = null, errs = [];

async function freshPage() {
  if (p) { try { await p.close(); } catch {} }
  p = await b.newPage();
  errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.setViewport({ width: 960, height: 600 });
  await p.goto(`http://127.0.0.1:4199/?clean=1&quality=${process.env.AUDIT_Q ?? 'high'}&pr=1${process.env.AUDIT_FLAGS ?? ''}`, { waitUntil: 'networkidle2', timeout: 180000 });
  await p.waitForFunction(() => {
    const x = document.getElementById('start-btn');
    return x && !x.disabled;
  }, { timeout: 120000 });
  await p.click('#start-btn');
  await new Promise((r) => setTimeout(r, 9000));
}

/** 取天体在某方向的体固经纬（子日/反日/极点） */
const localOf = (id, mode) => p.evaluate((bid, m) => {
  const e = window.__game.builder.bodies.get(bid)
    ?? [...window.__game.registry.values()].find((t) => t.id === bid);
  if (!e) throw new Error('未找到天体 ' + bid);
  const mesh = e.mesh ?? e.relObj;
  const q = mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  let v = { x: -pos[0] / L, y: -pos[1] / L, z: -pos[2] / L };
  if (m === 'anti') v = { x: -v.x, y: -v.y, z: -v.z };
  if (m === 'pole') v = { x: 0, y: 1, z: 0 };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z, iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx), R: e.phys?.radiusKm ?? e.radiusKm };
}, id, mode);

async function orbit(id, distKm, lat, lon) {
  await p.evaluate((bid, d, la, lo) => {
    const g = window.__game, oc = g.orbitCam;
    g.select(bid);
    oc.focusId = bid; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.tilt = 0; oc.heading = 0;
    if (la !== null) oc.lat = la;
    if (lo !== null) oc.lon = lo;
    oc.dist = oc.distTarget = d;
  }, id, distKm, lat, lon);
}

async function land(id, latDeg, lonShiftDeg) {
  const ss = await localOf(id, 'sub');
  await orbit(id, ss.R + 0.002, ss.lat, ss.lon + (lonShiftDeg ?? 0) * Math.PI / 180);
  for (let i = 0; i < 70; i++) {
    if (await p.evaluate((bid) => window.__game.terrainMgr.baseReady(bid), id)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await p.evaluate((m, bid, la) => {
    const g = window.__game, oc = g.orbitCam;
    if (g.getMode() !== 'orbit' || oc.focusId !== bid) return;
    const V = Object.getPrototypeOf(g.camera.position).constructor;
    const L = la * Math.PI / 180;
    const dir = new V(Math.cos(L) * Math.cos(-m.lon), Math.sin(L), Math.cos(L) * Math.sin(-m.lon));
    oc.dist = oc.distTarget = g.terrainMgr.heightAt(bid, dir) + 0.002;
  }, ss, id, latDeg);
  for (let i = 0; i < 70; i++) {
    if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return p.evaluate(() => window.__game.getMode());
}

const look = (pitch, yaw) => p.evaluate((pi, ya) => {
  const w = window.__game.ship?.walk;
  if (w) { w.pitch = pi; w.yaw = ya; }
}, pitch, yaw);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const metrics = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const L = (x, y) => { const i = ((h - 1 - y) * w + x) * 4; return (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114); };
    let n = 0, sum = 0, s2 = 0, tex = 0, dark = 0, blown = 0;
    const hist = new Array(16).fill(0);
    for (let y = 4; y < h - 4; y++) {
      for (let x = 4; x < w - 4; x++) {
        const v = L(x, y);
        n++; sum += v; s2 += v * v; tex += Math.abs(L(x + 1, y) - v);
        hist[Math.min(15, v / 16 | 0)]++;
        if (v < 8) dark++;
        if (v > 245) blown++;
      }
    }
    const mean = sum / n;
    res({
      mean: +mean.toFixed(1),
      std: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(1),
      tex: +(tex / n).toFixed(3),
      darkPct: +(dark / n * 100).toFixed(1),
      blownPct: +(blown / n * 100).toFixed(2),
      peakBin: +(Math.max(...hist) / n * 100).toFixed(1),
    });
  };
}));

const fps = () => p.evaluate(() => new Promise((res) => {
  let f = 0; const t0 = performance.now();
  const tick = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(+(f / ((performance.now() - t0) / 1000)).toFixed(1)); };
  requestAnimationFrame(tick);
}));

const state = () => p.evaluate(() => {
  const g = window.__game;
  return {
    mode: g.getMode(),
    focus: g.orbitCam.focusId ?? null,
    lat: +(g.orbitCam.lat * 180 / Math.PI).toFixed(2),
    dist: +g.orbitCam.dist.toFixed(1),
  };
});

const SCENARIOS = [
  ['earth-space', async () => { await orbit('earth', 6371 * 3.2, null, null); await wait(7000); }],
  ['earth-space-late', async () => { await orbit('earth', 6371 * 3.2, null, null); await wait(22000); }],
  ['earth-leo', async () => { await orbit('earth', 6371 + 400, null, null); await wait(9000); }],
  ['earth-night', async () => { const s = await localOf('earth', 'anti'); await orbit('earth', 6371 * 3.2, s.lat, s.lon); await wait(7000); }],
  ['earth-ground-horizon', async () => { await land('earth', 30, 0); await look(0.03, 0); await wait(9000); }],
  ['earth-ground-up', async () => { await look(1.15, 0); await wait(3000); }],
  ['earth-underwater', async () => {
    // 先真的落到海面（每个场景都会重开页面，不能依赖上一个场景的状态），
    // 再下潜：陆地上设 underwater 是无效的——水下环境由 isWater 决定。
    await land('earth', 12, 0);
    await p.evaluate(() => {
      const g = window.__game;
      g.ship.posKm[0] -= 0.06; g.ship.posKm[1] -= 0.06;   // 下沉 ~60m
      if (g.ship.walk) g.ship.walk.pitch = 0.35;
    });
    await wait(9000);
  }],
  ['mars-space', async () => { await orbit('mars', 3390 * 3.0, null, null); await wait(7000); }],
  ['mars-ground-horizon', async () => { await land('mars', 18, 0); await look(0.04, 0); await wait(10000); }],
  ['mars-ground-up', async () => { await look(1.15, 0); await wait(3000); }],
  ['titan-ground-horizon', async () => { await land('titan', 40, 0); await look(0.04, 0); await wait(10000); }],
  ['titan-ground-up', async () => { await look(1.15, 0); await wait(3000); }],
  ['moon-ground-horizon', async () => { await land('moon', 8, 0); await look(0.05, 0); await wait(10000); }],
  ['moon-ground-up', async () => { await look(1.15, 0); await wait(3000); }],
  // 低太阳角机位：日下点正顶照时起伏不投影、看不见——判"地面有没有地貌"
  // 必须在斜射光下看。偏 80° 经度约等于太阳高度 10°。
  ['moon-ground-dusk', async () => { await land('moon', 8, 80); await look(0.05, 0); await wait(10000); }],
  ['mars-ground-dusk', async () => { await land('mars', 18, 80); await look(0.05, 0); await wait(10000); }],
  ['mercury-ground-horizon', async () => { await land('mercury', 20, 0); await look(0.05, 0); await wait(10000); }],
  // 低轨机位：判"地形方块与基底球的交界"是否可见（R4）
  ['moon-loworbit', async () => { await orbit('moon', 1737 + 300, 0.3, null); await wait(12000); }],
  ['mars-loworbit', async () => { await orbit('mars', 3390 + 300, 0.2, null); await wait(12000); }],
  ['europa-ground-horizon', async () => { await land('europa', 12, 0); await look(0.05, 0); await wait(10000); }],
  ['enceladus-ground-horizon', async () => { await land('enceladus', 5, 0); await look(0.05, 0); await wait(10000); }],
  ['io-ground-horizon', async () => { await land('io', 15, 0); await look(0.05, 0); await wait(10000); }],
  ['io-space', async () => { await orbit('io', 1821 * 2.6, null, null); await wait(7000); }],
  ['enceladus-space', async () => { await orbit('enceladus', 252 * 2.6, null, null); await wait(7000); }],
  ['saturn-rings-edge', async () => { await orbit('saturn', 60268 * 2.3, 0.02, null); await wait(9000); }],
  ['sun-close', async () => { await orbit('sun', 696000 * 2.2, null, null); await wait(8000); }],
  ['jupiter-space', async () => { await orbit('jupiter', 71492 * 2.6, null, null); await wait(8000); }],
];

const rows = [];
for (const [name, fn] of SCENARIOS) {
  if (FILTER && !name.includes(FILTER)) continue;
  try {
    const t0 = Date.now();
    await freshPage();
    await fn();
    const m = await metrics();
    const f = await fps();
    const st = await state();
    await p.screenshot({ path: `${OUT}${name}.png` });
    if (process.env.AUDIT_HIDE === 'expo') {
      await p.evaluate(() => { window.__game.renderer.toneMappingExposure *= 6; });
      await wait(2500);
      await p.screenshot({ path: `${OUT}${name}-expo.png` });
      await p.evaluate(() => { window.__game.renderer.toneMappingExposure /= 6; });
    }
    if (process.env.AUDIT_HIDE === 'mesh') {
      await p.evaluate(() => { const g = window.__game; const n = g.__nearest;
        if (n) g.builder.bodies.get(n.id).mesh.visible = false; });
      await wait(2500);
      await p.screenshot({ path: `${OUT}${name}-nomesh.png` });
      await p.evaluate(() => { const g = window.__game; const n = g.__nearest;
        if (n) g.builder.bodies.get(n.id).mesh.visible = true; });
    }
    rows.push({ name, ...st, fps: f, ...m });
    if (process.env.AUDIT_FOG) {
      const d = await p.evaluate(() => {
        const g = window.__game;
        const fog = g.renderer?.__fogRef;
        const n = g.__nearest;
        const cam = g.camera;
        const v = { x: 0, y: 0, z: -1 };
        const e = n && g.builder.bodies.get(n.id);
        return {
          fog: fog ? fog.color.toArray().map((x) => +x.toFixed(4)) : null,
          dens: fog ? +fog.density.toFixed(5) : null,
          exp: +g.renderer.toneMappingExposure.toFixed(3),
          nearest: n ? n.id : null,
          alt: n ? +n.distSurface.toFixed(2) : null,
          atmo: !!(e && e.phys.atmosphere),
          gt: e?.phys?.atmosphere?.groundTint ?? null,
          sunCol: globalThis.__sunLight ? globalThis.__sunLight.color.toArray().map((x) => +x.toFixed(3)) : null,
          sunInt: globalThis.__sunLight ? +globalThis.__sunLight.intensity.toFixed(4) : null,
          skyInt: globalThis.__skyLight ? +globalThis.__skyLight.intensity.toFixed(4) : null,
          lights: (() => {
            const out = [];
            const scan = (root) => root.traverse((o) => { if (o.isLight) out.push({
              type: o.type, vis: o.visible, i: +o.intensity.toFixed(4),
              c: o.color ? o.color.toArray().map((x) => +x.toFixed(2)) : null,
              shadow: !!o.castShadow }); });
            scan(globalThis.__scene ?? { traverse: () => {} });
            return out;
          })(),
          px: (() => {
            const cv = g.renderer.domElement;
            const c2 = document.createElement('canvas');
            c2.width = cv.width; c2.height = cv.height;
            const ctx = c2.getContext('2d');
            ctx.drawImage(cv, 0, 0);
            const pick = (fx, fy) => {
              const d = ctx.getImageData(Math.floor(cv.width * fx), Math.floor(cv.height * fy), 1, 1).data;
              return [d[0], d[1], d[2]];
            };
            return { mid: pick(0.5, 0.4), low: pick(0.5, 0.8), sky: pick(0.5, 0.1) };
          })(),
          water: (() => {
            const tm = g.terrainMgr;
            return null;
          })(),
          terrHeight: (() => {
            const tm = g.terrainMgr;
            if (!n) return null;
            const V = Object.getPrototypeOf(g.camera.position).constructor;
            const q = e.mesh.quaternion;
            const rel = new V(g.ship.posKm[0] - e.posKm[0], g.ship.posKm[1] - e.posKm[1], g.ship.posKm[2] - e.posKm[2]);
            const L = rel.length(); rel.divideScalar(L);
            const iq = q.clone().invert();
            const loc = rel.clone().applyQuaternion(iq);
            const f = tm.field(n.id);
            return { camR: +L.toFixed(3), h: +tm.heightAt(n.id, loc).toFixed(3), R: e.phys.radiusKm,
              baseOffset: +f.baseOffset.toFixed(3), effAmp: +f.effAmp.toFixed(3),
              relief: +f.reliefRadius(loc).toFixed(3), baseSph: +f.baseSphereRadius(loc).toFixed(3),
              deformed: f.deformed, reliefSphere: f.reliefSphere,
              meshR: +e.mesh.geometry.boundingSphere.radius.toFixed(3),
              atmoMesh: !!e.atmoMesh };
          })(),
        };
      });
      console.log('   fog', JSON.stringify(d));
    }
    console.log(`${name.padEnd(24)} ${String(st.mode).padEnd(5)} ${String(st.focus).padEnd(9)} 均值${String(m.mean).padStart(6)} std${String(m.std).padStart(5)} 纹理${String(m.tex).padStart(6)} 暗${String(m.darkPct).padStart(5)}% 过曝${String(m.blownPct).padStart(5)}% 主档${String(m.peakBin).padStart(4)}% fps${String(f).padStart(5)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    console.log(`${name.padEnd(24)} 失败: ${e.message}`);
    rows.push({ name, error: e.message });
  }
  if (errs.length) console.log(`   ⚠ 页面错误 ${errs.length}: ${errs[0]}`);
}
writeFileSync(OUT + '/audit.json', JSON.stringify({ when: new Date().toISOString(), rows }, null, 1));
console.log(`\n截图 → ${OUT}`);
await b.close();
