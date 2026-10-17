// 座舱与飞船外形。
//
// 为什么需要：这是"身临其境"最大的一块空缺——飞了这么久，画面里始终找不到
// "自己"。没有座舱框，视野就是一台无实体的相机；没有外部模型，第三人称无从谈起。
//
// 尺度约定：**本文件的几何用米**，并且不乘任何缩放——它由 main.js 放进一个
// 独立的叠加场景、用一个米制的独立相机渲染。
// 为什么不能直接放进主场景：主相机的近平面会随最近天体动态调整（实测飞到
// 2.2R 时 near=5849 km），座舱在 0.6 m 处会被整块裁掉。

import * as THREE from 'three';

/** 座舱：贴在相机上的一副框（第一人称）。
 *  尺寸**每帧按当前 FOV 与宽高比重算**——写死宽高比时，窗口一变或机体一滚，
 *  框就大半跑出画面（第一版正是这样，屏幕上只剩左下角一个角）。
 *  Z 固定 0.62m：框在相机前方，开口略大于画面，于是四条边框落在屏幕边缘上。 */
export function createCockpit() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x565d68, roughness: 0.55, metalness: 0.35, emissive: 0x14181d, fog: false,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xb8bec8, roughness: 0.3, metalness: 0.9, fog: false,
  });
  const Z = -0.62;
  const mk = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const top = mk(1, 0.05, 0.09, mat);
  const bottom = mk(1, 0.20, 0.14, mat);
  const left = mk(0.06, 1, 0.09, mat);
  const right = mk(0.06, 1, 0.09, mat);
  const trimT = mk(1, 0.010, 0.010, trimMat);
  const trimL = mk(0.010, 1, 0.010, trimMat);
  const trimR = mk(0.010, 1, 0.010, trimMat);
  const glow = new THREE.MeshBasicMaterial({ color: 0x2f6f8f, fog: false });
  const panels = [0, 1, 2].map(() => mk(0.16, 0.026, 0.006, glow));
  group.add(top, bottom, left, right, trimT, trimL, trimR, ...panels);

  /** 按当前 FOV/宽高比布局。fovV 是竖直视场角（度）。 */
  group.userData.layout = (fovV, aspect) => {
    const halfH = Math.tan(fovV * Math.PI / 360) * -Z;   // 画面在 Z 处的半高
    const halfW = halfH * aspect;
    // 框**必须压在画面边缘之内**：放在画面外时整条框都落在视锥之外，
    // 只剩滚转时偶尔扫进来的一角（第一版的实测现象）。0.93 让框条跨越屏幕边。
    const oy = halfH * 0.93, ox = halfW * 0.93;
    top.position.set(0, oy, Z); top.scale.x = ox * 2 + 0.20;
    bottom.position.set(0, -oy - 0.10, Z); bottom.scale.x = ox * 2 + 0.20;
    left.position.set(-ox, 0, Z); left.scale.y = oy * 2 + 0.30;
    right.position.set(ox, 0, Z); right.scale.y = oy * 2 + 0.30;
    trimT.position.set(0, oy - 0.030, Z + 0.006); trimT.scale.x = ox * 2 + 0.04;
    trimL.position.set(-ox + 0.030, 0, Z + 0.006); trimL.scale.y = oy * 2 + 0.04;
    trimR.position.set(ox - 0.030, 0, Z + 0.006); trimR.scale.y = oy * 2 + 0.04;
    panels.forEach((p, i) => p.position.set(-0.24 + i * 0.24, -oy - 0.045, Z + 0.004));
  };
  group.userData.layout(58, 1.6);
  group.renderOrder = 2;
  group.userData.isCockpit = true;
  return group;
}

/** 飞船外形（第三人称）。简化但成比例：长 ~9m 的升力体 + 两个推进段 + 尾焰。 */
export function createShipModel() {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color: 0xb9bec6, roughness: 0.38, metalness: 0.85, fog: false,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x33373d, roughness: 0.55, metalness: 0.6, fog: false,
  });
  // 机身：八面体拉长（前尖后宽），比盒子更像飞行器
  const bodyGeo = new THREE.OctahedronGeometry(0.55, 0);
  bodyGeo.scale(1.0, 1.0, 4.2);
  group.add(new THREE.Mesh(bodyGeo, hull));
  // 机翼/散热片
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.1), dark);
  wing.position.set(0, -0.05, 0.6);
  group.add(wing);
  // 两具推进器
  for (const x of [-0.42, 0.42]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.9, 12), dark);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(x, -0.02, 2.4);
    group.add(eng);
  }
  // 尾焰：加色锥体，长度随推力（由 update 调整）
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x7fc8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 10, 1, true), flameMat);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0, 3.3);
  group.add(flame);
  group.scale.setScalar(1.6);   // 整体放大到 ~14m，入画更清楚
  group.userData.isShipModel = true;
  group.userData.flame = flame;
  return group;
}

/**
 * 航天服头盔框（行走模式）。
 *
 * 与飞行座舱同一目的：让画面里有一个"我在其中"的边界。行走时视野边缘是
 * 一层低饱和的盔内壁 + 一条细面窗边框，底部两角有一对戴手套的手。
 * 不追求细节——过度建模反而会抢走地面本身的注意力。
 */
export function createHelmet() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0x7a828c, roughness: 0.8, metalness: 0.12, emissive: 0x0d1015, fog: false,
    side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xd8dde4, roughness: 0.4, metalness: 0.45, fog: false,
  });
  const Z = -0.42;
  const mk = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const top = mk(1, 0.03, 0.05, trim);
  const bottom = mk(1, 0.06, 0.06, trim);
  const left = mk(0.035, 1, 0.05, trim);
  const right = mk(0.035, 1, 0.05, trim);
  // 盔内壁：四块略微内倾的板，形成"被包裹"的感觉
  const wallL = mk(0.25, 1.4, 0.02, shell);
  const wallR = mk(0.25, 1.4, 0.02, shell);
  const wallB = mk(1.4, 0.22, 0.02, shell);
  group.add(top, bottom, left, right, wallL, wallR, wallB);

  // 两只手套：底部两角，暗色、略比盔壁亮
  const glove = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8, roughness: 0.85, metalness: 0.05, fog: false,
  });
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), glove);
  const handR = handL.clone();
  group.add(handL, handR);

  group.userData.layout = (fovV, aspect) => {
    const halfH = Math.tan(fovV * Math.PI / 360) * -Z;
    const halfW = halfH * aspect;
    const oy = halfH * 0.90, ox = halfW * 0.94;
    top.position.set(0, oy, Z); top.scale.x = ox * 2 + 0.10;
    bottom.position.set(0, -oy, Z); bottom.scale.x = ox * 2 + 0.10;
    left.position.set(-ox, 0, Z); left.scale.y = oy * 2 + 0.10;
    right.position.set(ox, 0, Z); right.scale.y = oy * 2 + 0.10;
    wallL.position.set(-halfW - 0.10, 0, Z + 0.02);
    wallR.position.set(halfW + 0.10, 0, Z + 0.02);
    wallB.position.set(0, -halfH - 0.10, Z + 0.02);
    handL.position.set(-halfW * 0.62, -halfH * 0.72, Z + 0.06);
    handR.position.set(halfW * 0.62, -halfH * 0.72, Z + 0.06);
  };
  group.userData.layout(58, 1.6);
  group.renderOrder = 2;
  group.userData.isHelmet = true;
  return group;
}
