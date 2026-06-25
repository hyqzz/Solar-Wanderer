// 行星星历：JPL《Approximate Positions of the Planets》(E.M. Standish) 开普勒元素表，
// 有效期 1800 AD – 2050 AD，精度约角分级。元素相对黄道 J2000（mean ecliptic and equinox of J2000）。
// a(AU)  e  I(deg)  L(deg)  ϖ(deg)  Ω(deg)，第二行为每儒略世纪变化率。
//
// 高精度模式（issue #55）：可切换到 VSOP87 截断版（±3000 年 < 0.1°），
// 默认仍用 Standish 元素（快速、测试基准）。

import { elementsToEcliptic } from './kepler.js';
import { centuriesTT } from './time.js';
import { moonGeocentric } from './moon.js';
import { planetaryPositionVSOP } from './vsop87.js';

const TABLE = {
  mercury: {
    el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  },
  emb: { // 地月系质心
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
  pluto: {
    el: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  },
};

export const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** 月球质量 / (地+月质量)，用于由地月质心推得地心 */
const MOON_MASS_FRACTION = 1 / 82.300577 / (1 + 1 / 82.300577);

/**
 * 高精度星历开关：true = VSOP87（±3000 年 < 0.1°），false = Standish 元素（默认）。
 * Standish 元素在 1800–2050 年内精度足够且计算更快，是测试基准；
 * VSOP87 用于需要长时段外推或更高精度的场景（如 #55）。
 */
let useHighPrecision = false;

/** 切换星历源：true→VSOP87，false→Standish（默认） */
export function setHighPrecision(v) { useHighPrecision = !!v; }
/** 当前是否使用 VSOP87 高精度星历 */
export function isHighPrecision() { return useHighPrecision; }

/** 由元素表直接求位置（不含地球特殊处理） */
function tablePosition(key, jdTT) {
  const T = centuriesTT(jdTT);
  const { el, rate } = TABLE[key];
  return elementsToEcliptic({
    aAU: el[0] + rate[0] * T,
    e: el[1] + rate[1] * T,
    iDeg: el[2] + rate[2] * T,
    LDeg: el[3] + rate[3] * T,
    periDeg: el[4] + rate[4] * T,
    nodeDeg: el[5] + rate[5] * T,
  });
}

/**
 * 行星日心黄道 J2000 坐标（km）。
 * 默认 Standish 元素；开启高精度后用 VSOP87（±3000 年 < 0.1°）。
 * 地球 = 地月质心 − 月球地心矢量 × 月球质量占比。
 */
export function planetPosition(name, jdTT) {
  // VSOP87 高精度路径
  if (useHighPrecision) {
    if (name === 'earth') {
      // VSOP87 给出地月质心 (EMB)，需扣除月球分量得到地心
      const emb = planetaryPositionVSOP('earth', jdTT);
      const m = moonGeocentric(jdTT);
      return {
        x: emb.x - m.x * MOON_MASS_FRACTION,
        y: emb.y - m.y * MOON_MASS_FRACTION,
        z: emb.z - m.z * MOON_MASS_FRACTION,
      };
    }
    return planetaryPositionVSOP(name, jdTT);
  }

  // Standish 元素路径（默认，测试基准）
  if (name === 'earth') {
    const emb = tablePosition('emb', jdTT);
    const m = moonGeocentric(jdTT);
    return {
      x: emb.x - m.x * MOON_MASS_FRACTION,
      y: emb.y - m.y * MOON_MASS_FRACTION,
      z: emb.z - m.z * MOON_MASS_FRACTION,
    };
  }
  return tablePosition(name, jdTT);
}

/** 轨道周期（儒略年），由 L 变化率推得，用于轨道线采样 */
export function orbitalPeriodYears(name) {
  const key = name === 'earth' ? 'emb' : name;
  return 360 / (TABLE[key].rate[3] / 100);
}

/**
 * 轨道线采样：当前时刻起一整圈（按当前元素冻结），返回 n 个点的 km 坐标数组。
 */
export function orbitPoints(name, jdTT, n = 512) {
  const key = name === 'earth' ? 'emb' : name;
  const T = centuriesTT(jdTT);
  const { el, rate } = TABLE[key];
  const base = {
    aAU: el[0] + rate[0] * T,
    e: el[1] + rate[1] * T,
    iDeg: el[2] + rate[2] * T,
    LDeg: el[3] + rate[3] * T,
    periDeg: el[4] + rate[4] * T,
    nodeDeg: el[5] + rate[5] * T,
  };
  const pts = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = elementsToEcliptic({ ...base, LDeg: base.periDeg + (i / (n - 1)) * 360 });
    pts[i * 3] = p.x;
    pts[i * 3 + 1] = p.y;
    pts[i * 3 + 2] = p.z;
  }
  return pts;
}
