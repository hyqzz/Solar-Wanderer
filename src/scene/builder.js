// 场景装配：加载贴图（manifest 感知，缺失自动程序化兜底），创建太阳/行星/卫星
// 网格、云层、大气、行星环、轨道线，并提供每帧的星历驱动更新。

import * as THREE from 'three';
import { BODIES, MOON_PHYS } from '../astro/bodies.js';
import { planetPosition, PLANETS, orbitPoints } from '../astro/planets.js';
import { moonGeocentric } from '../astro/moon.js';
import { moonLocalPosition, moonOrbitNormal, moonOrbitPoints, MOON_IDS } from '../astro/moons.js';
import { bodyToEclipticMatrix, tidalLockMatrix } from '../astro/rotation.js';
import { eclToWorldArr, eclToWorld, eclMatrixToWorldQuat, KM_PER_AU } from '../config.js';
import { createPlanetMaterial, createCloudMaterial } from './planetMaterial.js';
import { QUALITY } from '../engine/quality.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';
import { createSun } from './sun.js';
import { proceduralMap, proceduralBands } from './proceduralTextures.js';
import { HeightField } from './terrain.js';

/** 不规则小天体（土豆状）：用与行走碰撞同源的 HeightField 变形球网格
 * （视觉=碰撞严格一致；三轴椭球 + 噪声起伏，R9-2c 火卫一/二等） */
function deformIrregular(mesh, id, phys) {
  const hf = new HeightField(id, phys);
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const h = hf.height(v);
    pos.setXYZ(i, v.x * h, v.y * h, v.z * h);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

const ORBIT_COLORS = {
  mercury: 0x8a8a8a, venus: 0xc9a06a, earth: 0x4a90d9, mars: 0xd96a4a,
  jupiter: 0xc9a06a, saturn: 0xd9c97a, uranus: 0x7ad9d9, neptune: 0x4a6ad9, pluto: 0x9a8aa9,
};

// Issue #29：极光模式映射（0=无 1=地球 2=木星 3=土星 4=海卫一）
// 地球：极地卵形圈 OI 557.7nm 绿光；海卫一：弱氮极光。
// 木星/土星已移除：发射累积 auroraL += aColor*auroraInt*ds 中 ds 为 km，
// 气巨大气壳跨度数千 km，累积辐亮度被 ACES 压成白色 → 两极整块刷白盖掉云带贴图。
const AURORA_MODE = { earth: 1, triton: 4 };

// Issue #27：火星太阳黄经 Ls 计算。
// Ls=0 为火星北半球春分；2024-05-08（JD 2460418）为最近一次 Ls=0 时刻。
// 火星年 686.98 地球日；Ls 随轨道位置线性增长（近似，忽略轨道离心率）。
const MARS_YEAR_DAYS = 686.98;
const MARS_LS_EPOCH = 2460418.0;
const GAS_BAND_COLORS = {
  jupiter: [[200, 170, 130], [240, 225, 200], [170, 130, 95], [225, 200, 170], [150, 110, 80]],
  saturn: [[225, 205, 165], [240, 230, 200], [205, 180, 140], [230, 215, 185]],
  uranus: [[155, 205, 215], [175, 220, 228], [145, 195, 208]],
  neptune: [[60, 90, 200], [80, 120, 220], [50, 80, 180], [90, 140, 230]],
};

async function loadTextures(onProgress) {
  let manifest = {};
  try {
    manifest = await (await fetch('textures/manifest.json')).json();
  } catch { /* 离线/无清单 → 全部程序化 */ }
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const wanted = new Set();
  const collect = (t) => { if (t) Object.values(t).forEach((v) => typeof v === 'string' && wanted.add(v)); };
  Object.values(BODIES).forEach((b) => { collect(b.textures); if (b.rings?.texture) wanted.add(b.rings.texture); });
  Object.values(MOON_PHYS).forEach((m) => collect(m.textures));
  wanted.add('milkyway.jpg');

  let done = 0;
  const tasks = [...wanted].map((file) => new Promise((resolve) => {
    if (!manifest[file]) { done++; resolve(); return; }
    loader.load(
      'textures/' + file,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = QUALITY.anisotropy;
        cache.set(file, tex);
        onProgress?.(++done, wanted.size, file);
        resolve();
      },
      undefined,
      () => { onProgress?.(++done, wanted.size, file); resolve(); } // 失败→兜底
    );
  }));
  await Promise.all(tasks);
  return cache;
}

/** 贴图或程序化兜底 */
function texOf(cache, file, bodyId, phys) {
  if (file && cache.has(file)) return cache.get(file);
  if (phys?.type === 'gas' || phys?.type === 'ice') {
    return proceduralBands(bodyId, GAS_BAND_COLORS[bodyId] ?? GAS_BAND_COLORS.jupiter);
  }
  return proceduralMap(bodyId, phys?.surface?.palette ?? 'gray');
}

function sphereGeo(radiusKm, big) {
  const [wHi, hHi] = QUALITY.segHi;
  const [wLo, hLo] = QUALITY.segLo;
  return new THREE.SphereGeometry(radiusKm, big ? wHi : wLo, big ? hHi : hLo);
}

/** 片元程序化细节模式：气巨/冰巨=2（湍流+临边昏暗），可登陆岩质=1，低档=0 */
function detailModeOf(phys) {
  if (!QUALITY.detail) return 0;
  if (phys.type === 'gas' || phys.type === 'ice') return 2;
  return phys.landable ? 1 : 0;
}

export async function buildSolarSystem(scene, world, onProgress) {
  const cache = await loadTextures(onProgress);
  const bodies = new Map();
  const orbitLines = new THREE.Group();
  scene.add(orbitLines);

  // ---------- 太阳 ----------
  const sunPhys = BODIES.sun;
  const sun = createSun(sunPhys.radiusKm, texOf(cache, 'sun.jpg', 'sun', sunPhys));
  const sunEntry = {
    id: 'sun', phys: sunPhys, isMoon: false, parentId: null,
    group: sun.group, mesh: sun.mesh, posKm: new Float64Array(3),
  };
  // 太阳点光源（物理上太阳是光源本身；行星用自定义着色器，光源供地形 StandardMaterial 用）
  const sunLight = new THREE.PointLight(0xfff2e0, 1, 0, 0);
  sun.group.add(sunLight);
  scene.add(sun.group);
  world.register(sunEntry.posKm, sun.group);
  bodies.set('sun', sunEntry);

  // ---------- 行星 ----------
  for (const id of PLANETS) {
    const phys = BODIES[id];
    const group = new THREE.Group();
    const visualMapFile = phys.textures?.clouds && phys.textures?.cloudsOpaque
      ? phys.textures.clouds : phys.textures?.map;
    // Issue #26：提前解析云层贴图，同时传给行星材质（地表投影）与云层网格
    const cloudFile = phys.textures?.clouds && !phys.textures.cloudsOpaque && cache.has(phys.textures.clouds)
      ? phys.textures.clouds : null;
    const cloudTex = cloudFile ? cache.get(cloudFile) : null;
    const mat = createPlanetMaterial({
      map: texOf(cache, visualMapFile, id, phys),
      nightMap: phys.textures?.night ? cache.get(phys.textures.night) ?? null : null,
      oceanSpec: !!phys.surface?.ocean,
      ringShadow: phys.rings ? {
        tex: phys.rings.texture ? cache.get(phys.rings.texture) ?? null : null,
        innerKm: phys.rings.innerKm, outerKm: phys.rings.outerKm,
      } : null,
      detailMode: detailModeOf(phys),
      radiusKm: phys.radiusKm,
      bodyId: id,       // Issue #26/#27/#28/#36：天体特定效果
      cloudTex,         // Issue #26：地球云层地表投影
    });
    const mesh = new THREE.Mesh(sphereGeo(phys.radiusKm, true), mat);
    // 可登陆天体不施加扁率缩放（保证地形碰撞与视觉一致；岩质行星扁率<0.6%不可辨）
    if (!phys.landable) mesh.scale.y = 1 - (phys.oblateness ?? 0);
    group.add(mesh);

    const entry = {
      id, phys, isMoon: false, parentId: 'sun', group, mesh,
      posKm: new Float64Array(3), mat,
    };

    // 云层（地球；金星云已作为主贴图）
    if (cloudTex) {
      const cmat = createCloudMaterial(cloudTex);
      const cmesh = new THREE.Mesh(sphereGeo(phys.radiusKm * 1.0035, true), cmat);
      cmesh.renderOrder = 10;
      mesh.add(cmesh);
      entry.cloudMesh = cmesh;
      entry.cloudMat = cmat;
    }

    if (phys.atmosphere) {
      const atmo = createAtmosphere(phys, AURORA_MODE[id] ?? 0);
      group.add(atmo);
      entry.atmoMesh = atmo;
    }

    if (phys.rings) {
      const rtex = phys.rings.texture ? cache.get(phys.rings.texture) ?? null : null;
      const rings = createRings(phys, rtex);
      mesh.add(rings);
      entry.ringMesh = rings;
    }

    // 远距可见光点（行星在 AU 距离上的"亮星"观感）
    const glint = makeGlint(0xfff6e8);
    group.add(glint);
    entry.glint = glint;

    // 轨道线（日心；当前时刻元素冻结一整圈，长期漂移可忽略）
    const jdNow = Date.now() / 86400000 + 2440587.5;
    const pts = orbitPoints(id, jdNow, 512);
    const arr = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) {
      const w = eclToWorldArr({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
      arr[i] = w[0]; arr[i + 1] = w[1]; arr[i + 2] = w[2];
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const oline = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
      color: ORBIT_COLORS[id], transparent: true, opacity: 0.3, fog: false,
    }));
    sun.group.add(oline);
    orbitLines.userData[id] = oline;
    oline.userData.isOrbit = true;

    scene.add(group);
    world.register(entry.posKm, group);
    bodies.set(id, entry);
  }

  // ---------- 卫星 ----------
  for (const id of MOON_IDS) {
    const phys = MOON_PHYS[id];
    const fullPhys = { ...phys, id, type: 'moon' };
    // Issue #29：海卫一有极薄 N2 大气（~1.4 Pa），原数据未含 atmosphere。
    // 仅为极光渲染创建最小壳层：散射系数极低（太空不可见），仅极光帘幕可见。
    if (id === 'triton' && !fullPhys.atmosphere) {
      fullPhys.atmosphere = {
        heightKm: 20, rayleighScaleKm: 5, mieScaleKm: 5,
        rayleigh: [1e-9, 1e-9, 1e-9], mie: 1e-9, mieG: 0.5, multiplier: 0.01,
      };
    }
    const group = new THREE.Group();
    const mat = createPlanetMaterial({
      map: texOf(cache, phys.textures?.map, id, fullPhys),
      detailMode: detailModeOf(fullPhys),
      radiusKm: phys.radiusKm,
      bodyId: id, // Issue #36：海卫一等天体的季节/极光效果
    });
    const big = phys.radiusKm > 1000;
    const mesh = new THREE.Mesh(sphereGeo(phys.radiusKm, big), mat);
    if (phys.shape?.dims) deformIrregular(mesh, id, fullPhys);
    group.add(mesh);

    const entry = {
      id, phys: fullPhys, isMoon: true, parentId: phys.parent, group, mesh,
      posKm: new Float64Array(3), mat,
    };

    if (phys.atmosphere) {
      const atmo = createAtmosphere(fullPhys, AURORA_MODE[id] ?? 0);
      group.add(atmo);
      entry.atmoMesh = atmo;
    }

    const glint = makeGlint(0xd8e2f0);
    group.add(glint);
    entry.glint = glint;

    // 卫星轨道线：挂在母行星组（局部坐标随母星平移）
    const pts = moonOrbitPoints(id, 192);
    const arr = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) {
      const w = eclToWorldArr({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
      arr[i] = w[0]; arr[i + 1] = w[1]; arr[i + 2] = w[2];
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const oline = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
      color: 0x7a8a9a, transparent: true, opacity: 0.25, fog: false,
    }));
    bodies.get(phys.parent).group.add(oline);
    oline.userData.isOrbit = true;
    orbitLines.userData[id] = oline;

    scene.add(group);
    world.register(entry.posKm, group);
    bodies.set(id, entry);
  }

  // ---------- 每帧更新 ----------
  const _q = new THREE.Quaternion();
  const _sunDir = new THREE.Vector3();
  const _pole = new THREE.Vector3(); // Issue #36：自转轴世界方向（计算日下点纬度）

  function update(jdTT) {
    // Issue #27/#29/#36：全局季节量（每帧一次，所有天体共享）
    // 火星太阳黄经 Ls（度，0-360）
    let ls = ((jdTT - MARS_LS_EPOCH) / MARS_YEAR_DAYS * 360) % 360;
    if (ls < 0) ls += 360;
    // 太阳活动：11 年周期近似（调制极光强度）
    const solarActivity = 0.5 + 0.3 * Math.sin((jdTT - 2451545.0) / (365.25 * 11) * Math.PI * 2);
    // 火星尘暴强度（Ls 180-360 风暴季）
    const marsDust = Math.max(0,
      THREE.MathUtils.smoothstep(ls, 180, 220) * (1 - THREE.MathUtils.smoothstep(ls, 330, 360)));
    // 极光强度（移动端/降档时关闭）
    const auroraStrength = QUALITY.detail ? 1.0 : 0.0;

    for (const [id, e] of bodies) {
      if (id === 'sun') {
        const m = bodyToEclipticMatrix('sun', jdTT);
        eclMatrixToWorldQuat(m, e.mesh.quaternion);
        continue;
      }
      // 位置
      let ecl;
      if (!e.isMoon) {
        ecl = planetPosition(id, jdTT);
      } else if (id === 'moon') {
        const ep = planetPosition('earth', jdTT);
        const mg = moonGeocentric(jdTT);
        ecl = { x: ep.x + mg.x, y: ep.y + mg.y, z: ep.z + mg.z };
      } else {
        const pp = planetPosition(e.parentId, jdTT);
        const ml = moonLocalPosition(id, jdTT);
        ecl = { x: pp.x + ml.x, y: pp.y + ml.y, z: pp.z + ml.z };
      }
      const w = eclToWorldArr(ecl);
      e.posKm[0] = w[0]; e.posKm[1] = w[1]; e.posKm[2] = w[2];

      // 姿态
      if (!e.isMoon) {
        const m = bodyToEclipticMatrix(id, jdTT);
        eclMatrixToWorldQuat(m, e.mesh.quaternion);
      } else {
        // 潮汐锁定：z=轨道法向，本初子午线指向母星
        const local = id === 'moon' ? moonGeocentric(jdTT) : moonLocalPosition(id, jdTT);
        const L = Math.hypot(local.x, local.y, local.z) || 1;
        const toParent = { x: -local.x / L, y: -local.y / L, z: -local.z / L };
        const nHat = moonOrbitNormal(id);
        eclMatrixToWorldQuat(tidalLockMatrix(nHat, toParent), e.mesh.quaternion);
      }

      // 光照 uniform：太阳方向与辐照度
      const dKm = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const dAU = Math.max(dKm / KM_PER_AU, 1e-6);
      _sunDir.set(-e.posKm[0] / dKm, -e.posKm[1] / dKm, -e.posKm[2] / dKm);
      // 人眼暗适应补偿（R7 #4，SpaceEngine 观感）：辐照低于地球时按 I^0.55 部分提亮，
      // 仅作用于太阳光照通道（星空/曝光不受影响）；地球处 =1、内太阳系不变
      const sunIRaw = 1 / (dAU * dAU);
      const sunI = sunIRaw >= 1 ? sunIRaw : Math.pow(sunIRaw, 0.55);
      if (e.mat) {
        e.mat.userData.uniforms.uSunDir.value.copy(_sunDir);
        e.mat.userData.uniforms.uSunI.value = sunI;
        if (e.phys.rings) {
          // 环面法向 = 行星自转轴（世界系）
          e.mat.userData.uniforms.uRingNormal.value
            .set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
        }
      }
      if (e.cloudMat) {
        e.cloudMat.userData.uniforms.uSunDir.value.copy(_sunDir);
        e.cloudMat.userData.uniforms.uSunI.value = sunI;
      }
      if (e.atmoMesh) {
        const u = e.atmoMesh.material.userData.uniforms;
        u.uSunDir.value.copy(_sunDir);
        u.uSunI.value = 13 * (e.phys.atmosphere.multiplier ?? 1) * sunI;
        // 扁率求交用自转轴（世界系，R8 #1）
        u.uAxis.value.set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
      }
      if (e.ringMesh) {
        const u = e.ringMesh.material.userData.uniforms;
        u.uSunDir.value.copy(_sunDir);
        u.uSunI.value = sunI;
      }
      // === Issue #27/#29/#36：季节/极光 uniforms ===
      // 日下点纬度 = arcsin(sunDir · poleAxis)，决定冰冠大小与极昼极夜范围
      _pole.set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
      const subsolarLat = Math.asin(
        THREE.MathUtils.clamp(_sunDir.dot(_pole), -1, 1)) * 180 / Math.PI;
      if (e.mat) {
        const u = e.mat.userData.uniforms;
        u.uLs.value = ls;
        u.uSubsolarLat.value = subsolarLat;
        u.uSolarActivity.value = solarActivity;
      }
      if (e.atmoMesh) {
        const u = e.atmoMesh.material.userData.uniforms;
        u.uSolarActivity.value = solarActivity;
        u.uAuroraStrength.value = auroraStrength;
        // 火星尘暴：boost 大气雾霾（仅火星）
        u.uDustStorm.value = (id === 'mars') ? marsDust : 0;
      }
    }
  }

  /** world.update 之后调用：相机相对量（大气/环中心、远距光点尺寸、卫星可见性） */
  function postWorldUpdate(shipPosKm, simTimeSec) {
    for (const [id, e] of bodies) {
      if (id === 'sun') continue;
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      if (e.atmoMesh) e.atmoMesh.material.userData.uniforms.uCenter.value.copy(e.group.position);
      if (e.ringMesh) e.ringMesh.material.userData.uniforms.uCenter.value.copy(e.group.position);
      if (e.phys.rings && e.mat) e.mat.userData.uniforms.uCenter.value.copy(e.group.position);
      // Issue #26/#28/#29：动画时间 uniform（实时秒，驱动云层旋转/木星条带/极光帘幕）
      if (e.mat) e.mat.userData.uniforms.uTime.value = simTimeSec;
      if (e.cloudMat) e.cloudMat.userData.uniforms.uTime.value = simTimeSec;
      if (e.atmoMesh) e.atmoMesh.material.userData.uniforms.uTime.value = simTimeSec;
      // 远距光点：保持 ~3px 视觉尺寸；近距淡出
      const glintSize = dist * 0.004;
      e.glint.scale.setScalar(glintSize);
      e.glint.material.opacity = THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 300) - 1) * 0.8, 0, 0.9);
      // 卫星 LOD：距母星太远时隐藏卫星网格（光点保留）
      if (e.isMoon) {
        const parent = bodies.get(e.parentId);
        const pd = Math.hypot(
          parent.posKm[0] - shipPosKm[0], parent.posKm[1] - shipPosKm[1], parent.posKm[2] - shipPosKm[2]
        );
        e.mesh.visible = pd < 3e8; // 3 亿 km 内显示卫星
        e.glint.visible = e.mesh.visible;
      }
    }
    const dSunKm = Math.hypot(shipPosKm[0], shipPosKm[1], shipPosKm[2]);
    const dAU = Math.max(dSunKm / KM_PER_AU, 0.05);
    // 地形 Standard 材质光强：与行星材质同款暗适应补偿（外太阳系地表行走可见）
    const li = 1 / (dAU * dAU);
    sunLight.intensity = 2.5 * (li >= 1 ? li : Math.pow(li, 0.55));
    sun.update(simTimeSec, dSunKm);
  }

  // 地形颜色采样数据（真实贴图 → ImageData）
  const mapDataCache = new Map();
  function mapDataOf(id) {
    if (mapDataCache.has(id)) return mapDataCache.get(id);
    const e = bodies.get(id);
    const file = e?.phys.textures?.map;
    let data = null;
    const tex = file ? cache.get(file) : null;
    const img = tex?.image;
    if (img && (img.width || img.videoWidth)) {
      try {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 256;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 512, 256);
        data = ctx.getImageData(0, 0, 512, 256);
      } catch { /* 跨域等异常 → null */ }
    }
    mapDataCache.set(id, data);
    return data;
  }

  return { bodies, sunEntry, orbitLines, update, postWorldUpdate, mapDataOf, cache };
}

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
    map: tex, color, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  return sp;
}
