// 物理数据与卫星轨道一致性测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, MOON_PHYS, surfaceGravity } from '../src/astro/bodies.js';
import { MOON_ELEMENTS } from '../src/astro/moonsData.generated.js';
import { moonLocalPosition, moonOrbitNormal, MOON_IDS } from '../src/astro/moons.js';
import { makeNoise, hashSeed } from '../src/util/noise.js';

test('表面重力：地球 9.81、月球 1.62、火星 3.71 m/s²', () => {
  assert.ok(Math.abs(surfaceGravity(BODIES.earth) - 9.81) < 0.03);
  assert.ok(Math.abs(surfaceGravity(MOON_PHYS.moon) - 1.62) < 0.02);
  assert.ok(Math.abs(surfaceGravity(BODIES.mars) - 3.71) < 0.03);
});

test('卫星拟合周期与文献一致（±0.5%）', () => {
  const expect = {
    io: 1.769138, europa: 3.551181, ganymede: 7.154553, callisto: 16.689017,
    titan: 15.945421, triton: 5.876854, charon: 6.387230, phobos: 0.318910,
  };
  for (const [id, pLit] of Object.entries(expect)) {
    const p = 360 / MOON_ELEMENTS[id].nDegPerDay;
    assert.ok(Math.abs(p - pLit) / pLit < 0.005, `${id}: P=${p.toFixed(5)}天 (文献 ${pLit})`);
  }
});

test('卫星位置传播：一个周期后回归（圆轨道近似）', () => {
  for (const id of ['io', 'titan', 'triton']) {
    const epoch = 2461202.0;
    const P = 360 / MOON_ELEMENTS[id].nDegPerDay;
    const p0 = moonLocalPosition(id, epoch);
    const p1 = moonLocalPosition(id, epoch + P);
    const r = Math.hypot(p0.x, p0.y, p0.z);
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    assert.ok(d / r < 0.01, `${id}: 周期回归偏差 ${(d / r * 100).toFixed(3)}%`);
  }
});

test('海卫一逆行轨道（法向 z 分量为负）', () => {
  assert.ok(moonOrbitNormal('triton').z < 0);
});

test('全部卫星：物理数据完备且半径>0', () => {
  for (const id of MOON_IDS) {
    const m = MOON_PHYS[id];
    assert.ok(m && m.radiusKm > 0 && m.gm > 0 && m.nameZh, id);
  }
});

test('地形噪声：确定性（同种子同输出）且有界', () => {
  const n1 = makeNoise(hashSeed('moon'));
  const n2 = makeNoise(hashSeed('moon'));
  for (let i = 0; i < 50; i++) {
    const x = Math.sin(i) * 3, y = Math.cos(i * 1.7) * 3, z = Math.sin(i * 0.7) * 3;
    const a = n1.fbm(x, y, z, 5);
    assert.equal(a, n2.fbm(x, y, z, 5));
    assert.ok(a > -1.001 && a < 1.001);
    const r = n1.ridged(x, y, z, 4);
    assert.ok(r >= -0.001 && r <= 1.001);
  }
});

test('不同天体地形互不相同（种子隔离）', () => {
  const a = makeNoise(hashSeed('moon')).fbm(1, 2, 3, 5);
  const b = makeNoise(hashSeed('mars')).fbm(1, 2, 3, 5);
  assert.notEqual(a, b);
});

// ── 真实引力模式：圆轨道必须保持圆 ──────────────────────────────────────────
// 这是引力的硬判据。两个测试前提必须说清，否则会得到假失败：
//   1) posKm 在应用里是**日心**坐标，地球必须放在 1 AU 处，太阳项才成立；
//   2) 地球必须**按真实轨道运动**——钉死在原地会多出一个 5.9e-6 km/s² 的相对加速度，
//      两小时累积成约 1.4% 的假漂移（该漂移与步长无关，可据此判定不是数值误差）。
test('引力模式：圆轨道半径稳定、速度守恒；街机模式作为对照衰减到零', async () => {
  const { Ship } = await import('../src/engine/ship.js');
  const GM_E = 3.986004418e5, GM_S = 1.32712440018e11;
  const RE = 6371, ALT = 600, AU = 1.496e8;
  const r0 = RE + ALT;
  const vc = Math.sqrt(GM_E / r0), vE = Math.sqrt(GM_S / AU);
  const idle = {
    dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
    drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
    touchAscend: false, touchDescend: false, touchSprint: false,
    down: () => false, tapped: () => false,
  };
  const run = (gravityMode) => {
    const earth = {
      id: 'earth', posKm: new Float64Array([AU, 0, 0]), radiusKm: RE,
      distSurface: ALT, landable: true, phys: { gm: GM_E, radiusKm: RE },
    };
    const env = { nearest: earth, get: () => earth, baseReady: () => true, phys: () => earth.phys };
    const s = new Ship();
    s.mode = 'fly'; s.gravityMode = gravityMode;
    s.posKm[0] = AU + r0; s.vel.set(0, vE, vc);
    let mn = Infinity, mx = -Infinity, absV = Infinity;
    const dt = 0.1, steps = Math.round(7200 / dt);
    for (let i = 0; i < steps; i++) {
      const th = (i * dt * vE) / AU;
      earth.posKm[0] = AU * Math.cos(th); earth.posKm[1] = AU * Math.sin(th);
      s.update(dt, idle, env);
      mn = Math.min(mn, Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2]));
      mx = Math.max(mx, Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2]));
      absV = Math.min(absV, s.vel.length());
    }
    return { drift: (mx - mn) / r0, absV };
  };
  const g = run(true), a = run(false);
  assert.ok(g.drift < 0.005, `引力模式圆轨道相对漂移 ${(g.drift * 100).toFixed(4)}%，应 <0.5%`);
  assert.ok(a.absV < 1, `街机模式无推力应衰减到零（对照组），实际 ${a.absV.toFixed(2)} km/s`);
});
