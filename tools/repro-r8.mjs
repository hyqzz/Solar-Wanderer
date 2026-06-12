// R8 #2 缺陷复现/验证：探索模式缩放必须以"屏幕中心"为基准接近/远离。
// 场景：倾斜（tilt≠0，模式切换接管后常见）或右键平移（panOffset≠0，例如把太阳拨到屏幕中心）
// 时滚轮缩放 —— 屏幕中心的目标必须在缩放全程保持居中（无跳跃/漂移）。
// 修复前：缩放向"轨道锚点"收敛而非视线方向 → 居中目标甩出屏幕中心。
// 用法：node tools/repro-r8.mjs

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

const IDENTITY_Q = new THREE.Quaternion();
const R = 6371;
const env = {
  get() {
    return { posKm: new Float64Array(3), radiusKm: R, quat: IDENTITY_Q };
  },
};
const mkInput = (over = {}) => ({
  dx: 0, dy: 0, wheel: 0, locked: false,
  drag: { active: false, dx: 0, dy: 0 },
  pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 },
  cursor: null,
  down: () => false, tapped: () => false,
  ...over,
});

/** 屏幕中心视线方向（世界系） */
const viewDir = (cam) => new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quat);
/** 标记点偏离屏幕中心的角度（rad） */
const offCenter = (cam, mark) => {
  const to = new THREE.Vector3(
    mark.x - cam.posKm[0], mark.y - cam.posKm[1], mark.z - cam.posKm[2]
  ).normalize();
  return to.angleTo(viewDir(cam));
};

console.log('\n[R8-A] 倾斜视角下滚轮缩放：屏幕中心目标全程保持居中');
{
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 6);
  cam.lat = 0.3; cam.lon = 0.4; cam.tilt = 0.7; // 用户倾斜（如起飞接管后）
  cam.update(0.016, mkInput(), env);
  // 标记点：当前视线方向上距相机 6R 处的固定空间点（模拟"屏幕中心的太阳"，
  // 深于缩放收敛深度 → 全程在前方，居中性可严格判定）
  const V = viewDir(cam);
  const mark = new THREE.Vector3(
    cam.posKm[0] + V.x * 6 * R, cam.posKm[1] + V.y * 6 * R, cam.posKm[2] + V.z * 6 * R
  );
  check('初始居中', offCenter(cam, mark) < 1e-6, '');
  let maxOff = 0;
  for (let i = 0; i < 180; i++) {
    cam.update(0.016, mkInput({ wheel: i % 6 === 0 && i < 120 ? -1 : 0 }), env);
    maxOff = Math.max(maxOff, offCenter(cam, mark));
  }
  check('缩放全程偏离 < 0.03 rad（无跳跃）', maxOff < 0.03,
    `实际最大偏离 = ${maxOff.toFixed(4)} rad = ${(maxOff * 180 / Math.PI).toFixed(1)}°`);
  check('确实发生了接近（相机向标记点移动）',
    Math.hypot(mark.x - cam.posKm[0], mark.y - cam.posKm[1], mark.z - cam.posKm[2]) < 6 * R * 0.6,
    `剩余距离比例 = ${(Math.hypot(mark.x - cam.posKm[0], mark.y - cam.posKm[1], mark.z - cam.posKm[2]) / (6 * R)).toFixed(2)}`);
}

console.log('\n[R8-B] 右键平移把目标拨到屏幕中心后滚轮缩放：目标全程居中');
{
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 8);
  cam.lat = 0.1; cam.lon = -0.5; cam.tilt = 0; cam.heading = 0;
  cam.panOffset.set(R * 1.5, R * 0.8, -R * 0.6); // 已平移（轨道锚点偏离天体中心）
  cam.update(0.016, mkInput(), env);
  const V = viewDir(cam);
  const mark = new THREE.Vector3(
    cam.posKm[0] + V.x * 12 * R, cam.posKm[1] + V.y * 12 * R, cam.posKm[2] + V.z * 12 * R
  );
  let maxOff = 0;
  for (let i = 0; i < 180; i++) {
    cam.update(0.016, mkInput({ wheel: i % 6 === 0 && i < 120 ? -1 : 0 }), env);
    maxOff = Math.max(maxOff, offCenter(cam, mark));
  }
  check('缩放全程偏离 < 0.03 rad', maxOff < 0.03,
    `实际最大偏离 = ${maxOff.toFixed(4)} rad = ${(maxOff * 180 / Math.PI).toFixed(1)}°`);
}

console.log('\n[R8-C] 常规情形（无倾斜无平移）：滚轮 = 屏幕中心缩放（行为不回归）');
{
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 6);
  cam.lat = 0.3; cam.lon = 0.4; cam.tilt = 0; cam.heading = 0;
  cam.update(0.016, mkInput(), env);
  const d0 = cam.dist;
  for (let i = 0; i < 120; i++) {
    cam.update(0.016, mkInput({ wheel: i % 6 === 0 && i < 60 ? -1 : 0 }), env);
  }
  check('径向缩放收敛（dist 减小且 lat/lon 不变）',
    cam.dist < d0 * 0.5 && Math.abs(cam.lat - 0.3) < 1e-9 && Math.abs(cam.lon - 0.4) < 1e-9,
    `dist ${d0.toFixed(0)}→${cam.dist.toFixed(0)}, lat=${cam.lat}, lon=${cam.lon}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败${fail ? '（失败项 = 缺陷复现证据）' : ''}`);
process.exit(fail ? 1 : 0);
