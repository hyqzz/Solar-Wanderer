// R10 缺陷复现/验证脚本：Node 直驱引擎层。
// 修复前：各项 FAIL；修复后：全部 PASS。用法：node tools/repro-r10.mjs

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';
import { Ship } from '../src/engine/ship.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

const IDENTITY_Q = new THREE.Quaternion();
const R_E = 6371, R_SUN = 696000, AU = 1.496e8;
const mkInput = (over = {}) => ({
  dx: 0, dy: 0, wheel: 0, locked: true,
  drag: { active: false, dx: 0, dy: 0 },
  pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 },
  cursor: null,
  down: () => false, tapped: () => false,
  ...over,
});

console.log('\n[R10-1] V 惯性切换在"可登陆+自转"天体上必须无镜头跳跃（地球/火星/冥王星）');
{
  // 体固系非恒等四元数 + groundRadius（可登陆）——曾触发 _qf 被 groundRadiusOf 覆盖
  const bodyQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.2, 0.1));
  const env = {
    get() {
      return {
        posKm: new Float64Array(3), radiusKm: R_E, quat: bodyQ,
        landable: true, groundRadius: () => R_E + 2,
      };
    },
  };
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  cam.lat = 0.5; cam.lon = 1.0; cam.heading = 0.4; cam.tilt = 0.3;
  cam.update(0.016, mkInput(), env);
  const pos0 = Float64Array.from(cam.posKm);
  const q0 = cam.quat.clone();
  cam.setInertial(true, env);
  cam.compute(env);
  const posJump = Math.hypot(
    cam.posKm[0] - pos0[0], cam.posKm[1] - pos0[1], cam.posKm[2] - pos0[2]
  );
  const ang = 2 * Math.acos(Math.min(1, Math.abs(q0.dot(cam.quat)))) * 180 / Math.PI;
  check('位置连续（跳变 < 1 km）', posJump < 1, `跳变 = ${posJump.toFixed(1)} km`);
  check('视向连续（< 2°）', ang < 2,
    `偏差 = ${ang.toFixed(1)}°（旧实现 groundRadiusOf 覆盖 _qf → 姿态反解垃圾值）`);
}

console.log('\n[R10-2] 高度等比缩放：贴地一格缩出步长为米级（可定位任意高度）');
{
  const env = {
    get() {
      return {
        posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q,
        landable: true, groundRadius: () => R_E,
      };
    },
  };
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  cam.lat = 0.2; cam.lon = 0.3;
  cam.distTarget = cam.dist = R_E + 0.0017; // 贴地 1.7m
  cam.update(0.016, mkInput({ wheel: 1 }), env); // 一格缩出
  const altT = (cam.distTarget - R_E) * 1000; // m
  check('一格缩出后目标高度 < 10 m（旧实现按中心距等比 → +700 km）', altT < 10,
    `目标高度 = ${altT.toFixed(1)} m`);
  // 仍可远离：持续滚动渐加速最终可达深空
  for (let i = 0; i < 3000; i++) cam.update(0.033, mkInput({ wheel: 1 }), env);
  check('连续滚动仍可加速远离至 > 10 R', cam.dist > R_E * 10,
    `dist = ${(cam.dist / R_E).toFixed(1)} R`);
}

console.log('\n[R10-3] 滚轮不再隐式切换焦点（焦点只通过点击/搜索显式切换）');
{
  const bodies = {
    earth: { posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q },
    sun: { posKm: new Float64Array([AU, 0, 0]), radiusKm: R_SUN, quat: IDENTITY_Q, minDistKm: R_SUN * 1.02 },
  };
  const env = {
    get: (id) => bodies[id] ?? bodies.earth,
    centerHit(posKm, dir) {
      const ox = AU - posKm[0], oy = -posKm[1], oz = -posKm[2];
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      if (b <= 0) return null;
      const det = b * b - (ox * ox + oy * oy + oz * oz - (R_SUN * 1.02) ** 2);
      return det > 0 ? { id: 'sun', depth: b - Math.sqrt(det) } : null;
    },
  };
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 60);
  cam.update(0.016, mkInput(), env);
  cam.panOffset.set(0, R_E * 2, 0);
  const d0 = Math.hypot(cam.posKm[0] - AU, cam.posKm[1], cam.posKm[2]);
  const toSun = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (let i = 0; i < 300; i++) {
    // 太阳保持屏幕中心（推拉沿视线，居中性本身由 R8 断言保障）
    toSun.set(AU - cam.posKm[0], -cam.posKm[1], -cam.posKm[2]).normalize();
    m.lookAt(new THREE.Vector3(), toSun, new THREE.Vector3(0, 1, 0));
    cam.quat.setFromRotationMatrix(m);
    cam.update(0.032, mkInput({ wheel: i % 3 === 0 ? -1 : 0 }), env);
  }
  const d1 = Math.hypot(cam.posKm[0] - AU, cam.posKm[1], cam.posKm[2]);
  check('焦点保持 earth（无隐式交接）', cam.focusId === 'earth', `focusId = ${cam.focusId}`);
  check('仍严格沿屏幕中心接近太阳', d1 < d0 * 0.7, `剩余比例 = ${(d1 / d0).toFixed(2)}`);
}

console.log('\n[R10-4] 点击锁定焦点后滚轮可一路推进到地形下限（直达登陆深度）');
{
  // 模拟点击设焦点（adoptPosition）后：目标=焦点 → 推拉下限用地形高度
  const GROUND = R_E + 2;
  const bodies = {
    mars: {
      posKm: new Float64Array([0, 0, 0]), radiusKm: R_E, quat: IDENTITY_Q,
      landable: true, groundRadius: () => GROUND,
    },
  };
  const env = { get: () => bodies.mars };
  const cam = new OrbitCamera();
  cam.init(env, 'mars', 8);
  cam.lat = 0.2; cam.lon = 0.1;
  for (let i = 0; i < 4000; i++) cam.update(0.033, mkInput({ wheel: -1 }), env);
  const alt = (cam.dist - GROUND) * 1000;
  check('持续滚轮拉近收敛到地面 1.7m 视高（±0.5m）', Math.abs(alt - 1.7) < 0.5,
    `实际悬停 = 地面上方 ${alt.toFixed(2)} m`);
}

console.log('\n[R10-5] 水面默认站立；滚轮下=下潜至海床；水下滚轮上=上游；浮出自动恢复');
{
  const ship = new Ship();
  ship.mode = 'walk';
  const w = ship.walk;
  const SURF = R_E + 0.001, FLOOR = R_E - 2;
  w.bodyId = 'earth';
  w.localPos.set(SURF + 0.0017, 0, 0);
  w.yaw = 0; w.pitch = 0; w.grounded = true; w.diving = false;
  const wenv = {
    getBodyQuat: () => IDENTITY_Q,
    getBodyPos: () => new Float64Array(3),
    heightFn: () => SURF,
    heightSolidFn: () => FLOOR,
    isWater: () => true,
    phys: () => ({ gm: 3.986e5, radiusKm: R_E }),
  };
  // 站立水面：不下沉
  for (let i = 0; i < 60; i++) ship.updateWalk(0.016, mkInput(), wenv);
  check('默认站立水面（不下沉）', w.localPos.length() >= SURF + 0.001, `r-R = ${((w.localPos.length() - R_E) * 1000).toFixed(2)} m`);
  // 滚轮下 → 下潜（先 1.7m 入水自由落体，水阻尼停住）
  ship.updateWalk(0.016, mkInput({ wheel: -1 }), wenv);
  for (let i = 0; i < 300 && !(SURF - w.localPos.length() > 0.001 && Math.abs(w.vAlt) < 1e-5); i++) {
    ship.updateWalk(0.033, mkInput(), wenv);
  }
  const dEnter = SURF - w.localPos.length();
  check('滚轮下入水并悬停', w.diving && dEnter > 0.001, `入水深度 = ${(dEnter * 1000).toFixed(1)} m`);
  // 单格步长低灵敏度（米级）
  ship.updateWalk(0.016, mkInput({ wheel: -1 }), wenv);
  for (let i = 0; i < 120; i++) ship.updateWalk(0.033, mkInput(), wenv);
  const d1 = (SURF - w.localPos.length()) - dEnter;
  check('单格下潜步长为米级（低灵敏度精确定位）', d1 > 0 && d1 < 0.005,
    `单格步长 = ${(d1 * 1000).toFixed(2)} m`);
  // 连续滚动至 ~50m 深，停止滚动 → 中性浮力悬停（任意深度可驻留）
  for (let i = 0; i < 200 && SURF - w.localPos.length() < 0.05; i++) {
    ship.updateWalk(0.033, mkInput({ wheel: -1 }), wenv);
  }
  const dHold0 = SURF - w.localPos.length();
  for (let i = 0; i < 300; i++) ship.updateWalk(0.033, mkInput(), wenv); // 10s 无输入
  const drift = Math.abs((SURF - w.localPos.length()) - dHold0) * 1000;
  check('停止滚动后悬停于当前深度（10s 漂移 < 0.5 m）', drift < 0.5,
    `漂移 = ${drift.toFixed(2)} m @ 深度 ${(dHold0 * 1000).toFixed(0)} m`);
  // 水下滚轮上 → 上游并浮出恢复
  for (let i = 0; i < 4000 && w.diving; i++) ship.updateWalk(0.033, mkInput({ wheel: 1 }), wenv);
  check('持续滚轮上浮出水面并恢复站立', !w.diving, `diving=${w.diving}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败${fail ? '（失败项 = 缺陷复现证据）' : ''}`);
process.exit(fail ? 1 : 0);
