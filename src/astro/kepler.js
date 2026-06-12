// 开普勒轨道力学：开普勒方程求解与轨道根数 → 黄道直角坐标。

export const DEG = Math.PI / 180;
export const KM_PER_AU = 149597870.7;

/** 归一化角度到 [-π, π) */
export function wrapPI(a) {
  a = a % (2 * Math.PI);
  if (a >= Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** 归一化角度到 [0, 360) 度 */
export function wrap360(deg) {
  deg = deg % 360;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * 解开普勒方程 M = E − e·sinE。
 * 牛顿迭代为主；高离心率不收敛时退化为二分法兜底。
 * @param {number} M 平近点角 (rad)
 * @param {number} e 离心率 [0,1)
 * @returns {number} 偏近点角 E (rad)
 */
export function solveKepler(M, e) {
  M = wrapPI(M);
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-13) return E;
  }
  // 二分兜底（理论上极少触发）
  let lo = M - e, hi = M + e;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid - e * Math.sin(mid) - M > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 经典轨道根数 → 日心黄道 J2000 直角坐标（km）。
 * @param {object} el { aAU, e, iDeg, LDeg, periDeg(ϖ), nodeDeg(Ω) }
 */
export function elementsToEcliptic(el) {
  const { aAU, e, iDeg, LDeg, periDeg, nodeDeg } = el;
  const omega = (periDeg - nodeDeg) * DEG; // 近点幅角 ω
  const M = (LDeg - periDeg) * DEG;        // 平近点角
  const E = solveKepler(M, e);

  // 轨道面坐标（近点方向为 x'）
  const xp = aAU * (Math.cos(E) - e);
  const yp = aAU * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(nodeDeg * DEG), sO = Math.sin(nodeDeg * DEG);
  const ci = Math.cos(iDeg * DEG), si = Math.sin(iDeg * DEG);

  const x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;

  return { x: x * KM_PER_AU, y: y * KM_PER_AU, z: z * KM_PER_AU };
}
