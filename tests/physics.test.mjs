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

// 半径口径：oblateness 是标准扁率 f=(a−b)/a，radiusKm 就必须是赤道半径 a。
// 两者口径不一致会静默算错天体大小——四颗巨行星此前填的是体积平均半径，
// 于是土星被画小 3.4%、木星 2.2%，画面照出、看不出错，只有对数字才发现。
// 参考值取自 NASA 行星实况表（1 bar 层赤道半径与极半径）。
const OBLATE_REFERENCE = {
  jupiter: { a: 71492, b: 66854, f: 0.06487 },
  saturn:  { a: 60268, b: 54364, f: 0.09796 },
  uranus:  { a: 25559, b: 24973, f: 0.02293 },
  neptune: { a: 24764, b: 24341, f: 0.01708 },
};

test('巨行星半径是赤道半径而非体积平均半径，与扁率配对', () => {
  for (const [id, ref] of Object.entries(OBLATE_REFERENCE)) {
    const p = BODIES[id];
    // 1) 填的必须就是赤道半径（体积平均半径会明显偏小：木星 69911、土星 58232…）
    assert.ok(Math.abs(p.radiusKm - ref.a) < 1,
      `${id} 的 radiusKm=${p.radiusKm} 不是赤道半径 ${ref.a}（体积平均半径会让天体被画小）`);
    // 2) 扁率必须是标准扁率，而不是别的口径
    assert.ok(Math.abs(p.oblateness - ref.f) < 1e-4, `${id} 扁率 ${p.oblateness} 与标准值 ${ref.f} 不符`);
    // 3) 渲染器施加 scale.y = 1−f 后得到的极半径必须与实测吻合
    const b = p.radiusKm * (1 - p.oblateness);
    assert.ok(Math.abs(b - ref.b) < 1, `${id} 极半径算出 ${b.toFixed(0)}，实测 ${ref.b}`);
  }
});

test('可登陆天体渲染为正球：radiusKm 应是体积平均半径而非赤道半径', () => {
  // 地形、碰撞、高度查询都建立在正球 R 上，单独压扁网格会让地表与碰撞错位。
  // 因此这类天体该用等体积球半径（更好的球近似），而不是赤道半径。
  assert.ok(Math.abs(BODIES.earth.radiusKm - 6371.0) < 1,
    `地球 ${BODIES.earth.radiusKm} 应为平均半径 6371（赤道半径 6378.137 是更差的球近似）`);
  assert.ok(Math.abs(BODIES.mars.radiusKm - 3389.5) < 1, `火星 ${BODIES.mars.radiusKm} 应为平均半径 3389.5`);
  // 太阳接近正球，赤道与平均几乎无差
  assert.ok(Math.abs(BODIES.sun.radiusKm - 695700) < 1);
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

test('地形碰撞：飞船被挡在山体表面，而不是平均球面（可穿过山脉）', async () => {
  const { Ship } = await import('../src/engine/ship.js');
  const THREE = await import('three');
  const R = 1737.4;                 // 月球半径 km
  const MOUNTAIN = 5;               // 该方向上地形高出平均球 5 km
  const idle = {
    dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
    drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
    touchAscend: false, touchDescend: false, touchSprint: false,
    down: () => false, tapped: () => false,
  };
  const mkEnv = (withTerrain) => {
    const moon = {
      id: 'moon', posKm: new Float64Array([0, 0, 0]), radiusKm: R,
      distSurface: 1, landable: true, phys: { gm: 4.9028e3, radiusKm: R },
    };
    return {
      nearest: moon, get: () => moon, baseReady: () => true, phys: () => moon.phys,
      getBodyQuat: () => new THREE.Quaternion(),           // 恒等：世界系 = 体固系
      heightFn: withTerrain ? () => R + MOUNTAIN : undefined,
    };
  };
  // 从平均球面之上 1 km 处朝内飞
  const fly = (withTerrain) => {
    const s = new Ship();
    s.mode = 'fly';
    s.posKm[0] = R + 1; s.vel.set(-0.05, 0, 0);
    for (let i = 0; i < 200; i++) s.update(0.05, idle, mkEnv(withTerrain));
    return Math.hypot(s.posKm[0], s.posKm[1], s.posKm[2]);
  };
  const withT = fly(true), without = fly(false);
  assert.ok(Math.abs(withT - (R + MOUNTAIN + 0.005)) < 0.05,
    `有地形时应停在 ${(R + MOUNTAIN).toFixed(1)} km 的山面，实际 ${withT.toFixed(3)}`);
  assert.ok(without < R + MOUNTAIN - 4,
    `无地形数据时（对照组）会停在平均球面 ${(R + 0.005).toFixed(3)}，即山体内部——` +
    `这正是"可以 5 m 高度穿过山脉"的成因；实际 ${without.toFixed(3)}`);
});
