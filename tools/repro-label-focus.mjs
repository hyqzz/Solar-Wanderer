// Issue: clicking a body label in orbit mode must NOT immediately move the camera or
// switch focus. The camera stays put until the user scrolls or presses PageUp/Down,
// then smoothly transitions focus and approaches/moves away while keeping the target
// centered in the view. The user can stop scrolling (transition pauses) and click
// another target to retarget.

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';

const R_E = 6371;
const R_IAP = 734.5;
const R_TITAN = 2574.7;
const D_ES = 1.43e9; // Earth-Saturn distance (approx)
const D_SAT_TITAN = 1.22e6; // Saturn-Titan distance (approx)
const DEG = Math.PI / 180;

const IDENTITY_Q = new THREE.Quaternion();
const mkInput = (over = {}) => ({
  dx: 0, dy: 0, wheel: 0, locked: false,
  drag: { active: false, dx: 0, dy: 0 },
  pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 },
  cursor: null,
  down: (code) => false, tapped: () => false,
  ...over,
});

const env = {
  get(id) {
    if (id === 'earth') {
      return {
        posKm: new Float64Array([0, 0, 0]), radiusKm: R_E, quat: IDENTITY_Q,
        landable: true, groundRadius: () => R_E,
      };
    }
    if (id === 'iapetus') {
      return {
        posKm: new Float64Array([D_ES, 0, 0]), radiusKm: R_IAP, quat: IDENTITY_Q,
        landable: true, groundRadius: () => R_IAP,
      };
    }
    if (id === 'titan') {
      return {
        posKm: new Float64Array([D_ES + D_SAT_TITAN * 0.6, D_SAT_TITAN * 0.8, 0]),
        radiusKm: R_TITAN, quat: IDENTITY_Q,
        landable: true, groundRadius: () => R_TITAN,
      };
    }
    return null;
  },
  centerHit() { return null; },
  centerDepth() { return null; },
};

// 辅助相机，用于计算目标在屏幕上的偏离
const projCam = new THREE.PerspectiveCamera(58, 1, 1e-6, 1e12);
function targetAngularOff(cam, targetWorldPos) {
  const pos = new THREE.Vector3().fromArray(cam.posKm);
  const toTarget = new THREE.Vector3().subVectors(targetWorldPos, pos).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quat);
  return Math.acos(THREE.MathUtils.clamp(forward.dot(toTarget), -1, 1));
}

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

console.log('[Lazy-Focus] 点击目标后镜头先不动，滚动才平滑切换焦点并居中接近/远离');

const cam = new OrbitCamera();
cam.init(env, 'earth', 4);

// 1) 从地球滚轮远离到土星轨道距离
for (let i = 0; i < 300; i++) cam.update(0.016, mkInput({ wheel: 1 }), env);
const distEarth = cam.dist;
const posBeforeClick = Float64Array.from(cam.posKm);
const quatBeforeClick = cam.quat.clone();
check('已从地球远离到土星轨道距离', distEarth > D_ES * 0.5, `dist=${distEarth.toExponential(2)} km`);

// 2) 点击土卫八：只设置延迟焦点，镜头/焦点都不变
cam.setPendingFocus('iapetus');
cam.update(0.016, mkInput(), env);
const posAfterClick = Float64Array.from(cam.posKm);
check('点击后焦点仍为地球（延迟切换）', cam.focusId === 'earth', `focus=${cam.focusId}`);
check('点击后相机位置未动', Math.hypot(posAfterClick[0] - posBeforeClick[0], posAfterClick[1] - posBeforeClick[1], posAfterClick[2] - posBeforeClick[2]) < 1,
  `shift=${Math.hypot(posAfterClick[0] - posBeforeClick[0], posAfterClick[1] - posBeforeClick[1], posAfterClick[2] - posBeforeClick[2]).toFixed(3)} km`);

// 3) 持续滚动：过渡完成，焦点最终切到土卫八，且目标在大部分过渡期间靠近屏幕中心
let maxAngularOff = 0;
let maxLateAngularOff = 0;
let moved = false;
for (let i = 0; i < 300; i++) {
  cam.update(0.016, mkInput({ wheel: i % 6 === 0 ? -1 : 0 }), env);
  const targetPos = new THREE.Vector3().fromArray(env.get('iapetus').posKm);
  const off = targetAngularOff(cam, targetPos);
  if (off > maxAngularOff) maxAngularOff = off;
  if (i > 30 && off > maxLateAngularOff) maxLateAngularOff = off;
  if (i > 10 && Math.hypot(cam.posKm[0] - posBeforeClick[0], cam.posKm[1] - posBeforeClick[1], cam.posKm[2] - posBeforeClick[2]) > 1000) moved = true;
}
check('滚动后焦点最终变为土卫八', cam.focusId === 'iapetus', `focus=${cam.focusId}`);
check('滚动过渡后期（>30 帧）土卫八靠近屏幕中心（偏离 < 5°）', maxLateAngularOff < 5 * DEG, `max=${(maxLateAngularOff / DEG).toFixed(2)}°`);
check('滚动后相机位置发生变化', moved, `未移动`);

// 4) 停止滚动后再点击泰坦：pending 切换，当前焦点仍为土卫八，相机不动
const posAfterIapetus = Float64Array.from(cam.posKm);
cam.setPendingFocus('titan');
for (let i = 0; i < 30; i++) cam.update(0.016, mkInput(), env);
check('再次点击其他目标后焦点不变（仍为土卫八）', cam.focusId === 'iapetus', `focus=${cam.focusId}`);
check('再次点击后相机位置未动', Math.hypot(cam.posKm[0] - posAfterIapetus[0], cam.posKm[1] - posAfterIapetus[1], cam.posKm[2] - posAfterIapetus[2]) < 1,
  `shift=${Math.hypot(cam.posKm[0] - posAfterIapetus[0], cam.posKm[1] - posAfterIapetus[1], cam.posKm[2] - posAfterIapetus[2]).toFixed(3)} km`);

// 5) 再次滚动：平滑切换到泰坦，目标在过渡期间居中
maxAngularOff = 0;
maxLateAngularOff = 0;
let commitFrame2 = -1;
for (let i = 0; i < 300; i++) {
  cam.update(0.016, mkInput({ wheel: i % 6 === 0 ? -1 : 0 }), env);
  const targetPos = new THREE.Vector3().fromArray(env.get('titan').posKm);
  const off = targetAngularOff(cam, targetPos);
  if (cam.transition) {
    if (off > maxAngularOff) maxAngularOff = off;
    if (i > 30 && off > maxLateAngularOff) maxLateAngularOff = off;
  }
  if (commitFrame2 < 0 && cam.focusId === 'titan') commitFrame2 = i;
}
check('再次滚动后焦点最终变为泰坦', cam.focusId === 'titan', `focus=${cam.focusId}`);
check('再次滚动过渡期间泰坦靠近屏幕中心（过渡后期偏离 < 5°）', maxLateAngularOff < 5 * DEG, `max=${(maxLateAngularOff / DEG).toFixed(2)}°`);
check('再次滚动过渡在合理时间内完成', commitFrame2 > 0 && commitFrame2 < 200, `frame=${commitFrame2}`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
