// Issue #2 repro: right-click pan followed by wheel zoom should not jump back.
// Simulates the orbit camera with pan + zoom and checks continuity of the look-at point.

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';

const R_E = 6371;
const IDENTITY_Q = new THREE.Quaternion();

const mkInput = (over = {}) => ({
  dx: 0, dy: 0, wheel: 0, locked: true,
  drag: { active: false, dx: 0, dy: 0 },
  pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 },
  cursor: null,
  down: () => false, tapped: () => false,
  ...over,
});

const env = {
  get() {
    return {
      posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q,
      landable: true, groundRadius: () => R_E,
    };
  },
  centerHit(posKm, dir) {
    // Earth at origin; view ray from posKm along dir
    const ox = -posKm[0], oy = -posKm[1], oz = -posKm[2];
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    if (b <= 0) return null;
    const margin = R_E * 1.004 + 1;
    const det = b * b - (ox * ox + oy * oy + oz * oz - margin * margin);
    return det > 0 ? { id: 'earth', depth: b - Math.sqrt(det) } : null;
  },
  centerDepth(posKm, dir) { return this.centerHit(posKm, dir)?.depth ?? null; },
};

const cam = new OrbitCamera();
cam.init(env, 'earth', 4);

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};

console.log('[Issue-2] 右键平移空间后滚轮缩放，不应跳回原空间');

// Initial: look straight down at Earth from 4R altitude.
// Step 1: pan right by a significant amount (simulating right-click drag).
for (let i = 0; i < 60; i++) {
  cam.update(0.016, mkInput({ pan: { active: true, dx: 30, dy: 0 } }), env);
}
const afterPan = new THREE.Vector3().fromArray(cam.posKm);
const panTarget = new THREE.Vector3(
  env.get().posKm[0] + (cam.panOffset.clone().applyQuaternion(IDENTITY_Q)).x,
  env.get().posKm[1] + (cam.panOffset.clone().applyQuaternion(IDENTITY_Q)).y,
  env.get().posKm[2] + (cam.panOffset.clone().applyQuaternion(IDENTITY_Q)).z,
);
console.log(`  平移后 panOffset = ${cam.panOffset.x.toFixed(1)}, ${cam.panOffset.y.toFixed(1)}, ${cam.panOffset.z.toFixed(1)} km`);
console.log(`  平移后相机位置 = ${afterPan.x.toFixed(1)}, ${afterPan.y.toFixed(1)}, ${afterPan.z.toFixed(1)}`);

// Step 2: zoom in with wheel (negative wheel = zoom in).
const lookAtBefore = new THREE.Vector3();
const radial = new THREE.Vector3(
  Math.cos(cam.lat) * Math.cos(cam.lon),
  Math.sin(cam.lat),
  -Math.cos(cam.lat) * Math.sin(cam.lon)
).applyQuaternion(IDENTITY_Q);
const panWorld = cam.panOffset.clone().applyQuaternion(IDENTITY_Q);
lookAtBefore.copy(new THREE.Vector3(env.get().posKm[0], env.get().posKm[1], env.get().posKm[2])).add(panWorld);

let maxLookShift = 0;
let prevPos = afterPan.clone();
let maxPosJump = 0;
for (let i = 0; i < 120; i++) {
  cam.update(0.016, mkInput({ wheel: i % 6 === 0 ? -1 : 0 }), env); // 每 6 帧一格，更真实
  const posNow = new THREE.Vector3().fromArray(cam.posKm);
  const frameQ = IDENTITY_Q;
  const rNow = new THREE.Vector3(
    Math.cos(cam.lat) * Math.cos(cam.lon),
    Math.sin(cam.lat),
    -Math.cos(cam.lat) * Math.sin(cam.lon)
  ).applyQuaternion(frameQ);
  const panW = cam.panOffset.clone().applyQuaternion(frameQ);
  const lookAtNow = new THREE.Vector3(env.get().posKm[0], env.get().posKm[1], env.get().posKm[2]).add(panW);
  const shift = lookAtNow.distanceTo(lookAtBefore);
  if (shift > maxLookShift) maxLookShift = shift;
  const jump = posNow.distanceTo(prevPos);
  if (jump > maxPosJump) maxPosJump = jump;
  prevPos.copy(posNow);
}

console.log(`  缩放中 look-at 点最大漂移 = ${maxLookShift.toFixed(3)} km`);
console.log(`  单帧最大位置跳变 = ${maxPosJump.toFixed(3)} km`);
check('平移后滚轮缩放 look-at 点不跳回（漂移 < 1 km）', maxLookShift < 1, `max=${maxLookShift.toFixed(3)}`);
check('缩放过程位置连续（单帧 < 1000 km）', maxPosJump < 1000, `max=${maxPosJump.toFixed(3)}`);

// Step 3: zoom out after zooming in — should not snap back either.
const lookAtAfterIn = new THREE.Vector3(
  env.get().posKm[0] + (cam.panOffset.clone().applyQuaternion(IDENTITY_Q)).x,
  env.get().posKm[1] + (cam.panOffset.clone().applyQuaternion(IDENTITY_Q)).y,
  env.get().posKm[2] + (cam.panOffset.clone().applyQuaternion(IDENTITY_Q)).z,
);
maxLookShift = 0;
prevPos = new THREE.Vector3().fromArray(cam.posKm);
maxPosJump = 0;
const targetDistOut = R_E * 4; // 只缩回到原始高度，避免极远距离 fp64 精度问题
for (let i = 0; i < 400 && cam.dist < targetDistOut * 1.1; i++) {
  cam.update(0.016, mkInput({ wheel: i % 6 === 0 ? 1 : 0 }), env); // zoom out
  const posNow = new THREE.Vector3().fromArray(cam.posKm);
  const panW = cam.panOffset.clone().applyQuaternion(IDENTITY_Q);
  const lookAtNow = new THREE.Vector3(env.get().posKm[0], env.get().posKm[1], env.get().posKm[2]).add(panW);
  const shift = lookAtNow.distanceTo(lookAtAfterIn);
  if (shift > maxLookShift) maxLookShift = shift;
  const jump = posNow.distanceTo(prevPos);
  if (jump > maxPosJump) maxPosJump = jump;
  prevPos.copy(posNow);
}
console.log(`  缩出后 look-at 点相对缩放前最大漂移 = ${maxLookShift.toFixed(3)} km`);
check('缩出后 look-at 点不跳回（漂移 < 1 km）', maxLookShift < 1, `max=${maxLookShift.toFixed(3)}`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
