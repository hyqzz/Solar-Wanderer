// LOD 掠飞录制：贴着月面以固定速度沿子午线掠过，逐帧抓图，交给 ffmpeg 合成对比视频。
//
// 为什么用「固定角步」而不是「墙钟时间」：截图本身耗时不定（软件渲染 0.3–1s），
// 若按墙钟推进相机，帧与帧之间的位移会忽大忽小，视频看着像卡顿，分不清是 LOD 跳变
// 还是采样不均。这里第 i 帧的纬度是 i 的确定函数、位移恒定 → 任何可见跳变都只能
// 来自地形重建本身。
//
// 取景：从日下点子午线偏南 45°（太阳高度约 45°，起伏有投影、又不会太暗），
// 航向 0（面朝北），沿子午线向北飞 → 运动方向正对屏幕深处。
//
// 用法：node tools/probe-lod-flyby.mjs <url> <outDir> [frames] [fps] [altKm] [speedKmS]
import puppeteer from 'puppeteer';
import { mkdirSync, rmSync } from 'node:fs';

const url = process.argv[2];
const outDir = process.argv[3];
const FRAMES = Number(process.argv[4] ?? 150);
const FPS = Number(process.argv[5] ?? 30);
const ALT = Number(process.argv[6] ?? 0.12);      // km
const SPEED = Number(process.argv[7] ?? 0.12);    // km/s

const R_MOON = 1737.4;
const DT = 1 / FPS;
const DLAT = (SPEED * DT) / R_MOON;               // 每帧纬度增量（rad）

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const b = await puppeteer.launch({
  headless: true, acceptInsecureCerts: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-certificate-errors'],
});
const p = await b.newPage();
await p.setViewport({ width: 720, height: 450 });
await p.goto(`${url}/?clean=1&quality=medium&pr=1`, { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; },
  { timeout: 240000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 12000));

// 隐藏界面。本地版 ?clean=1 会进 cinematic 模式，但 #hud-time 挂在 #left-col 下、
// 不在 cinematic 的隐藏清单里；线上是旧构建，根本不认 clean=1（整套触控 UI 都在）。
// 所以统一按"除了画布所在的祖先链，其余 fixed/absolute 元素一律收掉"处理。
await p.evaluate((lat, lon) => { window.__LAT = lat; window.__LON = lon; },
  Number(process.env.LAT ?? -45), Number(process.env.LON ?? 88));
await p.evaluate(() => {
  const cv = document.querySelector('canvas');
  const related = (el) => el === cv || (cv && (el.contains(cv) || cv.contains(el)));
  for (const el of document.querySelectorAll('body *')) {
    if (related(el)) continue;
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') el.style.display = 'none';
  }
  for (const s of ['#hud-time', '#left-col', '#hud', '#labels', '#directory', '.compass-widget']) {
    for (const el of document.querySelectorAll(s)) el.style.display = 'none';
  }
});

// 定位日下点 → 取子午线上偏南 45° 作为起点；航向 0（面朝北），沿子午线向北飞。
const start = await p.evaluate((alt) => {
  const g = window.__game;
  const e = g.builder.bodies.get('moon') ?? [...g.registry.values()].find((t) => t.id === 'moon');
  const mesh = e.mesh ?? e.relObj;
  const q = mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  const v = { x: -pos[0] / L, y: -pos[1] / L, z: -pos[2] / L };   // 体固系下指向太阳
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z, iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const subLat = Math.asin(Math.max(-1, Math.min(1, ly)));
  const subLon = Math.atan2(-lz, lx);
  const oc = g.orbitCam;
  g.select('moon');
  oc.focusId = 'moon'; oc.pendingFocusId = null; oc.flight = null;
  // 固定体固经纬度，而不是"日下点偏南 45°"：两个构建的日下点经度差 2.5°
  //（自转模型/时刻不同），跟着日下点走会让两边飞在**不同的地面**上，没法逐帧对照。
  // 固定到 (-45°, 88°E)：两边是同一片月面，日照高度分别约 41° 与 45°，差异可忽略。
  oc.lat = (window.__LAT ?? -45) * Math.PI / 180;
  oc.lon = (window.__LON ?? 88) * Math.PI / 180;
  oc.heading = 0; oc.tilt = 0;
  oc.dist = oc.distTarget = 1737.4 + alt;
  // 高度必须相对**当地地形高度**，不能相对平均半径：月球地形起伏 ±5km，
  // 按平均半径设高度会让相机掉进山里 → altGround 变负 → 触发自动登陆进行走
  // 模式 → 画面下方冒出 EVA 服的手套（蓝灰胶囊 + 橙色腕环），而且地形挖出一个
  // 黑洞（相机在地表以下）。这里每帧按当地高程重算。
  const R = 1737.4;
  window.__oc = oc;
  window.__altOf = (lat, lon) => {
    const d = new (g.camera.position.constructor)(
      Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
    // 线上是旧构建，可能没有 heightAt——取不到就退回平均半径（线上本来也没那么贴地）
    try { return g.terrainMgr.heightAt('moon', d); } catch (e) { return R; }
  };
  return { subLat: subLat * 180 / Math.PI, subLon: subLon * 180 / Math.PI,
    lat0: oc.lat * 180 / Math.PI, lon0: oc.lon, focusId: oc.focusId, mode: g.getMode() };
}, ALT);
console.log(`日下点 lat=${start.subLat.toFixed(2)}° lon=${start.subLon.toFixed(2)}°　起点 lat=${start.lat0.toFixed(2)}°　focus=${start.focusId}　mode=${start.mode}`);

// 让地形首建与自动倾斜稳定下来（SETTLE 毫秒，默认 8s）
await new Promise((r) => setTimeout(r, Number(process.env.SETTLE ?? 8000)));

const lat0 = start.lat0 * Math.PI / 180;
const t0 = Date.now();
let modes = new Set();
for (let i = 0; i < FRAMES; i++) {
  const mode = await p.evaluate((lat, lon, alt) => {
    const g = window.__game, oc = window.__oc;
    // 低空偶发自动登陆（进入行走模式，画面下方会冒出 EVA 服手套）：滚轮后退即无缝起飞
    if (g.getMode() !== 'orbit') { try { g.input.wheel += 1; } catch (e) { /* 旧构建无此字段 */ } }
    oc.focusId = 'moon'; oc.pendingFocusId = null; oc.flight = null;
    oc.lat = lat; oc.lon = lon;
    oc.heading = 0; oc.tilt = 0;                 // 排除航向/倾斜漂移
    // 高度锁在当地地形之上，排除缩放与"掉进山里"的干扰
    oc.dist = oc.distTarget = window.__altOf(lat, lon) + alt;
    return g.getMode();
  }, lat0 + i * DLAT, start.lon0, ALT);
  modes.add(mode);
  // 等两帧：确保本次设值已被主循环渲染出来
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `${outDir}/f${String(i).padStart(4, '0')}.png` });
  if (i % 10 === 0) {
    const st = await p.evaluate(() => ({ d: window.__oc.dist, a: window.__altOf(window.__oc.lat, window.__oc.lon),
      m: window.__game.getMode() }));
    console.log(`  ${i}/${FRAMES}  ${((Date.now() - t0) / 1000).toFixed(0)}s  dist=${st.d.toFixed(3)} 地形=${st.a.toFixed(3)} ${st.m}`);
  }
}
console.log(`帧数 ${FRAMES}  用时 ${((Date.now() - t0) / 1000).toFixed(0)}s  模式=${[...modes]}  →  ${outDir}`);
await b.close();
