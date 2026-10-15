// 星历精度测试：对照 JPL Horizons 离线基准（tests/fixtures.json）
//
// 基准历元由 tools/make-fixtures.mjs 生成，与 tools/fit-moons.mjs 的拟合历元同步。
// 卫星的解析模型是"密切根数 + 线性长期率"，精度随离拟合历元的距离退化——
// 因此基准同时记录历元点与 +180 天点，把退化变成被追踪的数字而不是藏在宽容差里。
// 正确顺序：npm run fit-moons → node tools/make-fixtures.mjs → npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planetPosition, PLANETS } from '../src/astro/planets.js';
import { moonGeocentric } from '../src/astro/moon.js';
import { moonLocalPosition, moonOrbitNormal, MOON_IDS } from '../src/astro/moons.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));

function angleDeg(a, b) {
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b[0], b[1], b[2]);
  const dot = (a.x * b[0] + a.y * b[1] + a.z * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

test('九大天体日心位置 vs JPL Horizons：角误差 < 0.1°', () => {
  for (const name of PLANETS) {
    const ref = fix.planets[name];
    const ours = planetPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 0.1, `${name}: ${d.toFixed(4)}°`);
  }
});

test('行星日心距离 vs Horizons：相对误差 < 0.1%', () => {
  for (const name of PLANETS) {
    const ref = fix.planets[name];
    const ours = planetPosition(name, ref.jdTDB);
    const rO = Math.hypot(ours.x, ours.y, ours.z);
    const rR = Math.hypot(...ref.pos);
    assert.ok(Math.abs(rO - rR) / rR < 1e-3, `${name}: ${(Math.abs(rO - rR) / rR * 100).toFixed(4)}%`);
  }
});

test('月球地心位置 vs Horizons：角误差 < 0.5°，距离 < 1%', () => {
  const ours = moonGeocentric(fix.moonGeo.jdTDB);
  const d = angleDeg(ours, fix.moonGeo.pos);
  assert.ok(d < 0.5, `角误差 ${d.toFixed(4)}°`);
  const rO = Math.hypot(ours.x, ours.y, ours.z);
  const rR = Math.hypot(...fix.moonGeo.pos);
  assert.ok(Math.abs(rO - rR) / rR < 0.01);
});

test('卫星相对母星位置 vs Horizons：拟合历元处角误差 < 0.02°', () => {
  for (const [name, ref] of Object.entries(fix.moonsLocal)) {
    const ours = moonLocalPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 0.02, `${name}: ${d.toFixed(4)}°`);
  }
});

test('卫星解析模型的已知退化：离历元 180 天角误差 < 3°（记录而非隐藏）', () => {
  // 这是解析回退路径的能力上限，不是"越界可以接受"：
  // 在 JPL 采样窗口（2026-06-01…2027-10-01）内运行时走的是采样插值，精度 <0.001°。
  // 本测试只约束"窗口外/加载失败时"的兜底质量，并防止它悄悄退化。
  const degraded = fix.moonsLocalDegraded ?? {};
  for (const [name, ref] of Object.entries(degraded)) {
    const ours = moonLocalPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 3, `${name} @ +${fix.degradeDays}d: ${d.toFixed(4)}°`);
  }
});

test('轨道法向不变量：必须与位置矢量垂直（r̂·n̂ ≈ 0）', () => {
  // 法向与位置必须来自同一个函数。历史上月球的位置走 Meeus、法向却走另有一条
  // 拟合根数，导致"位置对、姿态错"，且越出采样窗口越严重（2035 年偏离 4.5°）。
  const probe = fix.moonGeo?.jdTDB ?? 2461200.5;
  for (const id of MOON_IDS) {
    const onGrid = [probe, probe + 400, probe + 1600, probe + 3600];
    for (const jd of onGrid) {
      const r = id === 'moon' ? moonGeocentric(jd) : moonLocalPosition(id, jd);
      const rl = Math.hypot(r.x, r.y, r.z) || 1;
      const n = moonOrbitNormal(id, jd);
      const c = Math.abs((r.x * n.x + r.y * n.y + r.z * n.z) / rl);
      assert.ok(c < 0.02, `${id} @ JD ${jd.toFixed(1)}: |r̂·n̂| = ${c.toFixed(4)}`);
    }
  }
});

test('外推边界：1800/2050 年计算不发散、有限', () => {
  for (const jd of [2378497, 2469807]) { // ~1800年 / ~2050年
    for (const name of PLANETS) {
      const p = planetPosition(name, jd);
      assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.z), `${name} @ ${jd}`);
    }
  }
});

test('时间倒退：负方向计算正常（1969-07-20 阿波罗11）', () => {
  const jd = 2440423.0;
  const e = planetPosition('earth', jd);
  const r = Math.hypot(e.x, e.y, e.z) / 149597870.7;
  assert.ok(r > 0.98 && r < 1.02, `地球日距 ${r} AU`);
});
