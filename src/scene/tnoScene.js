// 海王星外天体（TNO）场景：彗星式柔光头（远距主视觉，调色板着色）+ 近距球体网格 + 轨道线。
// 每帧从 tno.js 星历驱动；与彗星渲染逻辑一致（柔和加性辉光精灵），远距始终可见（#6）。

import * as THREE from 'three';
import { TNO_IDS, TNO_DATA, tnoPosition, tnoOrbitPoints } from '../astro/tno.js';
import { createPlanetMaterial } from './planetMaterial.js';
import { proceduralMap } from './proceduralTextures.js';
import { eclToWorldArr } from '../config.js';
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
    const tex = proceduralMap(id, d.palette ?? 'gray', 512, 256);
    const mat = createPlanetMaterial({ map: tex, detailMode: 0, radiusKm: d.radiusKm });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

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
      orbitLine.frustumCulled = false;
      orbitLine.visible = false; // 默认关闭（由 main.js KeyK 控制，#4）
      orbitLinesGroup.add(orbitLine);
    }

    entries.set(id, { id, phys: d, posKm, group, mesh, mat, glint, orbitLine });
  }

  const _sunDir = new THREE.Vector3();

  function update(jdTT, shipPosKm) {
    for (const [id, e] of entries) {
      // 位置
      const ecl = tnoPosition(id, jdTT);
      const w = eclToWorldArr(ecl);
      e.posKm[0] = w[0]; e.posKm[1] = w[1]; e.posKm[2] = w[2];

      // 太阳方向 + 辐照度（暗适应补偿同行星，R7 #4）
      const dKm = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const dAU = Math.max(dKm / KM_PER_AU, 1e-6);
      _sunDir.set(-e.posKm[0] / dKm, -e.posKm[1] / dKm, -e.posKm[2] / dKm);
      const sunIRaw = 1 / (dAU * dAU);
      const sunI = sunIRaw >= 1 ? sunIRaw : Math.pow(sunIRaw, 0.55);
      const u = e.mat.userData.uniforms;
      u.uSunDir.value.copy(_sunDir);
      u.uSunI.value = sunI;

      // 彗星式辉光头：保持 ~恒定屏幕尺寸，远距始终可见，近距淡出让球体接管
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      // 尺度：视角尺寸约 0.6°（dist*0.006），并保证不小于天体本身视半径的若干倍以形成光晕
      e.glint.scale.setScalar(Math.max(dist * 0.006, e.phys.radiusKm * 6));
      // 不透明度：远距常驻（0.85），接近天体（< 半径×60）时淡出，避免糊住表面
      e.glint.material.opacity =
        THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 60) - 0.3), 0, 1) * 0.85;
      // 球体：仅在较近时渲染（远距纯辉光头，省填充率且更像彗星点光）
      e.mesh.visible = dist < e.phys.radiusKm * 900;
    }
  }

  return { entries, update };
}
