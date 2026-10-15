// 时间系统测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateToJD, jdToDate, deltaT, deltaTUncertainty, jdUTtoTT, SimClock, J2000 } from '../src/astro/time.js';

/** 某年 1 月 1 日的 JD。注意 Date.UTC 把 0–99 年当作 1900+，故显式用 setUTCFullYear。 */
function jdOfYear(year) {
  const d = new Date(Date.UTC(2000, 0, 1));
  d.setUTCFullYear(year, 0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return dateToJD(d);
}

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

test('SimClock：后台/睡眠恢复后追赶池快速放完而非瞬移', () => {
  const c = new SimClock();
  c.rate = 1; // 实时
  const jd0 = c.jdTT;
  // 模拟系统睡眠 2 小时（_wallMs 回退）
  c._wallMs -= 2 * 3600 * 1000;
  c.tick(0);
  // 新行为：不在单帧瞬移（首帧 dtReal=0 不推进），差额进追赶池
  assert.ok(Math.abs(c.jdTT - jd0) < 1e-12, '恢复首帧不应瞬移');
  // 连续帧以 ≤1000× 快速放完追赶池，最终严格等于 2 小时
  for (let i = 0; i < 20; i++) c.tick(1);
  const expected = jd0 + (2 * 3600) / 86400 + 20 / 86400; // 追赶 2h + 20 帧各 1s 实时
  assert.ok(Math.abs(c.jdTT - expected) < 1e-6, `追赶结束后应精确等于实际流逝，实际差 ${(c.jdTT - expected) * 86400}s`);
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

// ── ΔT 回归：历史回溯曾误用只在 2005–2050 有效的单条多项式 ───────────────────
// 文献值取自 Espenak & Meeus 分段多项式与 IERS 实测（ΔT = TT − UT1，单位秒）。
test('ΔT 历史值：1600 年后与文献值误差 < 1 s', () => {
  const REF = {
    1600: 120, 1700: 9, 1800: 13.7, 1850: 7.1, 1900: -2.79, 1920: 21.2,
    1950: 29.15, 1960: 33.15, 1970: 40.18, 1980: 50.54, 2000: 63.83,
    2010: 66.07, 2020: 69.36, 2026: 69.2,
  };
  for (const [y, expected] of Object.entries(REF)) {
    const got = deltaT(jdOfYear(Number(y)));
    assert.ok(Math.abs(got - expected) < 1,
      `${y} 年 ΔT=${got.toFixed(2)}，文献值 ${expected}，差 ${(got - expected).toFixed(2)}s`);
  }
});

test('ΔT 历史值：修复前的 2005–2050 单式会造成数百秒偏差（回归护栏）', () => {
  // 旧实现对所有 jd < 1972 都套用 62.92 + 0.32217t + 0.005589t²
  const legacy = (year) => { const t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; };
  assert.ok(legacy(1800) - deltaT(jdOfYear(1800)) > 200, '1800 年应修掉 200s 以上的偏差');
  assert.ok(legacy(1900) - deltaT(jdOfYear(1900)) > 80, '1900 年应修掉 80s 以上的偏差');
  // 地球自转对 ΔT 误差的放大：ΔT 差 1 s ≈ 经度差 360/86164 度
  const rotDeg = (legacy(1800) - deltaT(jdOfYear(1800))) * 360 / 86164;
  assert.ok(rotDeg > 0.8, `1800 年地球自转位置曾偏差 ${rotDeg.toFixed(2)}°，应 > 0.8°`);
});

test('ΔT 分段在 1972 年边界连续（闰秒表接续多项式）', () => {
  const before = deltaT(jdOfYear(1972) - 1);
  const after = deltaT(jdOfYear(1972));
  assert.ok(Math.abs(before - after) < 0.2, `边界跳变 ${Math.abs(before - after).toFixed(3)}s`);
});

test('ΔT 无伪不连续（1800–2150 逐日扫描）', () => {
  // ΔT 本身不单调也不平缓：19 世纪地球自转加快，1867 年前后每年下降约 1 s。
  // 真正要守住的不变量是"没有伪不连续"——即相邻日的跳变只允许来自
  // ① 闰秒（+1 s 整）② 分段多项式接缝（< 0.1 s）。
  const jd0 = jdOfYear(1800), jd1 = jdOfYear(2150);
  let prev = deltaT(jd0), worst = 0, worstAt = jd0;
  for (let jd = jd0 + 1; jd <= jd1; jd += 1) {
    const v = deltaT(jd);
    const d = v - prev;
    if (d < -0.1 || d > 1.05) { worst = d; worstAt = jd; break; }
    if (Math.abs(d) > Math.abs(worst)) { worst = d; worstAt = jd; }
    prev = v;
  }
  assert.ok(worst >= -0.1 && worst <= 1.05,
    `JD ${worstAt} (${jdToDate(worstAt).toISOString().slice(0, 10)}) 出现伪跳变 ${worst.toFixed(3)}s`);
});

test('ΔT 远期外推有界并收敛到长期抛物线', () => {
  const u = (2150 - 1820) / 100;
  // jdOfYear(2150) 对应儒略年 2149.998，故留 2 s 余量
  assert.ok(Math.abs(deltaT(jdOfYear(2150)) - (-20 + 32 * u * u)) < 2);
  // 常数外推在 2100 年会偏小几十秒；现在应显著高于 69.184
  assert.ok(deltaT(jdOfYear(2100)) > 100, `2100 年 ΔT=${deltaT(jdOfYear(2100)).toFixed(1)}，常数外推会给出 69.184`);
});

test('ΔT 不确定度：近现代有界，远期显式放大', () => {
  assert.ok(deltaTUncertainty(jdOfYear(2026)) <= 1);
  assert.ok(deltaTUncertainty(jdOfYear(1900)) < 5);
  assert.ok(deltaTUncertainty(jdOfYear(2100)) > 10, '远期必须标注为低置信');
});
