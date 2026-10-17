// 飞船物理的回归：引力积分、街机阻尼、大气阻力。
//
// 这些是"1:1 模拟"与"相机漫游"的分界线，而且很容易出现"帧率正常、物理悄悄错"
// 这类静默故障（例如漏掉 gm 项、阻尼把速度吃掉、阻力符号反了）。
//
// 测试前提（否则会得到假失败，见 tools/verify-gravity.mjs 的说明）：
//  · posKm 是**日心**坐标，太阳引力项才成立；
//  · 地球必须按真实轨道运动，否则会多出一个相对加速度。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship, aeroAt } from '../src/engine/ship.js';

const GM_EARTH = 3.986004418e5;
const GM_SUN = 1.32712440018e11;
const R_EARTH = 6371;
const AU = 1.496e8;

const idleInput = {
  dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
  drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
  touchAscend: false, touchDescend: false, touchSprint: false,
  keys: new Set(), down: () => false, tapped: () => false, justPressed: new Set(),
};

function makeEarth(altKm, atmosphere = null) {
  return {
    id: 'earth', posKm: new Float64Array([AU, 0, 0]), radiusKm: R_EARTH,
    distSurface: altKm, landable: true,
    phys: { gm: GM_EARTH, radiusKm: R_EARTH, atmosphere },
  };
}
function makeEnv(earth) {
  return { nearest: earth, get: () => earth, baseReady: () => true, phys: () => earth.phys };
}

test('引力模式：600km 圆轨道两小时内半径漂移 < 0.5%', () => {
  const alt = 600, r0 = R_EARTH + alt;
  const vCirc = Math.sqrt(GM_EARTH / r0);
  const vEarth = Math.sqrt(GM_SUN / AU);
  const earth = makeEarth(alt);
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + r0;
  s.vel.set(0, vEarth, vCirc);

  let minR = Infinity, maxR = -Infinity;
  const dt = 0.1;
  for (let i = 0; i < 72000; i++) {           // 2 小时
    // 地球按真实轨道运动（否则多出相对加速度，测的是脚手架不是代码）
    const ang = (vEarth * i * dt) / AU;
    earth.posKm[0] = AU * Math.cos(ang);
    earth.posKm[1] = AU * Math.sin(ang);
    s.update(dt, idleInput, makeEnv(earth));
    const r = Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2] - earth.posKm[2]);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  const drift = (maxR - minR) / r0;
  assert.ok(drift < 0.005, `圆轨道半径漂移 ${(drift * 100).toFixed(3)}% 超过 0.5%`);
});

test('街机模式松手会掉速；引力模式不会', () => {
  const speedAfter = (gravityMode) => {
    const earth = makeEarth(600);
    const s = new Ship();
    s.mode = 'fly'; s.gravityMode = gravityMode;
    s.posKm[0] = AU + R_EARTH + 600;
    s.vel.set(0, 0, 7.5);
    for (let i = 0; i < 200; i++) s.update(0.016, idleInput, makeEnv(earth));
    return s.vel.length();
  };
  assert.ok(speedAfter(false) < 1, '街机模式松手后应明显掉速');
  assert.ok(speedAfter(true) > 7, '引力模式松手后速度应基本守恒');
});

test('大气阻力：60km/7.8km/s 穿过大气后速度明显下降', () => {
  const atm = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const earth = makeEarth(60, atm);
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + R_EARTH + 60;
  s.vel.set(0, 0, 7.8);
  const v0 = s.vel.length();
  for (let i = 0; i < 600; i++) s.update(0.016, idleInput, makeEnv(earth));   // ~10 s
  assert.ok(s.vel.length() < v0 * 0.98, `阻力未生效：${v0} → ${s.vel.length()}`);
  assert.ok(s.aero && s.aero.q > 1e4, `动压 ${s.aero?.q} 应 >10 kPa`);
});

test('真空里没有阻力（aero 归零）', () => {
  const earth = makeEarth(600);               // 无 atmosphere
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + R_EARTH + 600;
  s.vel.set(0, 0, 7.5);
  s.update(0.016, idleInput, makeEnv(earth));
  assert.equal(s.aero.q, 0);
  assert.equal(s.aero.rho, 0);
});

test('aeroAt：60km 动压在真实峰值量级，120km 近乎真空', () => {
  const atm = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const q60 = aeroAt(60, 7.8, atm).q;
  assert.ok(q60 > 1e4 && q60 < 4e4, `60km 动压 ${(q60 / 1000).toFixed(1)} kPa 不在 10–40 kPa`);
  assert.ok(aeroAt(120, 7.8, atm).q < 100, '120km 应接近真空');
});

test('推进剂：引力模式下推力消耗 Δv 预算，耗尽后无法再加速', () => {
  const earth = makeEarth(600);
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + R_EARTH + 600;
  s.vel.set(0, 0, 0);
  const thrustInput = {
    ...idleInput,
    keys: new Set(['KeyW']),
    down: (c) => c === 'KeyW',
  };
  const dv0 = s.dvBudget;
  assert.ok(dv0 > 5 && dv0 < 15, `Δv 预算 ${dv0} 不在 9.4 量级`);
  for (let i = 0; i < 100; i++) s.update(0.05, thrustInput, makeEnv(earth));
  assert.ok(s.dvBudget < dv0, '推力应消耗 Δv');
  // 耗尽后速度不再增长（只剩引力）
  s.dvBudget = 0;
  const v0 = s.vel.length();
  for (let i = 0; i < 20; i++) s.update(0.02, thrustInput, makeEnv(earth));
  assert.ok(s.vel.length() <= v0 + 1e-6, 'Δv 耗尽后仍在加速');
});

test('大气内有升力，且低于失速速度时骤降', () => {
  const atm = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const earth = makeEarth(20, atm);          // 20km 高度，空气够稠
  const run = (speedKmS) => {
    const s = new Ship();
    s.mode = 'fly'; s.gravityMode = true;
    s.posKm[0] = AU + R_EARTH + 20;
    s.vel.set(0, 0, speedKmS);               // 水平飞行
    for (let i = 0; i < 30; i++) s.update(0.016, idleInput, makeEnv(earth));
    return s.aero.liftMS ?? 0;
  };
  const fast = run(1.0);                     // 1000 m/s
  const slow = run(0.03);                    // 30 m/s，低于失速速度
  assert.ok(fast > 10, `高速时升力 ${fast.toFixed(0)} m/s² 太小（20km/1km/s 应约 2g）`);
  assert.ok(slow < 1, `低速时升力 ${slow.toFixed(1)} m/s² 应接近 0（失速）`);
});
