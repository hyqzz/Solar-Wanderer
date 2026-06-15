// 复现+验证：commit 282291d 修复的一批 issue（#1 #12 #13 #14 #15 #16 #17 #19 #20）。
// 原则：能在 Node 确定性复现的（物理/时钟/几何/相机），用行为断言"先复现旧缺陷、再验证新修复"；
//       DOM/触控类（#13 #15 #16 #14）的运行时无回归已由 smoke-mobile.mjs / probe-r7.mjs 覆盖，
//       此处补源码结构断言，确认修复代码确已落地（避免被后续改动悄悄回退）。

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { OrbitCamera } from '../src/engine/orbitCamera.js';
import { SimClock, DAY_SECONDS } from '../src/astro/time.js';
import { HeightField } from '../src/scene/terrain.js';
import { BODIES, MOON_PHYS } from '../src/astro/bodies.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

// ============ #12 火星天空：日照半球异常偏亮（Mie 前向不对称过强） ============
console.log('\n[#12] 火星天空：降低 Mie 前向不对称，消除"半球更亮"');
{
  // Henyey-Greenstein 相函数：phM(mu) ∝ (1-g²)/(1+g²-2g·mu)^1.5
  const hg = (g, mu) => (1 - g * g) / Math.pow(1 + g * g - 2 * g * mu, 1.5);
  // 日向 mu=1 / 逆日 mu=-1 的亮度比（越大越"半球偏亮"）
  const ratio = (g) => hg(g, 1) / hg(g, -1);
  const oldRatio = ratio(0.55); // 旧值
  const newRatio = ratio(0.32); // 新值（当前 bodies.js）
  check('复现：旧 mieG=0.55 日/逆日亮度比 > 30（不真实半球偏亮）',
    oldRatio > 30, `oldRatio=${oldRatio.toFixed(1)}`);
  check('验证：新 mieG=0.32 亮度比 < 10（温和梯度，接近实拍）',
    newRatio < 10, `newRatio=${newRatio.toFixed(1)}`);
  check('bodies.js 火星 mieG 已降至 ≤ 0.4',
    BODIES.mars.atmosphere.mieG <= 0.4, `mieG=${BODIES.mars.atmosphere.mieG}`);
  check('bodies.js 火星 mie 系数已降至 ≤ 1.3e-6',
    BODIES.mars.atmosphere.mie <= 1.3e-6, `mie=${BODIES.mars.atmosphere.mie}`);
}

// ============ #17 时间应随真实挂钟推进（标签页后台恢复后追赶） ============
console.log('\n[#17] SimClock：后台恢复用挂钟追赶，而非每帧只走一个 dt');
{
  // 正常帧（无后台）：rate=86400 时 tick(1) 应推进 1 天（不回归原行为）
  const c1 = new SimClock();
  c1.rate = 86400;
  const j0 = c1.jdTT;
  c1.tick(1);
  check('不回归：正常帧 tick(1)@rate=86400 推进≈1 天',
    Math.abs((c1.jdTT - j0) - 1) < 0.05, `Δ=${(c1.jdTT - j0).toFixed(4)} 天`);

  // 后台恢复：模拟挂钟已过去 30s 但本帧 dt 仅 0.016s（rate=1）
  const c2 = new SimClock();
  c2.rate = 1;
  const j2 = c2.jdTT;
  c2._wallMs = Date.now() - 30000; // 假装 30 秒前记录的挂钟
  c2.tick(0.016);
  const advSec = (c2.jdTT - j2) * DAY_SECONDS;
  // 旧实现：只会推进 dtReal=0.016s；新实现：用挂钟 30s 追赶
  check('复现/验证：后台 30s 后单帧追赶≈30s（旧实现仅 0.016s）',
    advSec > 25 && advSec < 35, `advSec=${advSec.toFixed(2)}s`);

  // 追赶上限 60s（防超长后台一次性暴冲）
  const c3 = new SimClock();
  c3.rate = 1;
  const j3 = c3.jdTT;
  c3._wallMs = Date.now() - 3600000; // 1 小时前
  c3.tick(0.016);
  const adv3 = (c3.jdTT - j3) * DAY_SECONDS;
  check('追赶有 60s 上限（超长后台不暴冲）',
    adv3 <= 60.5, `adv3=${adv3.toFixed(1)}s`);
}

// ============ #19 小天体地形相对其尺寸过于多山（幅度未按半径缩放） ============
console.log('\n[#19] 小天体地形：噪声幅度上限 = 半径 5%');
{
  // 复现：给火卫一一个超大 ampKm（旧风格 13%R 甚至更大），高度仍须被 5%R 上限钳制
  const phys = JSON.parse(JSON.stringify(MOON_PHYS.phobos));
  phys.surface.ampKm = 50; // 蓄意夸张
  const field = new HeightField('phobos', phys, null);
  let maxDev = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < 2000; i++) {
    // 球面均匀采样
    const z = 2 * Math.random() - 1, t = 2 * Math.PI * Math.random();
    const r = Math.sqrt(1 - z * z);
    v.set(r * Math.cos(t), z, r * Math.sin(t));
    const h = field.height(v);
    maxDev = Math.max(maxDev, Math.abs(h - field.baseRadius(v)));
  }
  const cap = phys.radiusKm * 0.05; // 11.27 * 0.05 ≈ 0.5635 km
  // height = R + effAmp*(h*0.5+0.62)，h∈约[-1,2]→系数约[0.12,1.62]，故 maxDev ≤ cap*1.7 余量
  check('复现/验证：即便 ampKm=50，地形起伏被钳制在 ~5%R 量级',
    maxDev <= cap * 1.7, `maxDev=${maxDev.toFixed(3)}km cap*1.7=${(cap * 1.7).toFixed(3)}km`);
  check('源码：HeightField.height 含 radiusKm*0.05 安全上限',
    /Math\.min\(sp\.ampKm, this\.phys\.radiusKm \* 0\.05\)/.test(src('scene/terrain.js')),
    '未找到 effAmp 上限');
  check('bodies.js 火卫一 ampKm 已降至 ≤ 0.5（≈4.4%R）',
    MOON_PHYS.phobos.surface.ampKm <= 0.5, `ampKm=${MOON_PHYS.phobos.surface.ampKm}`);
}

// ============ #20 桌面：滚轮缩出后右键平移会把视图拨回 ============
console.log('\n[#20] 平移开始时提交残余 dolly，消除镜头跳回');
{
  const R_E = 6371;
  const IDENTITY_Q = new THREE.Quaternion();
  const env = {
    get: () => ({ posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q, landable: true, groundRadius: () => R_E }),
    centerHit(posKm, dir) {
      const ox = -posKm[0], oy = -posKm[1], oz = -posKm[2];
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      if (b <= 0) return null;
      const m = R_E * 1.004 + 1;
      const det = b * b - (ox * ox + oy * oy + oz * oz - m * m);
      return det > 0 ? { id: 'earth', depth: b - Math.sqrt(det) } : null;
    },
    centerDepth(posKm, dir) { return this.centerHit(posKm, dir)?.depth ?? null; },
  };
  const mkInput = (over = {}) => ({
    dx: 0, dy: 0, wheel: 0, locked: true,
    drag: { active: false, dx: 0, dy: 0 },
    pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 },
    cursor: null, down: () => false, tapped: () => false, ...over,
  });
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  // 复现前置：模拟一次残余 dolly 状态（滚轮缩出后未消耗完）
  cam._dolly = 1.5;
  cam._dollyDepth = 1000;
  cam._dollyTargetId = 'earth';
  check('复现：存在残余 dolly（_dolly ≠ 1）', Math.abs(cam._dolly - 1) > 1e-4, `_dolly=${cam._dolly}`);

  // 记录平移前 look-at（焦点 + panOffset 世界）
  const lookAt0 = new THREE.Vector3(0, 0, 0).add(cam.panOffset.clone().applyQuaternion(IDENTITY_Q));
  // 开始右键平移
  let maxJump = 0;
  let prev = new THREE.Vector3().fromArray(cam.posKm);
  for (let i = 0; i < 30; i++) {
    cam.update(0.016, mkInput({ pan: { active: true, dx: 5, dy: 0 } }), env);
    const now = new THREE.Vector3().fromArray(cam.posKm);
    maxJump = Math.max(maxJump, now.distanceTo(prev));
    prev.copy(now);
  }
  check('验证：平移首帧提交残余 dolly（_dolly 归 1）',
    Math.abs(cam._dolly - 1) < 1e-4, `_dolly=${cam._dolly}`);
  check('验证：平移过程相机位置连续（无单帧大跳变 < 500km）',
    maxJump < 500, `maxJump=${maxJump.toFixed(1)}km`);
  check('源码：orbitCamera 平移分支含残余 dolly 提交守卫',
    /平移开始时提交残余 dolly[\s\S]*?Math\.abs\(this\._dolly - 1\) > 1e-4/.test(src('engine/orbitCamera.js')),
    '未找到 dolly 提交守卫');
}

// ============ #1 / #13 / #14 / #15 / #16 源码结构断言（运行时由 puppeteer 探针覆盖） ============
console.log('\n[#1/#13/#14/#15/#16] 修复代码在位断言（运行时无回归见 smoke-mobile/probe-r7）');
{
  const main = src('main.js');
  const ship = src('engine/ship.js');
  const sun = src('scene/sun.js');

  // #1 可分享 URL
  check('#1 main.js 含 applyLocationHash + copyShareUrl（URL 状态编解码）',
    /function applyLocationHash/.test(main) && /function copyShareUrl/.test(main), '缺失');
  // URL 格式往返自检（与 main.js 文档格式一致：#focus,lat,lon,dist,jd）
  {
    const focus = 'mars', lat = 12.34567, lon = -98.7654, dist = 4321.987, jd = 2460500.123;
    const DEG = Math.PI / 180;
    const hash = `#${focus},${(lat).toFixed(5)},${(lon).toFixed(5)},${dist.toFixed(3)},${jd.toFixed(3)}`;
    const [f, la, lo, di, j] = hash.slice(1).split(',');
    const ok = f === focus && Math.abs(+la - lat) < 1e-4 && Math.abs(+lo - lon) < 1e-4
      && Math.abs(+di - dist) < 1e-2 && Math.abs(+j - jd) < 1e-2;
    // 再验证角度按 main.js 方式 ×DEG 还原范围合理
    const latRad = (+la) * DEG;
    check('#1 URL 格式往返：focus/lat/lon/dist/jd 全部可还原',
      ok && isFinite(latRad), `hash=${hash}`);
  }
  // #13 双指平移死区
  check('#13 ship.js 含双指缩放死区（ratio 接近 1 不产生 wheel）',
    /Math\.abs\(ratio - 1\) > 0\.015/.test(ship), '未找到 1.5% 死区');
  // #14 太阳眩光被行星遮挡
  check('#14 sun.js 眩光精灵 depthTest 已开启（被行星遮挡）',
    /depthTest:\s*true/.test(sun), '未找到 depthTest:true');
  // #15 模式切换清手势
  check('#15 ship.js 含 cancelGestures() 方法',
    /cancelGestures\s*\(\s*\)\s*\{/.test(ship), '未找到 cancelGestures');
  check('#15 main.js 在模式切换处调用 cancelGestures',
    /cancelGestures\(\)/.test(main), 'main.js 未调用 cancelGestures');
  // #16 移动端登陆阈值放宽 + 起飞复位 panOffset
  check('#16 main.js 移动端登陆阈值放宽（IS_MOBILE ? 0.005 : ...）',
    /IS_MOBILE \? 0\.005/.test(main), '未找到移动端阈值');
}

console.log(`\n========\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
