// 太阳活动周期：由**实测**的周期极值年表插值，而不是从 J2000 起算的正弦。
//
// 旧写法是 0.5 + 0.3·sin((jd − J2000)/(365.25×11)·2π)。周期长度接近，
// 但**相位与真实太阳周差了 3–4 年**：它把极大放在 2005.5 / 2016.5 / 2027.5，
// 而实测第 23 周极大在 2000.3、第 24 周在 2014.3、第 25 周在 2024.9——
// 于是"此刻太阳活动"经常落在真实周期的下行段甚至极小附近。
// 太阳活动调制极光强度与日冕，相位错了就谈不上"此刻的太阳系"。
//
// 数据：SILSO / NOAA 的 13 个月平滑黑子数（周期极小年、极大年、极大值）。

/** [极小年, 极大年, 极大时的 13 个月平滑黑子数] */
const CYCLES = [
  [1933.7, 1937.4, 119.2],
  [1944.0, 1947.4, 151.8],
  [1954.2, 1958.2, 201.3],   // 有记录以来最强
  [1964.9, 1968.9, 110.6],
  [1976.5, 1979.9, 164.5],
  [1986.8, 1989.6, 158.5],
  [1996.4, 2000.3, 120.8],
  [2008.9, 2014.3, 81.9],    // 百年最弱
  [2019.9, 2024.9, 144.0],
];
/** 归一化基准：有记录以来最强周期的极大值 */
const REFERENCE_MAX = 201.3;
/** 下一个极小（第 26 周期）的预报年——超出实测范围时用它收尾 */
const NEXT_MIN_YEAR = 2030.5;

/** 把年份换成"距 J2000 的儒略年"以便与模拟时钟对齐 */
const J2000_YEAR = 2000.0;

/**
 * 太阳活动强度 0..1（相对有记录以来最强周期的极大值）。
 *
 * 上升段与下降段都用余弦形插值——这是太阳周的标准经验形状：
 * 极小附近平缓、极大附近也平缓，中间最陡。线性插值会让活动度在极值处出现折角。
 *
 * @param {number} jdTT 儒略日（TT）
 */
export function solarActivityAt(jdTT) {
  const year = J2000_YEAR + (jdTT - 2451545.0) / 365.25;
  if (year <= CYCLES[0][0]) return 0.05;
  for (let i = 0; i < CYCLES.length; i++) {
    const [minY, maxY, maxV] = CYCLES[i];
    const peak = maxV / REFERENCE_MAX;
    if (year < minY) continue;
    if (year <= maxY) {
      // 上升段：极小 → 极大
      const u = (year - minY) / Math.max(maxY - minY, 0.1);
      return 0.05 + (peak - 0.05) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    const nextMinY = i + 1 < CYCLES.length ? CYCLES[i + 1][0] : NEXT_MIN_YEAR;
    if (year <= nextMinY) {
      // 下降段：极大 → 下一个极小
      const u = (year - maxY) / Math.max(nextMinY - maxY, 0.1);
      return 0.05 + (peak - 0.05) * (0.5 + 0.5 * Math.cos(Math.PI * u));
    }
  }
  return 0.05;
}

/** 供测试与诊断：周期极值表（只读副本） */
export const SOLAR_CYCLE_EXTREMA = CYCLES.map((c) => [...c]);
