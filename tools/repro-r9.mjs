// R9 缺陷复现/验证脚本：Node 直接驱动 OrbitCamera/Ship/HeightField（无浏览器）。
// 修复前运行：各项 FAIL（= 缺陷复现证据）；修复后运行：全部 PASS。
// 用法：node tools/repro-r9.mjs

import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';
import { Ship } from '../src/engine/ship.js';
import { HeightField } from '../src/scene/terrain.js';
import { readFileSync } from 'node:fs';

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

console.log('\n[R9-1a] 行走视角：单帧多事件累计 + 卡顿帧不得产生快速旋转');
{
  const ship = new Ship();
  ship.mode = 'walk';
  const w = ship.walk;
  w.bodyId = 'earth'; w.localPos.set(R_E, 0, 0); w.yaw = 0; w.pitch = 0; w.grounded = true;
  const wenv = {
    getBodyQuat: () => IDENTITY_Q, getBodyPos: () => new Float64Array(3),
    heightFn: () => R_E, phys: () => ({ gm: 3.986e5 }),
  };
  // 一帧累计 1200px（8 个已钳制事件）+ 卡顿帧 dt=0.12（平滑系数≈1）
  ship.updateWalk(0.12, mkInput({ dy: -1200 }), wenv);
  const jump = Math.abs(w.pitch);
  check('卡顿帧+事件堆积：单帧俯仰变化 ≤ 0.12 rad（≈7°）', jump <= 0.12,
    `实际单帧跳变 = ${jump.toFixed(3)} rad = ${(jump * 180 / Math.PI).toFixed(1)}°`);
  // 正常甩头不受影响：60fps 连续输入 30px/帧 应能正常转动
  w.pitch = 0; w.smy = 0;
  for (let i = 0; i < 60; i++) ship.updateWalk(0.016, mkInput({ dy: -30 }), wenv);
  check('正常环视不受钳制影响（1s 内俯仰 > 0.5 rad）', Math.abs(w.pitch) > 0.5,
    `实际 = ${w.pitch.toFixed(3)} rad`);
}

console.log('\n[R9-1b] 平移后滚轮接近：目标深度在天体间交替不得产生瞬间跳跃');
{
  // 地球为焦点；太阳在远处。模拟视线漂移导致 centerDepth 在 太阳↔地球 间交替。
  const bodies = {
    earth: { posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q },
    sun: { posKm: new Float64Array([AU, 0, 0]), radiusKm: R_SUN, quat: IDENTITY_Q },
  };
  let flip = false; // 每帧切换命中目标（最恶劣的交替场景）
  const env = {
    get: (id) => bodies[id] ?? bodies.earth,
    centerDepth(posKm, dir) {
      // 命中太阳的真实深度
      const t = flip ? null : (() => {
        const ox = bodies.sun.posKm[0] - posKm[0], oy = -posKm[1], oz = -posKm[2];
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        if (b <= 0) return null;
        const det = b * b - (ox * ox + oy * oy + oz * oz - (R_SUN * 1.01) ** 2);
        return det > 0 ? b - Math.sqrt(det) : null;
      })();
      if (!flip) { flip = true; return t; }
      // 下一帧改报地球近距（模拟射线扫过地球盘面）
      flip = false;
      return R_E * 0.5;
    },
    centerHit(posKm, dir) { // 修复后接口：返回 {id, depth}
      const d = this.centerDepth(posKm, dir);
      return d == null ? null : { id: 'sun', depth: d };
    },
  };
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 50);
  cam.update(0.016, mkInput(), env);
  cam.panOffset.set(R_E * 3, R_E * 2, 0); // 已右键平移
  cam.update(0.016, mkInput(), env);
  // 视线对准太阳（推拉沿视线，太阳保持居中——居中性由 R8 断言保障）
  const toSun = new THREE.Vector3();
  const mm = new THREE.Matrix4();
  const dSun = () => Math.hypot(cam.posKm[0] - AU, cam.posKm[1], cam.posKm[2]) - R_SUN;
  let worstRel = 0, regress = 0;
  let prevD = dSun();
  for (let i = 0; i < 240; i++) {
    toSun.set(AU - cam.posKm[0], -cam.posKm[1], -cam.posKm[2]).normalize();
    mm.lookAt(new THREE.Vector3(), toSun, new THREE.Vector3(0, 1, 0));
    cam.quat.setFromRotationMatrix(mm);
    cam.update(0.016, mkInput({ wheel: i % 4 === 0 && i < 200 ? -1 : 0 }), env);
    const d = dSun();
    const step = Math.abs(prevD - d);
    worstRel = Math.max(worstRel, step / Math.max(prevD, 1));
    if (d > prevD + prevD * 0.01) regress++; // 远离 = 向后猛冲（旧缺陷的另一面）
    prevD = d;
  }
  // 交替/漂移命中下：旧实现重定目标可单帧猛冲剩余距离的大半甚至倒退；
  // 新实现 = 焦点交接 + 平滑指数收敛（连滚加速下单帧 ≤ ~12%，属平滑追赶非跳跃）
  check('单帧推进 ≤ 剩余距离 18%（平滑无跳跃）', worstRel <= 0.18,
    `实际最大单帧推进比例 = ${(worstRel * 100).toFixed(1)}%`);
  check('全程无向后猛冲（不倒退回地球方向）', regress === 0, `倒退帧数 = ${regress}`);
  check('确实显著接近了太阳', dSun() < AU * 0.5, `剩余 = ${(dSun() / AU).toFixed(3)} AU`);
}

console.log('\n[R9-1c] 远离上限：持续缩出不得超过日球层全景距离（~260 AU）');
{
  const env = { get: () => ({ posKm: new Float64Array(3), radiusKm: R_E, quat: IDENTITY_Q }) };
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  for (let i = 0; i < 2000; i++) cam.update(0.05, mkInput({ wheel: 1 }), env);
  const maxAU = cam.dist / AU;
  check('缩出极限 ≤ 260 AU（日球层顶 121 AU 完整入画）', maxAU <= 260,
    `实际可达 = ${maxAU.toFixed(0)} AU`);
}

console.log('\n[R9-1d] (R10 修订) 滚轮不再隐式交接焦点——见 tools/repro-r10.mjs');

console.log('\n[R9-2a] 地形顶点 Float32 精度：体本地坐标在行星半径模长下量化 ≥ 0.25 m');
{
  // 现状：顶点 = dir*h，模 ≈ 6371 km → fp32 量化步长 0.5 m（眼高 1.7 m 同量级 → 闪烁）
  const h = 6371.0017; // km
  const errKm = Math.abs(Math.fround(h) - h);
  const quantized = errKm * 1e3 > 0.1; // >10cm 即不可接受
  console.log(`    fp32(6371.0017 km) 误差 = ${(errKm * 1e6).toFixed(1)} mm`);
  // 修复后：顶点存锚点相对坐标（模 ≤ 560 km，近处 ≤ 0.1 km → 误差亚毫米）
  const rel = 0.0017;
  const errRel = Math.abs(Math.fround(rel) - rel);
  check('锚点相对坐标量化误差 < 0.1 mm（修复路径有效）', errRel * 1e6 < 0.1,
    `相对坐标误差 = ${(errRel * 1e6).toFixed(4)} mm`);
  // 检查 terrain.js 是否已实现锚点相对几何（静态检查）
  const src = readFileSync(new URL('../src/scene/terrain.js', import.meta.url), 'utf8');
  check('terrain.js 已实现级原点相对几何（uPatchRel + origin）',
    /uPatchRel/.test(src) && /lv\.origin/.test(src) && /- lv\.origin\.x/.test(src),
    '当前顶点仍为天体本地绝对坐标（模 ≈ R → fp32 量化 0.5 m → 闪烁）');
}

console.log('\n[R9-2c-1] 火卫一不规则形状：HeightField 应表达三轴椭球（27×22×18 km）');
{
  const phys = {
    radiusKm: 11.27, landable: true,
    shape: { dims: [27, 21.6, 18.8] }, // 真实尺寸（km，全径）
    surface: { ampKm: 1.5, roughness: 0.7, craters: 1.5, palette: 'gray' },
  };
  const hf = new HeightField('phobos', phys);
  const rx = hf.height(new THREE.Vector3(1, 0, 0));
  const rz = hf.height(new THREE.Vector3(0, 0, 1));
  const ratio = rx / rz;
  check('长轴/短轴比 > 1.2（土豆状，非正球）', ratio > 1.2,
    `实际 rx/rz = ${ratio.toFixed(3)}（正球体 ≈ 1.0）`);
}

console.log('\n[R9-2c-2] 冥王星贴图：pluto.jpg 必须为有效 JPEG（含斯普特尼克心形平原）');
{
  const buf = readFileSync(new URL('../public/textures/pluto.jpg', import.meta.url));
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  check('pluto.jpg 魔数 = FFD8FF（有效 JPEG）', isJpeg,
    `实际文件头 = ${buf.slice(0, 16).toString('utf8').replace(/\n/g, ' ')}…（HTML 错误页）`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败${fail ? '（失败项 = 缺陷复现证据）' : ''}`);
process.exit(fail ? 1 : 0);
