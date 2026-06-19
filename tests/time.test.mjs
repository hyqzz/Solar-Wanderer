// 时间系统测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateToJD, jdToDate, deltaT, jdUTtoTT, SimClock, J2000 } from '../src/astro/time.js';

test('J2000 历元：2000-01-01T12:00Z → JD 2451545.0', () => {
  assert.ok(Math.abs(dateToJD(new Date('2000-01-01T12:00:00Z')) - J2000) < 1e-9);
});

test('JD 往返转换一致', () => {
  const d = new Date('2026-06-10T08:30:00Z');
  assert.ok(Math.abs(jdToDate(dateToJD(d)).getTime() - d.getTime()) < 2);
});

test('ΔT 在 2026 年约 69~71 秒', () => {
  const dt = deltaT(dateToJD(new Date('2026-06-10T00:00:00Z')));
  assert.ok(dt > 67 && dt < 73, `ΔT=${dt}`);
});

test('TT > UT（地球力学时超前）', () => {
  const jd = dateToJD(new Date());
  assert.ok(jdUTtoTT(jd) > jd);
});

test('SimClock：倍率推进与暂停', () => {
  const c = new SimClock();
  const jd0 = c.jdTT;
  c.rate = 86400; // 1天/秒
  c.tick(1);
  assert.ok(Math.abs(c.jdTT - jd0 - 1) < 1e-9, '1秒推进1天');
  c.paused = true;
  c.tick(100);
  assert.ok(Math.abs(c.jdTT - jd0 - 1) < 1e-9, '暂停不走时');
  c.paused = false;
  c.rate = -86400;
  c.tick(2);
  assert.ok(Math.abs(c.jdTT - jd0 + 1) < 1e-9, '负倍率倒退');
});

test('SimClock.setNow 接近系统时间', () => {
  const c = new SimClock();
  const now = jdUTtoTT(dateToJD(new Date()));
  assert.ok(Math.abs(c.jdTT - now) < 1e-5);
});

test('SimClock：后台/睡眠恢复后按完整挂钟时间追赶', () => {
  const c = new SimClock();
  c.rate = 1; // 实时
  const jd0 = c.jdTT;
  // 模拟系统睡眠 2 小时（_wallMs 回退）
  c._wallMs -= 2 * 3600 * 1000;
  c.tick(0);
  // 应推进 2 小时，而不是被限制在 60 秒
  const expected = jd0 + (2 * 3600) / 86400;
  assert.ok(Math.abs(c.jdTT - expected) < 1e-9, `睡眠 2h 后应推进 2h，实际差 ${(c.jdTT - jd0) * 86400}s`);
});

test('SimClock：暂停时不追赶挂钟时间', () => {
  const c = new SimClock();
  c.rate = 86400;
  c.paused = true;
  const jd0 = c.jdTT;
  c._wallMs -= 3600 * 1000;
  c.tick(0);
  assert.ok(Math.abs(c.jdTT - jd0) < 1e-9, '暂停时不应推进');
});

test('星历有效范围判断', () => {
  const c = new SimClock();
  assert.equal(c.inHighAccuracyRange(), true);
  c.jdTT = J2000 + 80 * 365.25; // 2080年
  assert.equal(c.inHighAccuracyRange(), false);
});
