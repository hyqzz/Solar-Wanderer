// Issue #1 repro: after landing on a planet and returning to orbit mode,
// Google Earth-style controls (WASD pan, Shift+AD heading, etc.) must work.

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';

const R_E = 6371;
const IDENTITY_Q = new THREE.Quaternion();
const mkInput = (over = {}) => {
  const downSet = new Set(over.down ?? []);
  return {
    dx: 0, dy: 0, wheel: 0, locked: true,
    drag: { active: false, dx: 0, dy: 0 },
    pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 },
    cursor: null,
    down: (code) => downSet.has(code),
    tapped: () => false,
    ...over,
    down: (code) => downSet.has(code),
  };
};

const env = {
  get() {
    return {
      posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q,
      landable: true, groundRadius: () => R_E,
    };
  },
};

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

console.log('[Issue-1] 登陆星球后返回探索模式，GE 键盘操控必须生效');

const cam = new OrbitCamera();
cam.init(env, 'earth', 4);
cam.lat = 0.2; cam.lon = 0.3;
// 1) 模拟自动登陆前的状态：相机接近地表
for (let i = 0; i < 500; i++) cam.update(0.016, mkInput({ wheel: -1 }), env);
const altBefore = (cam.dist - R_E) * 1000;
check('登陆前相机已贴近地表（< 10 m）', altBefore < 10, `alt=${altBefore.toFixed(2)} m`);

// 2) 模拟从行走模式返回探索模式：adoptPosition 用当前位姿，并抬升相机
const worldPos = Float64Array.from(cam.posKm);
const worldQuat = cam.quat.clone();
cam.adoptPosition(env, 'earth', worldPos, worldQuat);
cam.tilt = 0;
cam.distTarget = cam.dist + Math.max(cam.dist * 0.002, 0.05);
// 让抬升动画执行完
for (let i = 0; i < 120; i++) cam.update(0.016, mkInput(), env);
check('返回探索模式后 focus 仍为 earth', cam.focusId === 'earth', `focus=${cam.focusId}`);

// 3) 滚轮缩放必须有效（在合理 tilt 下测试）
const d0 = cam.dist;
for (let i = 0; i < 30; i++) cam.update(0.016, mkInput({ wheel: -1 }), env);
check('返回后滚轮缩放有效', cam.dist < d0 - 5, `dist ${d0.toFixed(1)}→${cam.dist.toFixed(1)}`);

// 4) GE 键盘：WASD 平移必须产生 lat/lon 变化
const s0 = { lat: cam.lat, lon: cam.lon, heading: cam.heading, tilt: cam.tilt };
for (let i = 0; i < 120; i++) {
  cam.update(0.016, mkInput({ down: ['KeyW'] }), env);
}
const dLat = cam.lat - s0.lat;
check('返回后 W 键平移生效（纬度变化）', Math.abs(dLat) > 1e-5,
  `Δlat=${dLat.toExponential(2)}`);

// 5) Shift+A/D 旋转航向
const s1 = { heading: cam.heading };
for (let i = 0; i < 120; i++) {
  cam.update(0.016, mkInput({ down: ['ShiftLeft', 'KeyA'] }), env);
}
const dHeading = cam.heading - s1.heading;
check('返回后 Shift+A 旋转航向生效', Math.abs(dHeading) > 0.01,
  `Δheading=${dHeading.toFixed(3)}`);

// 6) Shift+W/S 倾斜
const s2 = { tilt: cam.tilt };
for (let i = 0; i < 120; i++) {
  cam.update(0.016, mkInput({ down: ['ShiftLeft', 'KeyW'] }), env);
}
const dTilt = cam.tilt - s2.tilt;
check('返回后 Shift+W 倾斜生效', Math.abs(dTilt) > 0.01,
  `Δtilt=${dTilt.toFixed(3)}`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
