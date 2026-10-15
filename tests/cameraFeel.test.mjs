// 相机语言的回归：步态起伏、冲击衰减、FOV 语言。
//
// 这些量很小（角分量级）却决定"动作有没有重量"，而且一旦写错很容易变成
// "画面在抖"或"永远不衰减"这类持续性问题，所以要有数值断言兜住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraFeel } from '../src/engine/cameraFeel.js';

/** 把四元数转成便于断言的小角度（弧度），YXZ 序 */
function toEuler(q) {
  const e = { x: 0, y: 0, z: 0 };
  const { x, y, z, w } = q;
  // YXZ：pitch = asin(-m23)，yaw、roll 由其余项给出
  const m23 = 2 * (y * z - w * x);
  e.x = Math.asin(Math.max(-1, Math.min(1, -m23)));
  e.y = Math.atan2(2 * (x * z + w * y), 1 - 2 * (y * y + z * z));
  e.z = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z));
  return e;
}

const rest = { mode: 'orbit', walking: false, walkSpeedMS: 0, submerged: false, speedKmS: 0, boosting: false };

test('静止且无冲击时相机不受任何扰动', () => {
  const f = createCameraFeel();
  let r;
  for (let i = 0; i < 60; i++) r = f.update(1 / 60, rest);
  const e = toEuler(r.quaternion);
  assert.ok(Math.abs(e.x) < 1e-9 && Math.abs(e.y) < 1e-9 && Math.abs(e.z) < 1e-9,
    `静止时应有零偏移，实际 ${e.x},${e.y},${e.z}`);
  assert.equal(r.fovBiasDeg, 0);
});

test('步态起伏：走路时出现周期性俯仰，停止后归零', () => {
  const f = createCameraFeel();
  const walk = { ...rest, mode: 'walk', walking: true, walkSpeedMS: 3 };
  const pitches = [];
  for (let i = 0; i < 240; i++) pitches.push(toEuler(f.update(1 / 60, walk).quaternion).x);
  const amp = Math.max(...pitches) - Math.min(...pitches);
  // 幅度设计值约 0.25°（往返 0.5° = 0.0087 rad）
  assert.ok(amp > 0.004 && amp < 0.02, `步态俯仰振幅 ${amp.toFixed(4)} rad 不在合理区间`);

  // 停下后应平滑归零
  const stop = { ...rest, mode: 'walk', walking: false, walkSpeedMS: 0 };
  let rs;
  for (let i = 0; i < 120; i++) rs = f.update(1 / 60, stop);
  assert.ok(Math.abs(toEuler(rs.quaternion).x) < 5e-4, '停止行走后起伏应归零');
});

test('冲击：瞬时产生偏移，随后指数衰减到零', () => {
  const f = createCameraFeel();
  f.impulse(0.03, 24);
  assert.ok(f.amplitude === 0.03, '冲击幅度应立刻生效');
  const first = toEuler(f.update(1 / 60, rest).quaternion);
  assert.ok(Math.abs(first.x) > 1e-4 || Math.abs(first.z) > 1e-4, '冲击首帧应有可见偏移');
  // 1 秒后应衰减到可忽略
  for (let i = 0; i < 60; i++) f.update(1 / 60, rest);
  assert.ok(f.amplitude < 0.03 * 0.01, `1 秒后幅度应衰减到 1% 以下，实际 ${f.amplitude}`);
  for (let i = 0; i < 240; i++) f.update(1 / 60, rest);
  assert.equal(f.amplitude, 0, '最终应完全归零');
});

test('冲击期间 FOV 收拢，回稳后回到基础值', () => {
  const f = createCameraFeel();
  f.impulse(0.03, 24);
  let minFov = 0;
  for (let i = 0; i < 30; i++) minFov = Math.min(minFov, f.update(1 / 60, rest).fovBiasDeg);
  assert.ok(minFov < -1, `冲击应使 FOV 收拢，实际最小 ${minFov.toFixed(2)}°`);
  let rr;
  for (let i = 0; i < 300; i++) rr = f.update(1 / 60, rest);
  assert.ok(Math.abs(rr.fovBiasDeg) < 0.05, `回稳后 FOV 偏移应趋零，实际 ${rr.fovBiasDeg}`);
});

test('高速微抖：低速无感，高速封顶', () => {
  const slowFeel = createCameraFeel();
  const slow = { ...rest, mode: 'fly', speedKmS: 0.01 };
  let slowMax = 0;
  for (let i = 0; i < 60; i++) slowMax = Math.max(slowMax, Math.abs(toEuler(slowFeel.update(1 / 60, slow).quaternion).x));
  assert.ok(slowMax < 1e-4, `低速巡航不应有抖动，实际 ${slowMax}`);

  const fastFeel = createCameraFeel();
  const fast = { ...rest, mode: 'fly', speedKmS: 1000 };
  let fastMax = 0;
  for (let i = 0; i < 120; i++) fastMax = Math.max(fastMax, Math.abs(toEuler(fastFeel.update(1 / 60, fast).quaternion).x));
  assert.ok(fastMax > 5e-4, `高速应有可感抖动，实际 ${fastMax}`);
  assert.ok(fastMax < 0.004, `抖动必须封顶（>0.23° 会晕），实际 ${fastMax}`);
});

test('相机语言只改姿态与 FOV，不返回视点偏移', () => {
  const f = createCameraFeel();
  f.impulse(0.02, 24);
  const r = f.update(1 / 60, { ...rest, mode: 'walk', walking: true, walkSpeedMS: 3 });
  assert.deepEqual(Object.keys(r).sort(), ['fovBiasDeg', 'quaternion'],
    '返回值只应有姿态与 FOV —— 叠加视点偏移会破坏浮动原点精度与着陆判定');
});
