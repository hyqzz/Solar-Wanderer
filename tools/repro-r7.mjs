// R7 缺陷复现/验证脚本：Node 直接驱动 OrbitCamera 与 Ship（无浏览器）。
// 修复前运行：各项 FAIL（= 缺陷复现证据）；修复后运行：全部 PASS。
// 用法：node tools/repro-r7.mjs

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';
import { Ship } from '../src/engine/ship.js';

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

const IDENTITY_Q = new THREE.Quaternion();
const R_EARTH = 6371;
// 模拟环境：地球在原点，地形高度 = R + 2 km（固定台地，便于断言）
const GROUND_H = R_EARTH + 2;
const EYE = 0.0017;
const env = {
  get(id) {
    return {
      posKm: new Float64Array(3), radiusKm: R_EARTH, quat: IDENTITY_Q,
      landable: true,
      groundRadius: (dirLocal) => GROUND_H,
    };
  },
};

// 输入桩
const mkInput = (over = {}) => ({
  dx: 0, dy: 0, wheel: 0, locked: true,
  drag: { active: false, dx: 0, dy: 0 },
  pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 },
  cursor: null,
  down: () => false, tapped: () => false,
  ...over,
});

console.log('\n[#1a] 探索模式最小距离应贴合地形（地面 + 视高 1.7m），而非地表上方 25.5 km');
{
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  cam.lat = 0.3; cam.lon = 0.5;
  // 滚轮持续拉近到底
  for (let i = 0; i < 400; i++) cam.update(0.016, mkInput({ wheel: 1 * 0 }), env); // 稳定
  cam.distTarget = 1; // 强制压到下限
  for (let i = 0; i < 600; i++) cam.update(0.05, mkInput(), env);
  const alt = cam.dist - GROUND_H;
  check('滚轮可降至地面 1.7m 视高（±0.5m）', Math.abs(alt - EYE) < 0.0005,
    `实际悬停高度 = 地面上方 ${(alt * 1000).toFixed(1)} m（旧公式 R×1.004+1 → ${((R_EARTH * 1.004 + 1 - GROUND_H) * 1000).toFixed(0)} m）`);
}

console.log('\n[#1b] 进入行走模式必须保留当前视向俯仰（不得强制 pitch=0）');
{
  const ship = new Ship();
  ship.posKm[0] = GROUND_H + 5; // 地面上空 5km，x 轴方向 → 天顶 u=(1,0,0)，北=(0,1,0)
  // 显式构造视向：yaw=0（朝北）、pitch=-0.7（下俯）
  const p0 = -0.7;
  const view = new THREE.Vector3(Math.sin(p0), Math.cos(p0), 0);          // u*sin(p)+north*cos(p)
  const camUp = new THREE.Vector3(Math.cos(p0), -Math.sin(p0), 0);        // u*cos(p)-north*sin(p)
  const lm = new THREE.Matrix4().lookAt(new THREE.Vector3(), view, camUp);
  ship.quat.setFromRotationMatrix(lm);
  const wenv = {
    nearest: { id: 'earth', posKm: new Float64Array(3), radiusKm: R_EARTH, landable: true, distSurface: 5 },
    getBodyQuat: () => IDENTITY_Q,
    getBodyPos: () => new Float64Array(3),
    heightFn: () => GROUND_H,
    phys: () => ({ gm: 3.986e5, radiusKm: R_EARTH }),
  };
  ship.enterWalk(wenv);
  check('enterWalk 后 pitch 来自当前视向（≈-0.7 rad）', Math.abs(ship.walk.pitch - (-0.7)) < 0.06,
    `实际 pitch = ${ship.walk.pitch.toFixed(3)}（旧实现恒为 0）`);
}

console.log('\n[#2] 行走模式：鼠标右移（dx>0）应向右转（东向，yaw 增大）');
{
  const ship = new Ship();
  ship.mode = 'walk';
  const w = ship.walk;
  w.bodyId = 'earth';
  w.localPos.set(GROUND_H, 0, 0);
  w.yaw = 0; w.pitch = 0; w.grounded = true;
  const wenv = {
    getBodyQuat: () => IDENTITY_Q,
    getBodyPos: () => new Float64Array(3),
    heightFn: () => GROUND_H,
    phys: () => ({ gm: 3.986e5 }),
  };
  for (let i = 0; i < 30; i++) ship.updateWalk(0.016, mkInput({ dx: 10 }), wenv);
  check('dx>0 → yaw 增大（向右看）', ship.walk.yaw > 0.01,
    `实际 yaw = ${ship.walk.yaw.toFixed(4)}（旧实现为负 = 向左转，与探索方向相反）`);
}

console.log('\n[#3] 行走视角：单帧巨量输入（指针锁定尖峰 600px）不得产生快速旋转');
{
  const ship = new Ship();
  ship.mode = 'walk';
  const w = ship.walk;
  w.bodyId = 'earth';
  w.localPos.set(GROUND_H, 0, 0);
  w.yaw = 0; w.pitch = 0; w.grounded = true;
  const wenv = {
    getBodyQuat: () => IDENTITY_Q,
    getBodyPos: () => new Float64Array(3),
    heightFn: () => GROUND_H,
    phys: () => ({ gm: 3.986e5 }),
  };
  ship.updateWalk(0.016, mkInput({ dy: -600 }), wenv); // 单帧尖峰
  const jump = Math.abs(w.pitch);
  check('单帧俯仰变化 ≤ 0.25 rad（≈14°，平滑+钳制生效）', jump <= 0.25,
    `实际单帧俯仰跳变 = ${jump.toFixed(3)} rad = ${(jump * 180 / Math.PI).toFixed(1)}°（旧实现 600×0.0022=1.32 rad=75.6°）`);
  // 360° 自由不设限：持续上仰应能连续越过天顶（pitch 越过 π/2 不被钳制）
  w.pitch = 0;
  let maxPitch = 0;
  for (let i = 0; i < 400; i++) {
    ship.updateWalk(0.016, mkInput({ dy: -40 }), wenv);
    maxPitch = Math.max(maxPitch, Math.abs(w.pitch));
  }
  check('俯仰仍可 360° 连续（越过天顶，无钳制）', maxPitch > Math.PI / 2 + 0.1,
    `实际 max|pitch| = ${maxPitch.toFixed(3)}，未越过 π/2`);
}

console.log('\n[#6] （R8 修订）滚轮缩放语义改为屏幕中心 —— 见 tools/repro-r8.mjs 三项断言');

console.log('\n[#7] 模式切换姿态连续：adoptPosition(quat) 后 compute 应复现原视向');
{
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  cam.lat = 0.6; cam.lon = -1.2; cam.heading = 0.8; cam.tilt = 0.5;
  cam.dist = cam.distTarget = R_EARTH * 1.3;
  cam.compute(env);
  const pos = Float64Array.from(cam.posKm);
  const q0 = cam.quat.clone();
  const cam2 = new OrbitCamera();
  cam2.adoptPosition(env, 'earth', pos, q0);
  cam2.compute(env);
  const dq = Math.abs(q0.dot(cam2.quat));
  const angDeg = 2 * Math.acos(Math.min(1, dq)) * 180 / Math.PI;
  check('接管后视向偏差 < 2°', angDeg < 2,
    `实际偏差 = ${angDeg.toFixed(2)}°（旧实现 heading/tilt 清零 → 视向跳变）`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败${fail ? '（失败项 = 缺陷复现证据）' : ''}`);
process.exit(fail ? 1 : 0);
