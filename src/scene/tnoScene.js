// 海王星外天体（TNO）场景：小球体网格 + 远距光点 + 轨道线，每帧从 tno.js 星历驱动。
// 与行星使用相同的 createPlanetMaterial 以获得太阳方向光照暗适应补偿（R7 #4）。

import * as THREE from 'three';
import { TNO_IDS, TNO_DATA, tnoPosition, tnoOrbitPoints } from '../astro/tno.js';
import { createPlanetMaterial } from './planetMaterial.js';
import { proceduralMap } from './proceduralTextures.js';
import { eclToWorldArr } from '../config.js';
import { QUALITY } from '../engine/quality.js';

const KM_PER_AU = 149597870.7;

/** 远距光点：TNO 在 AU 尺度看是点光源 */
function makeGlint(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  return sp;
}

/** 轨道颜色：冷蓝灰，区别于行星橙黄轨道 */
const ORBIT_COLOR = 0x6680aa;

/**
 * 创建所有 TNO 场景实体，注册浮动原点，返回 entries 与每帧 update。
 * @param {THREE.Scene} scene
 * @param {World} world  浮动原点管理器
 * @param {THREE.Group} orbitLinesGroup  轨道线组（sun.group 子级，含日心坐标）
 * @returns {{ entries: Map<id, entry>, update(jdTT, shipPosKm) }}
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

    // 远距光点
    const glint = makeGlint(0xb0c8e0);
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

      // 远距光点尺寸与淡出
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      e.glint.scale.setScalar(dist * 0.004);
      e.glint.material.opacity =
        THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 300) - 1) * 0.7, 0, 0.8);
    }
  }

  return { entries, update };
}
