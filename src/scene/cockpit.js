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

// ── 行走时的 EVA 服（第一人称身体）────────────────────────────────────────
//
// 为什么需要：飞行模式有座舱框、有第三人称飞船，而行走模式此前**画面里没有
// 自己**——只有一圈 CSS 晕影。真实的第一人称临场感很大一部分来自"余光里的
// 身体"：低头能看到胸口、抬手能看到手套、走路时手臂在画面下缘摆动。
//
// 实现放在叠加层（overlayScene）：它与主场景的浮动原点/近平面无关，姿态直接
// 跟头部（行走时 ship.quat 就是头部朝向），不需要处理世界坐标。
//
// 位置是**按 FOV 布局**的：不同 FOV/宽高比下手臂要留在画面下缘而不是跑到中间，
// 所以给出 layout(fov, aspect) 而不是写死坐标。
export function createEvaSuit() {
  const root = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.82, metalness: 0.04, fog: false });
  const glove = new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 0.5, metalness: 0.18, fog: false });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd8802a, roughness: 0.55, metalness: 0.12, fog: false });

  const limb = (a, b, r, mat) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.002), 5, 12), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return m;
  };

  // 体固系（相对头部）：-Z 是正前方，+Y 上。尺度假定为"眼睛在原点"的人体。
  // 关节位置要按**可见性**反推：fov 58° 时，深度 z 处画面的下缘在
  // y = -z·tan(29°) ≈ -0.554z。手自然垂在身侧（眼睛下方 0.5m）是永远看不到的，
  // 所以刻意把小臂/手套抬到画面下缘之上——这是"第一人称手部"的通用做法，
  // 上臂留在画面外，转头时才会露出来。
  const JOINTS = {
    shoulder: (s) => new THREE.Vector3(s * 0.24, -0.30, 0.12),
    elbow: (s) => new THREE.Vector3(s * 0.30, -0.26, -0.14),
    wrist: (s) => new THREE.Vector3(s * 0.27, -0.21, -0.40),
  };
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const sh = JOINTS.shoulder(s), el = JOINTS.elbow(s), wr = JOINTS.wrist(s);
    arm.add(limb(sh, el, 0.068, fabric));
    arm.add(limb(el, wr, 0.055, fabric));
    // 腕环：EMU 的标志性橙色压力环，也是"这是航天服"最快的识别特征
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.011, 6, 16), accent);
    ring.position.copy(wr);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), el.clone().sub(wr).normalize());
    arm.add(ring);
    // 手套：朝前下方伸，指尖略微内收（真实手在身前的自然姿态）
    const tip = new THREE.Vector3(s * 0.22, -0.155, -0.60);
    const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.050, 0.11, 5, 12), glove);
    const gd = tip.clone().sub(wr).normalize();
    g.position.copy(wr).addScaledVector(gd, 0.075);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), gd);
    arm.add(g);
    root.add(arm);
    arms.push({ arm, base: arm.position.clone(), s });
  }

  let phase = 0, bob = 0;
  /** dt: 秒；speedKmS: 行走速度（km/s）；walking: 是否有移动输入；submerged: 是否在水下 */
  root.userData.update = (dt, speedKmS = 0, walking = false, submerged = false) => {
    // 步频与 audio.js 的脚步声同源（常速 ~1.2Hz，冲刺 ~2.5Hz），视觉与听觉同拍
    const speedNorm = Math.min(speedKmS / 0.009, 1);
    const freq = walking ? 1.2 + speedNorm * 1.3 : 0.22;   // 站立时是缓慢的呼吸
    phase += dt * freq * Math.PI * 2;
    const amp = walking ? 0.010 + speedNorm * 0.010 : 0.0016;
    bob += ((walking ? 1 : 0) - bob) * Math.min(dt * 3, 1);
    for (const { arm, base, s } of arms) {
      // 手臂前后交替摆动 + 轻微上下，相位差 π
      const sw = Math.sin(phase + (s > 0 ? Math.PI : 0));
      arm.position.set(
        base.x + sw * amp * 0.5 * bob,
        base.y + Math.abs(sw) * amp * 0.7 * bob,
        base.z - sw * amp * 2.2 * bob);
      arm.rotation.x = sw * 0.05 * bob;
      arm.rotation.z = -s * (0.02 + 0.03 * bob);
    }
    // 水下：整体轻微上浮感（失重/浮力），并压暗（水下没有直射光）
    root.position.y = submerged ? Math.sin(phase * 0.35) * 0.006 : 0;
    root.visible = true;
  };

  /** 按当前 FOV/宽高比把手臂留在画面下缘（避免宽屏时跑到画面中间） */
  root.userData.layout = (fov, aspect) => {
    const halfH = Math.tan((fov * Math.PI / 180) / 2);
    const k = THREE.MathUtils.clamp(halfH / Math.tan((58 * Math.PI / 180) / 2), 0.7, 1.5);
    // 宽屏时视口横向更宽，手臂按比例外移，保持"在画面两下角"的构图
    const ax = Math.min(Math.max(aspect / 1.7, 0.85), 1.35);
    for (const { arm, base } of arms) {
      arm.position.set(base.x * ax, base.y * k, base.z * k);
    }
  };

  // 整体缩小一点：真机上手臂在画面里是"余光里的存在"，占满两角反而像举着两根
  // 管子。0.82 之后只在下缘露出一截前臂与手套，接近头盔内的实际视野占比。
  root.scale.setScalar(0.82);
  root.userData.layout(58, 1.7);
  return root;
}
