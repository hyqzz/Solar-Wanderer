// 无气天体 Hapke 风化层 BRDF 的物理回归。
//
// 这里用 JS 镜像着色器里的公式，锁定的是"应有的物理行为"；
// 另一组断言检查 GLSL 源码确实含这些项，防止公式被改坏或漏转录。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAPKE_PARAMS } from '../src/astro/bodies.js';

/** 与 src/scene/planetMaterial.js 中 uHapke 分支逐项对应的镜像实现 */
function hapkeShade({ w, B0, h, g }, mu0, mu, ca) {
  const alpha = Math.acos(Math.max(-1, Math.min(1, ca)));
  const B = B0 / (1 + Math.tan(alpha * 0.5) / Math.max(h, 1e-4));
  const denom = 1 + g * g + 2 * g * ca;
  const P = (1 - g * g) / Math.pow(Math.max(denom, 1e-4), 1.5);
  const sq = Math.sqrt(Math.max(1 - w, 1e-4));
  const H0 = (1 + 2 * mu0) / (1 + 2 * mu0 * sq);
  const H1 = (1 + 2 * mu) / (1 + 2 * mu * sq);
  const r = (w / (4 * Math.PI)) * (mu0 / Math.max(mu0 + mu, 1e-4))
    * ((1 + B) * P + H0 * H1 - 1);
  return Math.max(0, Math.min(4, r * Math.PI / Math.max(w, 1e-3)));
}

// 星下点在相位角 α 处：观察者正对表面（μ=1），太阳与法线夹角即 α（μ0=cos α）。
// 这是唯一"太阳—表面—观察者"三者都可实现的标准几何，也是卫星测光讨论相位曲线的惯用取法。
const atPhase = (p, deg) => {
  const ca = Math.cos(deg * Math.PI / 180);
  return hapkeShade(p, Math.max(ca, 0), 1, ca);
};

test('冲日增亮：相位角从 0° 拉开时亮度陡降（月面最显著的裸眼特征）', () => {
  for (const id of ['moon', 'mercury', 'phobos', 'callisto', 'europa', 'iapetus']) {
    const p = HAPKE_PARAMS[id];
    const r30 = atPhase(p, 0) / atPhase(p, 30);
    const r60 = atPhase(p, 0) / atPhase(p, 60);
    assert.ok(r30 > 1.3, `${id}: 0°/30° 亮度比仅 ${r30.toFixed(2)}，冲日效应过弱`);
    assert.ok(r30 < 4, `${id}: 0°/30° 亮度比 ${r30.toFixed(2)}，被放大到不物理`);
    assert.ok(r60 > 2.2 && r60 < 12, `${id}: 0°/60° 亮度比 ${r60.toFixed(2)} 超出合理范围`);
  }
});

test('反照率越高冲日效应越弱（暗风化层 vs 亮冰的物理排序）', () => {
  const moon = atPhase(HAPKE_PARAMS.moon, 0) / atPhase(HAPKE_PARAMS.moon, 30);
  const enceladus = atPhase(HAPKE_PARAMS.enceladus, 0) / atPhase(HAPKE_PARAMS.enceladus, 30);
  assert.ok(moon > enceladus * 1.5,
    `暗风化层（月球 ${moon.toFixed(2)}）应比亮冰（土卫二 ${enceladus.toFixed(2)}）的冲日效应强得多`);
  // 满月处不应被归一化放大到比原有 Lambert 明显更亮
  assert.ok(atPhase(HAPKE_PARAMS.moon, 0) < 1.4, '满月处亮度不应超过 Lambert 的 1.4 倍');
});

test('相位曲线在 0–90° 内单调下降，且 90° 处归零', () => {
  const p = HAPKE_PARAMS.moon;
  const vals = [0, 1, 2, 5, 10, 20, 40, 60, 89].map((d) => atPhase(p, d));
  for (let i = 1; i < vals.length; i++) {
    assert.ok(vals[i] < vals[i - 1], `相位角增大时亮度必须单调下降（第 ${i} 点）`);
  }
  assert.ok(atPhase(p, 90) < 1e-9, `α=90°（晨昏线）必须趋于零，实际 ${atPhase(p, 90)}`);
});

test('夜侧与掠射角行为正确：无入射光时为零，掠射时趋于零', () => {
  const p = HAPKE_PARAMS.moon;
  assert.equal(hapkeShade(p, 0, 1, 1), 0, 'μ0=0 时必须为零（晨昏线）');
  assert.equal(hapkeShade(p, -0.5, 1, 1), 0, '背光面必须为零');
  const graze = hapkeShade(p, 0.02, 1, 0.02);
  assert.ok(graze < 0.05, `掠射角亮度 ${graze.toFixed(4)} 应接近 0`);
});

test('参数表覆盖全部无气天体，取值在物理范围内', () => {
  const airless = ['mercury', 'pluto', 'moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede',
    'callisto', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'iapetus', 'miranda',
    'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'charon'];
  for (const id of airless) {
    const p = HAPKE_PARAMS[id];
    assert.ok(p, `${id} 缺少 Hapke 参数`);
    assert.ok(p.w > 0 && p.w < 1, `${id}.w 越界: ${p.w}`);
    assert.ok(p.B0 >= 0 && p.B0 < 3, `${id}.B0 越界: ${p.B0}`);
    assert.ok(p.h > 0 && p.h < 0.5, `${id}.h 越界: ${p.h}`);
    assert.ok(p.g > -1 && p.g < 0, `${id}.g 应为后向散射（负值）: ${p.g}`);
  }
});

test('着色器源码确实实现了 Hapke（防止公式被改坏或漏转录）', () => {
  const src = readFileSync(new URL('../src/scene/planetMaterial.js', import.meta.url), 'utf8');
  for (const frag of ['uHapke', 'uB0', 'uHh', 'uHg',
    '(1.0 + B) * P + H0 * H1 - 1.0',   // 主体式
    'uB0 / (1.0 + tan(alpha * 0.5)',   // 冲日项
    '1.0 + gg * gg + 2.0 * gg * ca']) { // HG 相函数
    assert.ok(src.includes(frag), `着色器缺少：${frag}`);
  }
  // 必须真的替代了 Lambert，而不是叠加
  assert.ok(/float shade = max\(ndl, 0\.0\);/.test(src), '缺少 shade 的 Lambert 缺省值');
  assert.ok(/vec3 col = albedo \* shade \* uSunI/.test(src), '主着色行未改用 shade');
});
