// 行星自转：IAU/WGCCRE 自转模型（极轴 RA/Dec + 本初子午线角 W = W0 + Ẇ·d）。
// 保证“此刻哪个半球朝向太阳、晨昏线在哪”物理正确。
// 卫星统一按潮汐锁定处理（z=轨道法向，本初子午线指向母行星），与真实情况一致。
//
// 坐标链：体固系 --IAU--> 赤道J2000(ICRF) --黄赤交角--> 黄道J2000 --M--> three世界系
// 其中 M:(x,y,z)→(x,z,−y)（绕X轴−90°），网格本地系与体固系同样经 M 相容
// （three SphereGeometry 展开：本初子午线=本地+X，北极=+Y，东经向−Z）。

import { DEG } from './kepler.js';
import { J2000 } from './time.js';

/** 黄赤交角 J2000 */
export const OBLIQUITY = 23.43928 * DEG;

// IAU 2009/2015 自转常数（角度制；d=J2000起天数, T=儒略世纪）
// [RA0, RAdot(/T), Dec0, Decdot(/T), W0, Wdot(/d)]
export const IAU_ROTATION = {
  sun:     [286.13, 0, 63.87, 0, 84.176, 14.1844000],
  mercury: [281.0097, -0.0328, 61.4143, -0.0049, 329.5469, 6.1385025],
  venus:   [272.76, 0, 67.16, 0, 160.20, -1.4813688],
  earth:   [0.00, -0.641, 90.00, -0.557, 190.147, 360.9856235],
  mars:    [317.68143, -0.1061, 52.88650, -0.0609, 176.630, 350.89198226],
  jupiter: [268.056595, -0.006499, 64.495303, 0.002413, 284.95, 870.5360000],
  saturn:  [40.589, -0.036, 83.537, -0.004, 38.90, 810.7939024],
  uranus:  [257.311, 0, -15.175, 0, 203.81, -501.1600928],
  neptune: [299.36, 0, 43.46, 0, 253.18, 536.3128492],
  pluto:   [132.993, 0, -6.163, 0, 302.695, 56.3625225],
};

const cos = Math.cos, sin = Math.sin;

/** 3x3 矩阵工具（行优先 9 元数组） */
function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const Rx = (t) => [1, 0, 0, 0, cos(t), sin(t), 0, -sin(t), cos(t)];   // v' = Rx(t)·v（绕X转坐标系）
const Rz = (t) => [cos(t), sin(t), 0, -sin(t), cos(t), 0, 0, 0, 1];

export function applyMat(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}
export function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/**
 * 体固系 → 黄道J2000 的旋转矩阵。
 * ICRF→体固 = Rz(W)·Rx(90°−Dec)·Rz(90°+RA)，取逆得体固→ICRF，再左乘 Rx(−ε) 转黄道。
 */
export function bodyToEclipticMatrix(bodyId, jdTT) {
  const p = IAU_ROTATION[bodyId];
  if (!p) return null;
  const d = jdTT - J2000;
  const T = d / 36525;
  const RA = (p[0] + p[1] * T) * DEG;
  const Dec = (p[2] + p[3] * T) * DEG;
  const W = (p[4] + p[5] * d) * DEG;
  const icrfToBody = matMul(Rz(W), matMul(Rx(Math.PI / 2 - Dec), Rz(Math.PI / 2 + RA)));
  const bodyToIcrf = transpose(icrfToBody);
  // 赤道→黄道：本文件 Rx 为被动（坐标系旋转）矩阵，赤道系绕 x 轴转 +ε 得黄道系
  return matMul(Rx(OBLIQUITY), bodyToIcrf);
}

/** 自转轴（北极）方向，黄道J2000 单位矢量 */
export function poleEcliptic(bodyId, jdTT) {
  const m = bodyToEclipticMatrix(bodyId, jdTT);
  return { x: m[2], y: m[5], z: m[8] }; // 体固 z 轴的像
}

/**
 * 日下点经纬度（行星坐标，度）— 用于精度测试。
 * @param {object} sunDirEcl 从行星指向太阳的单位矢量（黄道J2000）
 */
export function subsolarPoint(bodyId, jdTT, sunDirEcl) {
  const eclToBody = transpose(bodyToEclipticMatrix(bodyId, jdTT));
  const s = applyMat(eclToBody, sunDirEcl);
  const lon = Math.atan2(s.y, s.x) / DEG;        // 东经为正
  const lat = Math.asin(Math.max(-1, Math.min(1, s.z))) / DEG;
  return { lon, lat };
}

/**
 * 潮汐锁定卫星的体固→黄道矩阵：z=轨道法向 nHat，本初子午线(+x)指向母行星。
 * @param {object} nHat 轨道法向（黄道J2000）
 * @param {object} toParent 卫星指向母行星的单位矢量
 */
export function tidalLockMatrix(nHat, toParent) {
  // x = 指向母星在轨道面内的投影
  let dot = toParent.x * nHat.x + toParent.y * nHat.y + toParent.z * nHat.z;
  let x = { x: toParent.x - dot * nHat.x, y: toParent.y - dot * nHat.y, z: toParent.z - dot * nHat.z };
  const len = Math.hypot(x.x, x.y, x.z) || 1;
  x = { x: x.x / len, y: x.y / len, z: x.z / len };
  const y = { // y = z × x
    x: nHat.y * x.z - nHat.z * x.y,
    y: nHat.z * x.x - nHat.x * x.z,
    z: nHat.x * x.y - nHat.y * x.x,
  };
  // 列向量为体固基矢的像 → 行优先矩阵
  return [x.x, y.x, nHat.x, x.y, y.y, nHat.y, x.z, y.z, nHat.z];
}
