// 星历精度测试：对照 JPL Horizons 离线基准（tests/fixtures.json，2026-06-10 12:00 历元）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planetPosition, PLANETS } from '../src/astro/planets.js';
import { moonGeocentric } from '../src/astro/moon.js';
import { moonLocalPosition } from '../src/astro/moons.js';

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

test('卫星相对母星位置 vs Horizons：角误差 < 0.5°', () => {
  for (const [name, ref] of Object.entries(fix.moonsLocal)) {
    const ours = moonLocalPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 0.5, `${name}: ${d.toFixed(4)}°`);
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
