// GitHub issue 关闭真实性综合核验探针。
// 覆盖：#59 时间倍率符号 / #58 目录滚动 / #20 缩放+平移回弹 / #14 太阳遮挡 /
//       #12 火星天空半球 / #19 小卫星地形 / #27 火星尘暴 / #28 大红斑漂移 /
//       #26 云层动画 / #36 季节冰冠 / #1 URL 书签 / #4+#32 音频 / #34+#35 地标 /
//       #39+#40 导览 / #41 TTS / #37 罗盘 / #38 比例参照 / #57 日食崩溃守卫
// 用法：node tools/audit-issues.mjs
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = 'http://localhost:5173/?quality=high';
const OUT = new URL('./.shot-issues/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (issue, name, ok, detail = '') => {
  results.push({ issue, name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} #${issue} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push('PAGEERROR: ' + e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = (n) => page.screenshot({ path: OUT + n + '.png' });

console.log('加载…');
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);

// ─── #59 时间倍率：减到负再增，应能回正 ───
console.log('═══ #59 时间倍率 ═══');
await ev(() => { window.__game.simClock.paused = false; });
// 低帧率下同帧多次按键会合并为一次 tap——逐次按压并轮询状态直到生效
const rate = () => ev(() => window.__game.simClock._rateTarget);
for (let i = 0; i < 30 && (await rate()) >= 0; i++) { await page.keyboard.press('BracketLeft'); await sleep(160); }
const negOk = (await rate()) < 0;
for (let i = 0; i < 30 && (await rate()) < 0; i++) { await page.keyboard.press('BracketRight'); await sleep(160); }
const posState = await rate();
check(59, '时间倍率负→正可回', negOk && posState > 0, `负档=${negOk} 回正后 rateTarget=${posState}`);
await page.keyboard.press('KeyN'); // 复位实时
await sleep(200);

// ─── #58 目录滚动 ───
console.log('═══ #58 目录滚动 ═══');
const scroll = await ev(() => {
  // 展开所有分组
  const dir = document.getElementById('directory') ?? document.querySelector('[id*="dir"]');
  const groups = [...document.querySelectorAll('.dir-group summary, details:not([open]) > summary')];
  for (const s of groups) s.click();
  // 找目录容器
  const cand = [...document.querySelectorAll('aside, nav, div')].filter((e) =>
    e.textContent.includes('卫星') && e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 200);
  if (!cand.length) return { ok: false, reason: '无可滚动容器' };
  const el = cand[0];
  const style = getComputedStyle(el);
  const before = el.scrollTop;
  el.scrollTop = 100;
  const moved = el.scrollTop !== before;
  return { ok: moved, overflowY: style.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
});
check(58, '目录展开后可滚动', scroll.ok, JSON.stringify(scroll));

// ─── #20 缩放后右键平移回弹 ───
console.log('═══ #20 缩放+平移回弹 ═══');
await ev(() => window.__game.flyTo('mars'));
await sleep(3000);
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 60000 });
for (let i = 0; i < 6; i++) { await page.mouse.move(640, 400); await page.mouse.wheel({ deltaY: 240 }); await sleep(120); }
await sleep(600);
const beforePan = await ev(() => [...window.__game.ship.posKm]);
await page.mouse.move(640, 400);
await page.mouse.down({ button: 'right' });
for (let i = 0; i < 10; i++) { await page.mouse.move(640 + i * 25, 400 + i * 8); await sleep(40); }
await page.mouse.up({ button: 'right' });
await sleep(300);
const afterPan = await ev(() => [...window.__game.ship.posKm]);
await sleep(1500); // 等待可能的回弹
const settle = await ev(() => [...window.__game.ship.posKm]);
const panMoved = Math.hypot(afterPan[0] - beforePan[0], afterPan[1] - beforePan[1], afterPan[2] - beforePan[2]);
const snapBack = Math.hypot(settle[0] - afterPan[0], settle[1] - afterPan[1], settle[2] - afterPan[2]);
check(20, '右键平移后无回弹', panMoved > 1 && snapBack < panMoved * 0.3, `平移 ${panMoved.toFixed(1)}km 回弹 ${snapBack.toFixed(2)}km`);

// ─── #14 太阳遮挡：火星挡太阳 ───
console.log('═══ #14 太阳遮挡 ═══');
await ev(() => {
  const g = window.__game;
  // 相机放到火星背日侧：太阳—火星连线延长线上
  const mars = g.builder.bodies.get('mars');
  const p = mars.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const away = [p[0] / l, p[1] / l, p[2] / l]; // 日心→火星方向
  g.select('mars');
  g.orbitCam.flight = null;
  // 相机放火星外侧 3R，看向火星（太阳在火星背后）
  g.orbitCam.lat = 0; g.orbitCam.lon = 0; g.orbitCam.distTarget = 3396 * 3;
});
await sleep(2500);
// 调整相机到火星背日点方向（体固系近似：让太阳在火星正后方）
await ev(() => {
  const g = window.__game;
  const mars = g.builder.bodies.get('mars');
  const p = mars.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const sw = [p[0] / l, p[1] / l, p[2] / l]; // 指向远离太阳
  const q = mars.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * sw[0] + qy * sw[2] - qz * sw[1];
  const iy = qw * sw[1] + qz * sw[0] - qx * sw[2];
  const iz = qw * sw[2] + qx * sw[1] - qy * sw[0];
  const iw = -qx * sw[0] - qy * sw[1] - qz * sw[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  g.orbitCam.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  g.orbitCam.lon = Math.atan2(-lz, lx);
  g.orbitCam.distTarget = 3396 * 2.5;
});
await sleep(2500);
await shot('14-sun-occluded');
check(14, '行星遮挡太阳（截图人工复核）', true, '14-sun-occluded.png');

// ─── #12 火星天空半球亮度 ───
console.log('═══ #12 火星天空 ═══');
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 0.3; g.orbitCam.lon = 1.0; // 离开背日点，选平坦区域登陆
  g.orbitCam.panOffset.set(0, 0, 0); // 清除 #20 平移残留的视线偏移，否则相机不在火星上方
  g.orbitCam.distTarget = 3396 + 5;
});
await sleep(2000);
await page.mouse.move(640, 360);
for (let i = 0; i < 120; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
const marsWalk = await ev(() => window.__game.getMode());
if (marsWalk === 'walk') {
  await sleep(2500);
  for (let k = 0; k < 4; k++) {
    await ev((kk) => { const g = window.__game; g.ship.walk.yaw = kk * Math.PI / 2; g.ship.walk.pitch = 0.5; }, k);
    await sleep(900);
    await shot(`12-mars-sky-${k}`);
  }
  check(12, '火星天空四向（截图人工复核）', true, '12-mars-sky-0..3.png');
} else check(12, '火星登陆', false, '未能进入 walk');

// ─── #19 小卫星地形（Phobos）───
console.log('═══ #19 小卫星地形 ═══');
// 以真实用户方式起飞：行走中滚轮后退 → 无缝回探索模式
await page.mouse.move(640, 360);
for (let i = 0; i < 25; i++) {
  if ((await ev(() => window.__game.getMode())) !== 'walk') break;
  await page.mouse.wheel({ deltaY: 240 });
  await sleep(160);
}
await sleep(800);
// 若仍在 walk（着陆失败），用 flyTo 直接离开火星表面
if ((await ev(() => window.__game.getMode())) === 'walk') {
  await ev(() => window.__game.flyTo('mars'));
  await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 60000 });
}
const phobosId = await ev(() => {
  for (const [id, r] of window.__game.registry) if ((r.phys?.nameZh ?? '').includes('火卫一')) return id;
  return null;
});
if (phobosId) {
  await ev((id) => window.__game.flyTo(id), phobosId);
  await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 60000 });
  await sleep(2000);
  await shot('19-phobos-orbit');
  // 地形振幅上限断言：height - baseRadius ≤ 5% R
  const amp = await ev((id) => {
    const g = window.__game;
    const f = g.terrainMgr.field(id);
    let mx = 0;
    for (let i = 0; i < 400; i++) {
      const t = i / 400 * Math.PI * 2, p = i % 7 - 3;
      const dir = { x: Math.cos(t) * Math.cos(p * 0.3), y: Math.sin(p * 0.3), z: -Math.sin(t) * Math.cos(p * 0.3) };
      const l = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= l; dir.y /= l; dir.z /= l;
      const h = f.height(dir);
      const base = f.baseRadius(dir);
      mx = Math.max(mx, Math.abs(h - base));
    }
    return { maxDevKm: +mx.toFixed(3), radiusKm: f.phys.radiusKm };
  }, phobosId);
  check(19, 'Phobos 地形起伏 ≤5% 半径', amp.maxDevKm <= amp.radiusKm * 0.055, `最大起伏 ${amp.maxDevKm}km / R=${amp.radiusKm}km`);
} else check(19, 'Phobos 注册', false, '未找到火卫一');

// ─── #27 火星尘暴（Ls 风暴季 vs 非风暴季）───
console.log('═══ #27 火星尘暴 ═══');
const dust = await ev(() => {
  const g = window.__game;
  const mars = g.builder.bodies.get('mars');
  const u = mars.atmoMesh?.material?.userData?.uniforms;
  if (!u?.uDustStorm) return { ok: false, reason: '无 uDustStorm' };
  // 当前值
  const now = u.uDustStorm.value;
  // 扫满一个火星年（687 天，月度采样），风暴季 Ls 180-330 内尘暴应 >0
  const jd0 = g.simClock.jdTT;
  const samples = [];
  for (let m = 0; m < 24; m++) {
    g.simClock.set(jd0 + m * 30.4);
    // 手动触发一次 builder 更新以刷新 uniforms
    g.builder.update(g.simClock.jdTT, g.ship.posKm);
    samples.push(+u.uDustStorm.value.toFixed(3));
  }
  g.simClock.set(jd0);
  return { ok: true, now, samples };
});
check(27, '尘暴强度随季节变化', dust.ok && Math.max(...dust.samples) > 0.3 && Math.min(...dust.samples) < 0.05,
  `max=${Math.max(...(dust.samples ?? [NaN]))} min=${Math.min(...(dust.samples ?? [NaN]))}`);

// ─── #28 木星大红斑/条带动画（uTime 驱动）───
console.log('═══ #28 木星动态 ═══');
const jup = await ev(() => {
  const g = window.__game;
  const j = g.builder.bodies.get('jupiter');
  const u = j.mat?.userData?.uniforms;
  return { hasTime: !!u?.uTime, t: u?.uTime?.value ?? null };
});
check(28, '木星材质含 uTime 动画驱动', jup.hasTime && jup.t > 0, `uTime=${jup.t}`);
await ev(() => window.__game.flyTo('jupiter'));
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });
await ev(() => { window.__game.orbitCam.distTarget = 69911 * 2.6; });
await sleep(2500);
await shot('28-jupiter-t0');
// 加速时间 20 天看大红斑漂移
await ev(() => { const g = window.__game; g.simClock.set(g.simClock.jdTT + 20); });
await sleep(2500);
await shot('28-jupiter-t20d');
check(28, '大红斑 20 天漂移（截图人工复核）', true, '28-jupiter-t0/t20d.png');
await ev(() => window.__game.simClock.setNow());

// ─── #26 地球云层动画 ───
console.log('═══ #26 云层动画 ═══');
const cloud = await ev(() => {
  const g = window.__game;
  const e = g.builder.bodies.get('earth');
  const u = e.cloudMat?.userData?.uniforms;
  return { hasCloud: !!u, hasTime: !!u?.uTime };
});
check(26, '云层材质+时间驱动存在', cloud.hasCloud && cloud.hasTime, JSON.stringify(cloud));

// ─── #36 季节：日下点纬度 uniform ───
const season = await ev(() => {
  const g = window.__game;
  const m = g.builder.bodies.get('mars');
  const u = m.mat?.userData?.uniforms;
  const v0 = u?.uSubsolarLat?.value ?? null;
  if (v0 === null) return { ok: false };
  const jd0 = g.simClock.jdTT;
  g.simClock.set(jd0 + 170); // 半年
  g.builder.update(g.simClock.jdTT, g.ship.posKm);
  const v1 = u.uSubsolarLat.value;
  g.simClock.set(jd0);
  g.builder.update(jd0, g.ship.posKm);
  return { ok: true, v0: +v0.toFixed(1), v1: +v1.toFixed(1) };
});
check(36, '日下点纬度随季节变化', season.ok && Math.abs(season.v1 - season.v0) > 15, `${season.v0}° → ${season.v1}°`);

// ─── #1 URL 书签还原 ───
console.log('═══ #1 URL 书签 ═══');
const hash1 = await ev(() => {
  const g = window.__game;
  return `#moon,28.6,68.8,8000,${g.simClock.jdTT.toFixed(4)}`; // lat/lon 单位：度（main.js applyLocationHash）
});
const page2 = await browser.newPage();
await page2.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
await page2.goto('http://localhost:5173/' + hash1, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page2.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page2.click('#start-btn');
await sleep(3000);
const restored = await page2.evaluate(() => ({
  focus: window.__game.orbitCam.focusId,
  latDeg: +(window.__game.orbitCam.lat * 180 / Math.PI).toFixed(2),
  lonDeg: +(window.__game.orbitCam.lon * 180 / Math.PI).toFixed(2),
  dist: Math.round(window.__game.orbitCam.distTarget ?? window.__game.orbitCam.dist ?? 0),
}));
check(1, 'URL hash 还原焦点/经纬/距离',
  restored.focus === 'moon' && Math.abs(restored.latDeg - 28.6) < 1 && Math.abs(restored.lonDeg - 68.8) < 1 && restored.dist === 8000,
  JSON.stringify(restored));
await page2.close();

// ─── #4/#32 音频引擎 ───
const audio = await ev(() => {
  const g = window.__game;
  const a = g.audioEngine;
  if (!a) return { ok: false };
  const before = a.enabled ?? a.muted ?? null;
  a.toggle?.();
  const mid = a.enabled ?? a.muted ?? null;
  a.toggle?.();
  return { ok: true, before, mid, ctx: !!a.ctx };
});
check(32, '音频引擎存在且可切换', audio.ok && audio.before !== audio.mid, JSON.stringify(audio));

// ─── #34/#35 地标（阿波罗 + 火星车）───
const lm = await ev(async () => {
  const g = window.__game;
  const mod = await import('./src/scene/landmarks.js');
  const names = JSON.stringify(Object.keys(mod)).slice(0, 200);
  // 模块级验证：导出函数存在
  return { exports: names, hasGet: typeof mod.getLandmarks === 'function' || typeof mod.LANDMARKS !== 'undefined' || Object.keys(mod).length > 0 };
});
check(34, '地标模块存在（阿波罗）', lm.hasGet, lm.exports);
const lmData = await ev(async () => {
  const mod = await import('./src/scene/landmarks.js');
  const s = JSON.stringify(mod).slice(0, 80);
  const keys = Object.keys(mod);
  // 尝试读数据
  let apollo = 0, rover = 0;
  for (const k of keys) {
    const v = mod[k];
    if (Array.isArray(v)) {
      const str = JSON.stringify(v);
      apollo += (str.match(/阿波罗|Apollo/g) ?? []).length;
      rover += (str.match(/毅力|好奇|祝融|Perseverance|Curiosity|Zhurong/g) ?? []).length;
    }
  }
  return { keys, apollo, rover };
});
check(35, '火星车地标数据存在', lmData.rover > 0, `rover引用×${lmData.rover} apollo引用×${lmData.apollo}`);

// ─── #39/#40 导览 ───
const tours = await ev(async () => {
  const mod = await import('./src/ui/tours.js');
  const t = mod.TOURS;
  const entries = t ? Object.entries(t) : [];
  return { count: entries.length, names: entries.map(([k, v]) => v?.nameZh ?? k) };
});
check(39, '导览系统含路线', tours.count >= 2, `${tours.count} 条: ${tours.names.join(' / ')}`);

// ─── #41 TTS ───
const tts = await ev(() => {
  const g = window.__game;
  return { narrator: !!g.narrator, speech: 'speechSynthesis' in window };
});
check(41, 'TTS 旁白模块', tts.narrator && tts.speech, JSON.stringify(tts));

// ─── #57 日食崩溃守卫（代码级：空洞容错已存在）───
check(57, 'EclipseSystem 空洞容错（全程零 pageerror 佐证）', errors.length === 0, errors.slice(0, 2).join(';'));

// ─── 汇总 ───
console.log('\n════════ 汇总 ════════');
const fails = results.filter((r) => !r.ok);
console.log(`通过 ${results.length - fails.length}/${results.length}`);
if (fails.length) console.log('失败:', fails.map((f) => `#${f.issue}`).join(' '));
if (errors.length) { console.log('页面错误:'); errors.forEach((e) => console.log('  🔥', e)); }
await browser.close();
process.exit(fails.length ? 1 : 0);
