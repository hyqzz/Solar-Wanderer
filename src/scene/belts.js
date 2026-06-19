// 小行星主带与柯伊伯带（统计分布点云，确定性种子）+ 奥尔特云统计粒子层。
// 注：不渲染黄道尘光/黄道光晕，因为真实宇宙中肉眼不可见此叠加光晕。

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';

function makeBelt({ count, aMinAU, aMaxAU, inclSigmaDeg, color, size, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  for (let i = 0; i < count; i++) {
    const a = (aMinAU + (aMaxAU - aMinAU) * Math.sqrt(rnd())) * KM_PER_AU;
    const th = rnd() * Math.PI * 2;
    const inc = gauss() * inclSigmaDeg * (Math.PI / 180);
    const r = a * (1 + 0.12 * gauss());
    // 世界轴：黄道面为 XZ 平面
    pos[i * 3] = r * Math.cos(th) * Math.cos(inc);
    pos[i * 3 + 1] = r * Math.sin(inc);
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(inc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, transparent: true, opacity,
    depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function createBelts() {
  const group = new THREE.Group();
  // 主带 2.1–3.4 AU
  group.add(makeBelt({
    count: 14000, aMinAU: 2.1, aMaxAU: 3.4, inclSigmaDeg: 9,
    color: 0x9a8e80, size: 1.3, opacity: 0.5, seed: 4242,
  }));
  // 柯伊伯带 32–48 AU
  group.add(makeBelt({
    count: 9000, aMinAU: 32, aMaxAU: 48, inclSigmaDeg: 4,
    color: 0x8fa3b8, size: 1.3, opacity: 0.42, seed: 7777,
  }));

  return group;
}

/**
 * 奥尔特云统计粒子层（纯视觉，无精确轨道）。
 * 内奥尔特云（Hills Cloud）：2000–20000 AU，轻度扁化（盘状）。
 * 外奥尔特云：20000–100000 AU，近球形各向同性。
 * 粒子以日心为中心，注册浮动原点（world.register 调用在 main.js）。
 */
function makeOortShell({ count, rMinAU, rMaxAU, inclSigmaDeg, spherical, color, size, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  for (let i = 0; i < count; i++) {
    // 半径：均匀分布于体积（cbrt(uniform) 给出体积均匀分布）
    const r = (rMinAU + (rMaxAU - rMinAU) * Math.cbrt(rnd())) * KM_PER_AU;
    if (spherical) {
      // 球面均匀分布（外奥尔特云）
      const cosT = rnd() * 2 - 1;
      const sinT = Math.sqrt(1 - cosT * cosT);
      const phi = rnd() * Math.PI * 2;
      pos[i * 3] = r * sinT * Math.cos(phi);
      pos[i * 3 + 1] = r * cosT;
      pos[i * 3 + 2] = r * sinT * Math.sin(phi);
    } else {
      // 盘状分布（内奥尔特云 / Hills Cloud）：低倾角集中
      const th = rnd() * Math.PI * 2;
      const inc = gauss() * inclSigmaDeg * (Math.PI / 180);
      pos[i * 3] = r * Math.cos(th) * Math.cos(inc);
      pos[i * 3 + 1] = r * Math.sin(inc);
      pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(inc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, transparent: true, opacity,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.baseOpacity = opacity;
  return pts;
}

/**
 * 奥尔特云：真实的奥尔特云极其稀疏（万亿天体散布于巨大球壳，肉眼密度近乎为零）。
 * 因此用稀疏、暗淡的粒子做"存在感"暗示，而非密集星场；并随相机进入其内部而淡出，
 * 避免在最外层右键平移时看到"一大片随视角移动的星点"（#5）。
 * 返回 { group, update(dSunAU) }。
 */
export function createOortCloud() {
  const group = new THREE.Group();
  const shells = [];

  // 内奥尔特云（Hills Cloud）：2000–20000 AU。真实奥尔特云整体近似球形，仅存在
  // 一个相对赤道面的微弱累积（而非盘状低圆柱）；这里用球面分布 + 赤道外概率轻微降低
  // 来近似，避免相机内部看时呈现“扁平环带”的出戏形状。
  const inner = makeOortShell({
    count: 1400, rMinAU: 2000, rMaxAU: 20000,
    inclSigmaDeg: 30, spherical: true,
    color: 0x8ca8c8, size: 1.1, opacity: 0.20, seed: 31415,
  });
  // 外奥尔特云：20000–100000 AU，近球形，各向同性
  const outer = makeOortShell({
    count: 2600, rMinAU: 20000, rMaxAU: 100000,
    spherical: true,
    color: 0x7090b0, size: 1.0, opacity: 0.14, seed: 27183,
  });
  group.add(inner); group.add(outer);
  shells.push(inner, outer);
  group.frustumCulled = false;

  function update(dSunAU) {
    // 在云外（内太阳系）远观时正常显示；进入云内部后逐渐减弱到很低（真实极稀疏），
    // 使最外层不再呈现"密集且随平移移动的星场"。
    let f;
    if (dSunAU < 1000) f = 1;
    else if (dSunAU < 60000) f = 1 - 0.78 * ((dSunAU - 1000) / 59000);
    else f = 0.22;
    for (const sh of shells) sh.material.opacity = sh.userData.baseOpacity * f;
  }

  return { group, update };
}
