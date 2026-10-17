// 探索模式相机（OrbitCamera）的回归断言。
//
// 这里只测"状态机"层面的东西——不碰渲染、不碰地形。起因是一个真实的严重缺陷：
// 点一下天体进入延迟焦点过渡后，update() 在过渡分支提前 return，拖拽/键盘全部被
// 跳过；而向外滚只推进朝向（faceT）不推进位置（t），完成条件 t>=1 永不满足，
// 于是过渡永不结束、拖拽永久失效。实测表现为"点一下天体，鼠标就坏了"。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';

const KM = 1;

/** 两个静止天体：earth 在原点，mars 在 +X 方向 1 AU 处 */
function makeEnv() {
  const bodies = {
    earth: { posKm: [0, 0, 0], radiusKm: 6371, quat: new THREE.Quaternion() },
    mars: { posKm: [1.5e8, 0, 0], radiusKm: 3390, quat: new THREE.Quaternion() },
  };
  return {
    get(id) {
      const b = bodies[id];
      if (!b) throw new Error('未知天体 ' + id);
      return { ...b, ringsOuterKm: null, viewDist: undefined, groundRadius: null, minDistKm: null };
    },
  };
}

/** 最小输入桩：字段与 src/engine/ship.js 的 Input 一致 */
function makeInput(over = {}) {
  const keys = over.keys ?? new Set();
  return {
    keys,
    dx: 0, dy: 0, wheel: 0, fovWheel: 0,
    drag: { active: false, dx: 0, dy: 0 },
    pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 },
    down: (c) => keys.has(c),
    tapped: () => false,
    cancelGestures() {},
    ...over,
  };
}

function setup() {
  const env = makeEnv();
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  return { env, cam };
}

/** 跑若干帧 */
function run(cam, env, input, frames = 3, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) cam.update(dt, input, env);
}

test('点击天体后进入延迟焦点过渡', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  assert.ok(cam.transition, '应当启动过渡');
  assert.equal(cam.transition.toId, 'mars');
  assert.equal(cam.focusId, 'earth', '过渡完成前焦点不应提交');
});

test('过渡期间拖拽 = 取消过渡，且当帧就恢复手动控制（回归：点一下鼠标就坏）', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  assert.ok(cam.transition, '前置条件：过渡已启动');

  const lonBefore = cam.lon;
  // 拖拽：active + 有位移
  const dragInput = makeInput({ drag: { active: true, dx: 40, dy: 0 } });
  cam.update(1 / 60, dragInput, env);

  assert.equal(cam.transition, null, '拖拽应当取消过渡');
  assert.equal(cam.pendingFocusId, null, '拖拽应当清掉待定焦点');
  assert.equal(cam.focusId, 'earth', '取消后仍绕原焦点');

  // 继续拖拽若干帧，经度必须真的变化（旧实现在这里恒为 0）
  run(cam, env, dragInput, 30);
  assert.ok(Math.abs(cam.lon - lonBefore) > 1e-3,
    `拖拽后经度应变化，实际 ${lonBefore} → ${cam.lon}`);
});

test('过渡期间按方向键/ WASD = 取消过渡', () => {
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft']) {
    const { env, cam } = setup();
    cam.setPendingFocus('mars');
    run(cam, env, makeInput(), 2);
    assert.ok(cam.transition);
    cam.update(1 / 60, makeInput({ keys: new Set([key]) }), env);
    assert.equal(cam.transition, null, `${key} 应当取消过渡`);
  }
});

test('向外滚而没有可退进度 = 取消过渡（否则相机会原地转向却永不结束）', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  assert.ok(cam.transition);
  assert.equal(cam.transition.t, 0, '前置条件：尚未接近');

  cam.update(1 / 60, makeInput({ wheel: 1 }), env);   // wheel>0 = 向外
  assert.equal(cam.transition, null, '向外滚应当取消过渡');
  assert.equal(cam.pendingFocusId, null);
});

test('向内滚推进过渡，到 t>=1 时提交新焦点', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  // 每格 +0.12，约 9 格到 1
  for (let i = 0; i < 40 && cam.transition; i++) {
    cam.update(1 / 60, makeInput({ wheel: -1 }), env);
  }
  assert.equal(cam.transition, null, '持续向内滚应完成过渡');
  assert.equal(cam.focusId, 'mars', '过渡完成后焦点应提交到目标');
});

test('过渡未受干扰时不会被误取消（静止输入）', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 60);
  assert.ok(cam.transition, '无输入时过渡应保持');
  assert.equal(cam.focusId, 'earth');
});

test('拖拽取消后，轨道参数与相机位置自洽（不跳变）', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  const posBefore = Float64Array.from(cam.posKm);

  cam.update(1 / 60, makeInput({ drag: { active: true, dx: 0.6, dy: 0 } }), env);
  // 取消的那一帧不应把相机瞬移走
  const moved = Math.hypot(
    cam.posKm[0] - posBefore[0], cam.posKm[1] - posBefore[1], cam.posKm[2] - posBefore[2]);
  assert.ok(moved < cam.dist * 0.5, `取消过渡不应造成位置跳变，实际位移 ${moved} km`);
  assert.ok(cam.dist > 0 && Number.isFinite(cam.dist));
});
