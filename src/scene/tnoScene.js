// 海王星外天体（TNO）场景：彗星式柔光头（远距主视觉，调色板着色）+ 近距球体网格 + 轨道线。
// 每帧从 tno.js 星历驱动；与彗星渲染逻辑一致（柔和加性辉光精灵），远距始终可见（#6）。

import * as THREE from 'three';
import { TNO_IDS, TNO_DATA, tnoPosition, tnoOrbitPoints } from '../astro/tno.js';
import { createPlanetMaterial } from './planetMaterial.js';
import { createRings } from './rings.js';
import { proceduralMapLazy } from './proceduralTextures.js';
import { eclToWorldArr } from '../config.js';
import { J2000 } from '../astro/time.js';
import { QUALITY } from '../engine/quality.js';

const KM_PER_AU = 149597870.7;

/** 调色板 → 辉光 RGB（0–255）。冷暗天体偏蓝灰，红色天体偏橙。 */
const PALETTE_GLOW = {
  mars:   [255, 170, 110], // 红橙（Sedna、共工星等）
  pluto:  [235, 205, 185], // 粉白（创神星）
  ice:    [170, 215, 255], // 冰蓝（妊神星、亡神星）
  triton: [185, 230, 255], // 青白
  dark:   [190, 170, 140], // 暗棕红（鸟神星、变形星）
  gray:   [200, 205, 220], // 中性冷白（默认）
};

/** 彗星式柔光头：内亮核 + 外扩弥散光晕（加性混合），按调色板着色。 */
function makeGlowSprite(palette) {
  const [r, g, b] = PALETTE_GLOW[palette] ?? PALETTE_GLOW.gray;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  // 外层弥散光晕（类彗发）
  const g1 = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g1.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  g1.addColorStop(0.22, `rgba(${r},${g},${b},0.45)`);
  g1.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
  g1.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 64, 64);
  // 内亮核（白色高光，模拟反射太阳光的点源）
  const g2 = ctx.createRadialGradient(32, 32, 0, 32, 32, 7);
  g2.addColorStop(0, 'rgba(255,255,255,0.95)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

/** 轨道颜色：冷蓝灰，区别于行星橙黄轨道 */
const ORBIT_COLOR = 0x6680aa;

/**
 * 创建所有 TNO 场景实体，注册浮动原点，返回 entries 与每帧 update。
 */
export function createTNOScene(scene, world, orbitLinesGroup) {
  const entries = new Map();
  const segLo = QUALITY.segLo ?? [24, 12];

  for (const id of TNO_IDS) {
    const d = TNO_DATA[id];
    const group = new THREE.Group();

    // 球体网格：分辨率适中（TNO 不可登陆，无需精细地形）
    const seg = Math.max(16, segLo[0]);
    const geo = new THREE.SphereGeometry(d.radiusKm, seg, Math.round(seg / 2));
    const tex = proceduralMapLazy(id, d.palette ?? 'gray', 512, 256);
    const mat = createPlanetMaterial({ map: tex, detailMode: 0, radiusKm: d.radiusKm });
    const mesh = new THREE.Mesh(geo, mat);
    // 三轴椭球：把单位球按半轴比例缩放（几何半径仍是 radiusKm，
    // 于是物理/标签用的等体积球与渲染出的形状体积一致）。
    if (d.axes) {
      const [a, b, c] = d.axes;
      const R = d.radiusKm;
      mesh.scale.set(a / R, c / R, b / R);   // 体固系 +Y 为极轴（最短轴）
    }
    group.add(mesh);
    // 环：妊神星（Ortiz 2017）与创神星（Morgado 2023）都有实测环，说明里也写了。
    // 不渲染的话就是"说明与画面矛盾"——用户会去找那颗环。
    let ringMesh = null;
    if (d.rings) {
      ringMesh = createRings({ rings: d.rings, radiusKm: d.radiusKm }, null);
      mesh.add(ringMesh);
    }

    // 彗星式柔光头（远距主视觉，始终叠加在球体之上）
    const glint = makeGlowSprite(d.palette ?? 'gray');
    group.add(glint);

    const posKm = new Float64Array(3);
    world.register(posKm, group);
    scene.add(group);

    // 轨道线（仅对直径 >200 km 的天体显示）
    let orbitLine = null;
    if (d.radiusKm >= 100) {
      const pts = tnoOrbitPoints(id, 192);
      const arr = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 3) {
        const w = eclToWorldArr({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
        arr[i] = w[0]; arr[i + 1] = w[1]; arr[i + 2] = w[2];
      }
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      orbitLine = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
        color: ORBIT_COLOR, transparent: true, opacity: 0.18, fog: false,
      }));
      orbitLine.userData.isOrbit = true;
      orbitLine.userData.baseOpacity = 0.18;
      orbitLine.frustumCulled = false;
      orbitLine.visible = false; // 默认关闭（由 main.js KeyK 控制，#4）
      orbitLinesGroup.add(orbitLine);
    }

    entries.set(id, { id, phys: d, posKm, group, mesh, mat, glint, orbitLine, ringMesh });
  }

  const _sunDir = new THREE.Vector3();
  let skyFadeF = 1; // 白昼大气内辉光标记淡出（真实 TNO ≥17 等，白昼绝不可见）

  // 光速（km/天）：光行时视位置修正（与 builder 一致）
  const C_KM_PER_DAY = 299792.458 * 86400;

  // 实测自转周期（小时）。只收有可靠观测的；没有的保持静止——
  // 宁可不转，也不拿猜的数假装它转。
  const TNO_ROT_HOURS = {
    pluto: 153.29, eris: 15.77, haumea: 3.92, makemake: 22.83, quaoar: 17.68,
    orcus: 13.19, sedna: 10.27, varuna: 6.34, ixion: 12.4, salacia: 6.09,
    az84: 6.76, ms4: 7.33, varda: 5.91, gonggong: 22.4, huya: 17.1,
  };
  function update(jdTT, shipPosKm) {
    for (const [id, e] of entries) {
      // 位置（含光行时回退：相机看到 t − d/c 时刻的位置；shipPosKm 为世界系 km）
      let jdUse = jdTT;
      if (shipPosKm) {
        let ecl0 = tnoPosition(id, jdTT);
        for (let k = 0; k < 2; k++) {
          const w0 = eclToWorldArr(ecl0);
          const d = Math.hypot(w0[0] - shipPosKm[0], w0[1] - shipPosKm[1], w0[2] - shipPosKm[2]);
          jdUse = jdTT - d / C_KM_PER_DAY;
          ecl0 = tnoPosition(id, jdUse);
        }
      }
      const ecl = tnoPosition(id, jdUse);
      const w = eclToWorldArr(ecl);
      e.posKm[0] = w[0]; e.posKm[1] = w[1]; e.posKm[2] = w[2];

      // 太阳方向 + 辐照度（暗适应补偿同行星，R7 #4）
      const dKm = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const dAU = Math.max(dKm / KM_PER_AU, 1e-6);
      _sunDir.set(-e.posKm[0] / dKm, -e.posKm[1] / dKm, -e.posKm[2] / dKm);
      // 与其余天体同一条曝光律：纯反平方，不做 d>1 时的 ^0.55 压缩。
      // 曝光 = 0.75·d² 会把它乘回来，于是表面亮度只由反照率决定。
      const sunI = 1 / (dAU * dAU);
      const u = e.mat.userData.uniforms;
      u.uSunDir.value.copy(_sunDir);
      u.uSunI.value = sunI;
      // 环的受光：环系需要太阳方向与辐照度；顺带给出环面法向（等于自转轴）
      if (e.ringMesh) {
        const ru = e.ringMesh.material?.uniforms;
        if (ru?.uSunDir) { ru.uSunDir.value.copy(_sunDir); ru.uSunI.value = sunI; }
        if (ru?.uRingNormal) ru.uRingNormal.value.set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
      }

      // 自转：此前整颗 TNO **完全不转**（tnoScene 里没有任何 rotation 赋值），
      // 而信息面板写着妊神星"自转周期仅 3.9 小时"、伐楼那"6.3 小时自转带来
      // 明显光变"——说明与画面直接矛盾。按实测周期绕极轴旋转。
      const rotH = TNO_ROT_HOURS[id];
      if (rotH > 0) {
        const ang = ((jdTT - J2000) * 24 / rotH) % 1 * Math.PI * 2;
        e.mesh.rotation.y = ang;
      }

      // 彗星式辉光头：保持 ~恒定屏幕尺寸，远距始终可见，近距淡出让球体接管
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      // 尺度：视角尺寸约 0.6°（dist*0.006），并保证不小于天体本身视半径的若干倍以形成光晕
      e.glint.scale.setScalar(Math.max(dist * 0.006, e.phys.radiusKm * 6));
      // 不透明度：远距常驻，接近天体（< 半径×60）时淡出，避免糊住表面。
      // 再加**距离与相位**调制：此前任何日心距、任何相位角下都一样亮，
      // 于是冥王星与赛德娜（30 AU 对 90 AU）在天空里看上去一样。
      // 通量 ∝ (1/d²)·相位函数；以 40 AU 为基准归一，保底 0.25 保证仍能找到。
      const dAUg = Math.max(dKm / 149597870.7, 1e-3);
      const flux = Math.min(1, (40 / dAUg) * (40 / dAUg));
      // 相位角 α（太阳—天体—观测者）：cos α = (toSun·toCam)/(|toSun||toCam|)。
      // 这里 e.posKm 是**日心**坐标（太阳在原点），相机在 shipPosKm。
      let cosPhase = 1;
      if (shipPosKm) {
        const tsx = -e.posKm[0], tsy = -e.posKm[1], tsz = -e.posKm[2];
        const tcx = shipPosKm[0] - e.posKm[0];
        const tcy = shipPosKm[1] - e.posKm[1];
        const tcz = shipPosKm[2] - e.posKm[2];
        const ls = Math.hypot(tsx, tsy, tsz), lc = Math.hypot(tcx, tcy, tcz);
        if (ls > 0 && lc > 0) {
          cosPhase = Math.max(-1, Math.min(1, (tsx * tcx + tsy * tcy + tsz * tcz) / (ls * lc)));
        }
      }
      const phase = 0.25 + 0.75 * Math.max(0, cosPhase);
      e.glint.material.opacity =
        THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 60) - 0.3), 0, 1)
        * 0.85 * skyFadeF * (0.35 + 0.65 * flux) * phase;
      // 球体：仅在较近时渲染（远距纯辉光头，省填充率且更像彗星点光）
      e.mesh.visible = dist < e.phys.radiusKm * 900;
    }
  }

  return {
    entries,
    update,
    /** 白昼大气内辉光标记淡出（与星空淡出同一阈值） */
    setSkyFade(f) { skyFadeF = f > 0.4 ? 1 : 0; },
  };
}
