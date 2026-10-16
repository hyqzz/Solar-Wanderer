// 真实度基准：固定的机位 + 固定的量化指标，用来判断"改了之后是变好还是变坏"。
//
// 为什么必须有它：前面几轮反复证明，没有基准的改动会改错地方——我先误判过一次
// 足迹抗混叠门限（以为它压掉了近景细节，其实眼高处它是开着的），又误判过一次
// 噪声精度。这两次都是"改完看着差不多"，无法判断。
//
// 四个标准视角，覆盖"各个角度"：
//   disk       正对日下点看整盘（轨道级：纹理、色彩、临边）
//   terminator 相位角约 90°（晨昏线：明暗过渡、大气/无大气的差别）
//   pole       从自转轴方向看极区（极冠、极地纹理拉伸）
//   ground     降落到地表看地平线（近景：地面质感）
//
// 每个视角输出：截图 + 一组量化指标。
//   对比度 std       —— 画面层次
//   纹理能量        —— 相邻像素差均值（近景是否有颗粒）
//   暗部占比        —— 是否有大片死黑
//   高光占比        —— 是否过曝
//
// 用法：node tools/bench-realism.mjs [body1,body2,...]
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('./.bench/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const BODIES = (process.argv[2] ?? 'earth,mars,moon,europa,ganymede,titan,enceladus,mercury').split(',');
const VIEWS = ['disk', 'terminator', 'pole', 'ground'];   // 近景必须放最后，见下

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 900, height: 640 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

/** 指标：读回画面像素 */
const measure = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const L = (x, y) => { const i = ((h - 1 - y) * w + x) * 4; return (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114); };
    let n = 0, sum = 0, sum2 = 0, tex = 0, dark = 0, blown = 0;
    for (let y = 4; y < h - 4; y++) {
      for (let x = 4; x < w - 4; x++) {
        const v = L(x, y);
        n++; sum += v; sum2 += v * v;
        tex += Math.abs(L(x + 1, y) - v);
        if (v < 8) dark++;
        if (v > 245) blown++;
      }
    }
    const mean = sum / n;
    res({
      mean: +mean.toFixed(1),
      std: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1),
      tex: +(tex / n).toFixed(3),
      darkPct: +(dark / n * 100).toFixed(1),
      blownPct: +(blown / n * 100).toFixed(2),
    });
  };
}));

/** 取某方向的体固经纬（子星点/反日点等） */
const localOf = (id, mode) => p.evaluate((bid, m) => {
  // 卫星不在 builder.bodies 里（它们在 registry），必须回退查找——
  // 少了这一步时 localOf 抛错、机位从不移动，拍出来全是初始视角（第一版就是这样，
  // 六颗天体的 twelve 张图指标一模一样，实际全是地球海面）。
  const e = window.__game.builder.bodies.get(bid)
    ?? [...window.__game.registry.values()].find((t) => t.id === bid);
  const q = e.mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  let v = { x: -pos[0] / L, y: -pos[1] / L, z: -pos[2] / L };        // 子日方向
  if (m === 'anti') v = { x: -v.x, y: -v.y, z: -v.z };
  if (m === 'pole') v = { x: 0, y: 1, z: 0 };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z, iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  // 体固系里极轴是 +Y，所以 dir.y 直接是纬度正弦
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx), R: e.phys.radiusKm };
}, id, mode);

// 视角按非近景在前、近景在后排序：近景会把应用切到行走模式，而从行走模式回轨道
// 在本环境里不可靠（滚轮起飞不生效——第一版因此拍到后面所有天体都是同一帧）。
// 换个排法就完全不需要切回来。

const rows = [];
for (const view of VIEWS) {
  for (const id of BODIES) {
    try {
      const mode = view === 'terminator' ? 'anti' : 'sub';
      const ss = await localOf(id, view === 'pole' ? 'pole' : mode);
      const aim = await p.evaluate((m, bid, view, ssr) => {
        const g = window.__game, oc = g.orbitCam;
        g.select(bid);
        oc.focusId = bid; oc.flight = null; oc.panOffset.set(0, 0, 0);
        oc.tilt = 0; oc.heading = 0;
        if (view === 'ground') {
          oc.lat = 0.35; oc.lon = ssr.lon;
          oc.dist = oc.distTarget = ssr.R + 0.002;
        } else {
          oc.lat = ssr.lat; oc.lon = ssr.lon;
          oc.dist = oc.distTarget = ssr.R * (view === 'pole' ? 2.6 : 3.0);
        }
        return { R: ssr.R, lon: ssr.lon };
      }, mode, id, view, ss);
      if (view === 'ground') {
        for (let i = 0; i < 60; i++) {
          if (await p.evaluate((bid) => window.__game.terrainMgr.baseReady(bid), id)) break;
          await new Promise((r) => setTimeout(r, 400));
        }
        await p.evaluate((bid, a) => {
          const g = window.__game, oc = g.orbitCam;
          if (g.getMode() !== 'orbit' || oc.focusId !== bid) return;
          const V = Object.getPrototypeOf(g.camera.position).constructor;
          const L = 0.35;
          const dir = new V(Math.cos(L) * Math.cos(-a.lon), Math.sin(L), Math.cos(L) * Math.sin(-a.lon));
          oc.dist = oc.distTarget = g.terrainMgr.heightAt(bid, dir) + 0.002;
        }, id, aim);
        for (let i = 0; i < 60; i++) {
          if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      await new Promise((r) => setTimeout(r, view === 'ground' ? 11000 : 7000));
      if (view === 'ground') {
        await p.evaluate(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 0.05; w.yaw = 0; } });
        await new Promise((r) => setTimeout(r, 2500));
      }
      const m = await measure();
      await p.screenshot({ path: `${OUT}${id}-${view}.png` });
      rows.push({ id, view, ...m });
      console.log(`${id.padEnd(10)}${view.padEnd(11)} 均值${String(m.mean).padStart(6)}  std${String(m.std).padStart(5)}  纹理${String(m.tex).padStart(6)}  暗${String(m.darkPct).padStart(5)}%  过曝${String(m.blownPct).padStart(5)}%`);
    } catch (e) {
      console.log(`${id} ${view} 失败: ${e.message}`);
    }
  }
}
writeFileSync(OUT + '/bench.json', JSON.stringify({ when: new Date().toISOString(), rows }, null, 1));
console.log(`\n错误 ${errs.length}${errs[0] ? ' · ' + errs[0] : ''}  截图与 bench.json → ${OUT}`);
await b.close();
