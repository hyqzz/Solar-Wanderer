// 场景装配：加载贴图（manifest 感知，缺失自动程序化兜底），创建太阳/行星/卫星
// 网格、云层、大气、行星环、轨道线，并提供每帧的星历驱动更新。

import * as THREE from 'three';
import { isSunOcculted } from './photoExposure.js';

export function readMapDataCache(cache, id, image) {
  const entry = cache.get(id);
  return entry && entry.image === image ? entry.data : undefined;
}

export function textureBitmapOptions(meta = {}, size) {
  const scale = Math.min(1, size / Math.max(meta.width ?? size, meta.height ?? size));
  const resize = meta.width && meta.height ? {
    resizeWidth: Math.max(1, Math.round(meta.width * scale)),
    resizeHeight: Math.max(1, Math.round(meta.height * scale)), resizeQuality: 'high',
  } : {};
  return { ...resize, imageOrientation: 'flipY', premultiplyAlpha: 'none' };
}

export function drawTextureForSampling(ctx, image, width, height) {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    ctx.translate(0, height); ctx.scale(1, -1);
  }
  ctx.drawImage(image, 0, 0, width, height);
}
import { BODIES, MOON_PHYS } from '../astro/bodies.js';
import { planetPosition, PLANETS, orbitPoints } from '../astro/planets.js';
import { moonGeocentric } from '../astro/moon.js';
import { jdUTtoTT } from '../astro/time.js';
import { moonLocalPosition, moonOrbitNormal, moonOrbitPoints, MOON_IDS } from '../astro/moons.js';
import { bodyToEclipticMatrix, tidalLockMatrix } from '../astro/rotation.js';
import { eclToWorldArr, eclToWorld, eclMatrixToWorldQuat, KM_PER_AU, asset } from '../config.js';
import { createPlanetMaterial, createCloudMaterial } from './planetMaterial.js';
import { QUALITY } from '../engine/quality.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';
import { createSun } from './sun.js';
import { proceduralMapLazy, proceduralBandsLazy } from './proceduralTextures.js';
import { HeightField } from './terrain.js';
import { idbGet, idbPut } from '../engine/texCache.js';
import { resourceQueue, whenIdle } from '../engine/resourceQueue.js';

/** 全尺寸贴图后台升级优先级：默认视野（地月系/太阳）优先，气巨其次，远端卫星最后 */
const TEX_PRIORITY = [
  'earth_day.jpg', 'earth_night.jpg', 'earth_clouds.jpg', 'moon.jpg', 'sun.jpg',
  'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'saturn_ring.png', 'milkyway.jpg',
  'venus_surface.jpg', 'venus_atmosphere.jpg', 'mercury.jpg',
  'io.jpg', 'europa.png', 'ganymede.jpg', 'callisto.jpg', 'titan.jpg',
  'uranus.jpg', 'neptune.jpg', 'triton.jpg', 'pluto.jpg', 'charon.jpg',
];

function priorityOf(file) {
  const i = TEX_PRIORITY.indexOf(file);
  return i === -1 ? TEX_PRIORITY.length : i;
}

/** Decode to the hardware budget, preserving the source aspect ratio. */
async function loadFullImage(file, meta, size, priority, attempt = 0) {
  const medium = size <= 2048 && meta?.m;
  const version = (medium ? meta.mh : meta?.h) ?? meta?.h;
  const key = (version ? `${file}@${version}` : file) + (medium ? ':medium' : '');
  try {
    let blob = attempt === 0 ? await idbGet(key) : null;
    if (!blob) {
      blob = await resourceQueue.run('texture:' + key, async () => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 25000);
        try {
          const res = await fetch(asset('textures/' + (medium ? 'medium/' + meta.m : file))+(version?'?v='+version:''), { signal: ctl.signal });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.blob();
        } finally { clearTimeout(timer); }
      }, priority);
      idbPut(key, blob);
    }
    await whenIdle();
    const options = textureBitmapOptions(meta, size);
    // WebGL ignores Texture.flipY for ImageBitmap. Bake the orientation into
    // the decode so L1 HTMLImageElement -> L2/L3 bitmap preserves north/south.
    return await createImageBitmap(blob, options);
  } catch {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 800 * 2 ** attempt));
      return loadFullImage(file, meta, size, priority, attempt + 1);
    }
    return null;
  }
}

/** L1 preview -> L2 1024px surroundings -> L3 focused maps.
 * Keep small decoded maps for eviction. Large maps have a byte budget; visiting
 * every planet must not keep every 8K texture resident on a shared-memory GPU. */
function progressiveTextures(files, cache, manifest, onProgress) {
  const records = new Map(files.map(file => [file, {
    file, base: null, size: 512, desired: 1024, busy: false, queued: false,
  }]));
  const queue = [...records.values()];
  for (const r of queue) r.queued = true;
  let active = 0, completed = 0, firstResolve, uploadTail = Promise.resolve();
  const upgrades = new Promise(resolve => { firstResolve = resolve; });
  if (!files.length) firstResolve();
  const publish = (r, image, size) => {
    const old = cache.get(r.file).image;
    cache.get(r.file).image = image;
    cache.get(r.file).userData.realLoaded = true;
    cache.get(r.file).needsUpdate = true;
    r.size = size;
    if (old !== r.base && old !== image) old.close?.();
  };
  const enqueue = (r, front = false) => {
    if (r.busy || r.queued || r.size === r.desired) return;
    r.queued = true;
    front ? queue.unshift(r) : queue.push(r);
  };
  async function job(r) {
    const size = r.base ? r.desired : 1024;
    const bmp = await loadFullImage(r.file, manifest[r.file], size, size > 1024 ? 40 : 0);
    if (bmp) {
      // Serialize replacements across animation frames; concurrent downloads
      // otherwise trigger several texture uploads in the same render.
      uploadTail = uploadTail.then(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await whenIdle();
        if (size === 1024) r.base = bmp;
        if (size === 1024 || r.desired === size) publish(r, bmp, size);
        else bmp.close?.();
      });
      await uploadTail;
    }
    if (!r.initialDone) {
      r.initialDone = true;
      onProgress?.(++completed, files.length, r.file);
      if (completed === files.length) firstResolve();
    }
    if (!bmp) r.failedUntil = Date.now() + 30000;
  }
  function pump() {
    while (active < QUALITY.textureConcurrency && queue.length) {
      const r = queue.shift(); r.queued = false; r.busy = true; active++;
      job(r).catch(e => console.warn('[textures]', r.file, e.message)).finally(() => {
        r.busy = false; active--;
        if (!(r.failedUntil > Date.now())) enqueue(r, r.desired > 1024);
        pump();
      });
    }
  }
  function boost(files) {
    const desired = new Map();
    let budget = QUALITY.tier === 'high' ? 384 * 1024 * 1024 : 128 * 1024 * 1024;
    for (const file of files) {
      const r = records.get(file), meta = manifest[file];
      if (!r || !meta) continue;
      let size = Math.min(QUALITY.textureSize, /clouds|night|milkyway/.test(file) ? 2048 : QUALITY.textureSize);
      const scale = Math.min(1, size / Math.max(meta.width ?? size, meta.height ?? size));
      const bytes = (meta.width ?? size) * (meta.height ?? size / 2) * scale * scale * 4 * 4 / 3;
      if (bytes > budget) continue;
      budget -= bytes; desired.set(file, size);
    }
    for (const r of records.values()) {
      r.desired = desired.get(r.file) ?? 1024;
      if (r.base && r.desired === 1024 && r.size > 1024) publish(r, r.base, 1024);
      if (!(r.failedUntil > Date.now())) enqueue(r, r.desired > 1024);
    }
    queue.sort((a, b) => (desired.has(b.file) ? 1 : 0) - (desired.has(a.file) ? 1 : 0) ||
      files.indexOf(a.file) - files.indexOf(b.file));
    pump();
  }
  pump();
  return { upgrades, boost };
}

async function loadTextures(onProgress, onBgProgress) {
  const getManifest = async path => {
    try {
      const response = await fetch(asset(path), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      return response.ok ? await response.json() : {};
    } catch { return {}; }
  };
  const [manifest, pManifest] = await Promise.all([
    getManifest('textures/manifest.json'), getManifest('textures/preview/manifest.json'),
  ]);
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const wanted = new Set();
  const collect = (t) => { if (t) Object.values(t).forEach((v) => typeof v === 'string' && wanted.add(v)); };
  Object.values(BODIES).forEach((b) => { collect(b.textures); if (b.rings?.texture) wanted.add(b.rings.texture); });
  Object.values(MOON_PHYS).forEach((m) => collect(m.textures));
  wanted.add('milkyway.jpg');

  // L1（阻塞，仅约 0.5MB）：有预览先载预览，无预览才直接载全尺寸
  let done = 0;
  const previewed = new Set();
  const tasks = [...wanted].map((file) => new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(), 8000);
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      onProgress?.(++done, wanted.size, file); resolve();
    };
    if (!manifest[file]) { finish(); return; }
    const p = pManifest[file];
    loader.load(
      (p ? asset('textures/preview/' + p.p) : asset('textures/' + file)) + (p?.ph || p?.h ? '?v='+(p.ph??p.h) : ''),
      (tex) => {
        if (settled) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = QUALITY.anisotropy;
        cache.set(file, tex);
        if (p) previewed.add(file);
        finish();
      },
      undefined,
      () => { finish(); } // 失败→兜底
    );
  }));
  await Promise.all(tasks);

  // Failed previews retain a texture object so a later network recovery can
  // replace its image, including materials already bound to this placeholder.
  for (const file of wanted) {
    if (cache.has(file) || !pManifest[file]) continue;
    const owner = [...Object.entries(BODIES), ...Object.entries(MOON_PHYS)].find(([, p]) =>
      p.textures?.map === file || (p.textures?.cloudsOpaque && p.textures.clouds === file));
    let texture;
    if (owner) texture = texOf(cache, null, owner[0], owner[1]);
    else {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=2;
      texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    }
    texture.anisotropy=QUALITY.anisotropy;cache.set(file,texture);previewed.add(file);
  }

  const files = [...previewed].sort((a, b) => priorityOf(a) - priorityOf(b));
  const { upgrades, boost } = progressiveTextures(files, cache, pManifest, onBgProgress);
  return { cache, upgrades, boost };
}

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
// 地球：极地卵形圈 OI 557.7nm 绿光；木星 H3+ 蓝紫；土星 H3+ 粉紫；海卫一：弱氮极光。
// 木星/土星已恢复：极光发射改为按壳层厚度归一化（atmosphere.js），不再被 ACES 压白。
const AURORA_MODE = { earth: 1, jupiter: 2, saturn: 3, triton: 4 };

// Issue #27：火星太阳黄经 Ls —— 由真实日心黄经计算（不再按日期线性近似）。
// 锚定权威历元：火星近日点 JD 2461125.8 处 Ls=251°（LMD 火星气候数据库），
// Ls = 火星日心黄经 − 近日点黄经 + 251。轨道离心率导致的季节长短不均
// （春/夏/秋/冬 = 199/184/147/158 天）与 LMD 参考值 194/178/143/156 sol 一致。
// 注：旧实现的锚点（2024-05-08）本身就是错的，真实 Ls=0 是 2024-11-12。
const MARS_PERIHELION_JD = 2461125.8;
const MARS_LON_PERIHELION = (() => {
  const p = planetPosition('mars', MARS_PERIHELION_JD);
  return Math.atan2(p.y, p.x) * 180 / Math.PI;
})();

/** 火星太阳黄经（度，0–360），由真实日心黄经计算 */
function marsLs(jdTT) {
  const p = planetPosition('mars', jdTT);
  const lon = Math.atan2(p.y, p.x) * 180 / Math.PI;
  return ((lon - MARS_LON_PERIHELION + 251) % 360 + 360) % 360;
}

const GAS_BAND_COLORS = {
  jupiter: [[200, 170, 130], [240, 225, 200], [170, 130, 95], [225, 200, 170], [150, 110, 80]],
  saturn: [[225, 205, 165], [240, 230, 200], [205, 180, 140], [230, 215, 185]],
  uranus: [[155, 205, 215], [175, 220, 228], [145, 195, 208]],
  neptune: [[60, 90, 200], [80, 120, 220], [50, 80, 180], [90, 140, 230]],
};

/** 几何反照率（近似实测值），用于远距光点亮度的物理调制 */
const GLINT_ALBEDO = {
  mercury: 0.14, venus: 0.75, earth: 0.31, mars: 0.25, jupiter: 0.50,
  saturn: 0.47, uranus: 0.51, neptune: 0.41, pluto: 0.60,
  moon: 0.12, io: 0.63, europa: 0.67, ganymede: 0.43, callisto: 0.17,
  titan: 0.22, triton: 0.76, charon: 0.35,
};

/** 天体 → 其关联贴图文件列表（视点驱动升级优先级用） */
export function texturesOfBody(id) {
  const out = [];
  const b = BODIES[id];
  if (b?.textures) for (const v of Object.values(b.textures)) if (typeof v === 'string') out.push(v);
  if (b?.rings?.texture) out.push(b.rings.texture);
  const m = MOON_PHYS[id];
  if (m?.textures) for (const v of Object.values(m.textures)) if (typeof v === 'string') out.push(v);
  return out;
}

/** 贴图或程序化兜底（惰性：占位纹理先行，真实贴图后台生成后换图） */
function texOf(cache, file, bodyId, phys) {
  if (file && cache.has(file)) return cache.get(file);
  if (phys?.type === 'gas' || phys?.type === 'ice') {
    return proceduralBandsLazy(bodyId, GAS_BAND_COLORS[bodyId] ?? GAS_BAND_COLORS.jupiter);
  }
  return proceduralMapLazy(bodyId, phys?.surface?.palette ?? 'gray');
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

export async function buildSolarSystem(scene, world, onProgress, onBgProgress) {
  const { cache, upgrades, boost } = await loadTextures(onProgress, onBgProgress);
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
  // 太阳光基准色 = 纯白：行星盘面材质（planetMaterial）用的是无染色白光照，
  // 且其配色是对标 NASA 影像标定的（影像本身按太阳白平衡）。地表若用暖白
  // 0xfff2e0（旧值），同一处地面与盘面同色区会呈暖色调偏移（月球地表发米黄、
  // 与灰盘面在交界处形成色块）。改为纯白后两侧一致，月面呈中性灰（阿波罗实拍）。
  const sunLight = new THREE.PointLight(0xffffff, 1, 0, 0);
  sun.group.add(sunLight);
  // 近场太阳阴影装置：行走/超低空时把光照从点光源平滑移交到跟随玩家的
  // 平行光（地表尺度上阳光本就近似平行），由它投射岩石/地形自我阴影——
  // 无阴影的岩石像贴图浮在地上（地表审查"照片级"缺口之首）。
  // 平行光正交阴影框 ±400m 只覆盖近场；w=0 时 castShadow 关闭、零开销。
  const sunShadow = new THREE.DirectionalLight(0xffffff, 0);
  sunShadow.castShadow = false;
  sunShadow.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  sunShadow.shadow.camera.left = -0.4; sunShadow.shadow.camera.right = 0.4;
  sunShadow.shadow.camera.top = 0.4; sunShadow.shadow.camera.bottom = -0.4;
  sunShadow.shadow.camera.near = 0.02; sunShadow.shadow.camera.far = 6;
  sunShadow.shadow.bias = -0.00008;
  sunShadow.shadow.normalBias = 0.0006; // km 单位 = 0.6m：抵消地形网格 0.4m 采样自遮挡痤疮
  scene.add(sunShadow);
  scene.add(sunShadow.target);
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
      const cmat = createCloudMaterial(cloudTex, { radiusKm: phys.radiusKm });
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
    const jdNow = jdUTtoTT(Date.now() / 86400000 + 2440587.5);
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
    oline.userData.jd = jdNow;
    oline.userData.baseOpacity = 0.3; // 近距淡出基准（main.js 按相机距离调制）

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
    oline.userData.baseOpacity = 0.25;
    orbitLines.userData[id] = oline;

    scene.add(group);
    world.register(entry.posKm, group);
    bodies.set(id, entry);
  }

  // ---------- 每帧更新 ----------
  const _q = new THREE.Quaternion();
  const _sunDir = new THREE.Vector3();
  const _pole = new THREE.Vector3(); // Issue #36：自转轴世界方向（计算日下点纬度）

  // 光速（km/天）：光行时视位置修正用
  const C_KM_PER_DAY = 299792.458 * 86400;

  /** 光行时视位置：按 t − d/c 回退，2 次迭代收敛。camEcl 缺省时退回几何位置 */
  function apparentAt(fn, camEcl, jdTT) {
    let p = fn(jdTT);
    if (!camEcl) return p;
    for (let k = 0; k < 2; k++) {
      const d = Math.hypot(p.x - camEcl.x, p.y - camEcl.y, p.z - camEcl.z);
      p = fn(jdTT - d / C_KM_PER_DAY);
    }
    return p;
  }

  let orbitWorker;
  const pendingOrbits = new Set();
  function refreshOrbitLines(jdTT) {
    for (const id of PLANETS) {
      const line = orbitLines.userData[id];
      if (Math.abs(jdTT - line.userData.jd) < 1 || pendingOrbits.has(id)) continue;
      if (!orbitWorker && typeof Worker !== 'undefined') {
        orbitWorker = new Worker(new URL('../engine/orbitWorker.js', import.meta.url), { type: 'module' });
        orbitWorker.onmessage = ({ data }) => {
          pendingOrbits.delete(data.id);
          if (data.error) { console.warn('[orbit]', data.error); return; }
          const target = orbitLines.userData[data.id];
          target.geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
          target.geometry.computeBoundingSphere();
          target.userData.jd = data.jd;
        };
      }
      if (!orbitWorker) return;
      pendingOrbits.add(id);
      orbitWorker.postMessage({ id, jd: jdTT });
    }
  }

  function update(jdTT, camPosKm) {
    refreshOrbitLines(jdTT);
    // 相机绝对坐标（three 世界系 km）→ 黄道系，用于光行时回退
    const camEcl = camPosKm ? { x: camPosKm[0], y: -camPosKm[2], z: camPosKm[1] } : null;
    // 本帧各天体黄道视位置（供卫星叠加母星视位置）
    const eclPos = new Map();
    // Issue #27/#29/#36：全局季节量（每帧一次，所有天体共享）
    // 火星太阳黄经 Ls（度，0-360）
    let ls = marsLs(jdTT);
    // 太阳活动：11 年周期近似（调制极光强度）
    const solarActivity = 0.5 + 0.3 * Math.sin((jdTT - 2451545.0) / (365.25 * 11) * Math.PI * 2);
    // 火星尘暴强度（Ls 180-360 风暴季）
    const marsDust = Math.max(0,
      THREE.MathUtils.smoothstep(ls, 180, 220) * (1 - THREE.MathUtils.smoothstep(ls, 330, 360)));
    // 极光强度（移动端/降档时关闭）
    const auroraStrength = 1.0;

    for (const [id, e] of bodies) {
      if (id === 'sun') {
        const m = bodyToEclipticMatrix('sun', jdTT);
        eclMatrixToWorldQuat(m, e.mesh.quaternion);
        continue;
      }
      // 位置（含光行时视位置修正：相机看到的是 t − d/c 时刻的位置）
      let ecl;
      if (!e.isMoon) {
        ecl = apparentAt((t) => planetPosition(id, t), camEcl, jdTT);
      } else if (id === 'moon') {
        ecl = apparentAt((t) => {
          const ep = eclPos.get('earth') ?? planetPosition('earth', t);
          const mg = moonGeocentric(t);
          return { x: ep.x + mg.x, y: ep.y + mg.y, z: ep.z + mg.z };
        }, camEcl, jdTT);
      } else {
        ecl = apparentAt((t) => {
          const pp = eclPos.get(e.parentId) ?? planetPosition(e.parentId, t);
          const ml = moonLocalPosition(id, t);
          return { x: pp.x + ml.x, y: pp.y + ml.y, z: pp.z + ml.z };
        }, camEcl, jdTT);
      }
      eclPos.set(id, ecl);
      const w = eclToWorldArr(ecl);
      e.posKm[0] = w[0]; e.posKm[1] = w[1]; e.posKm[2] = w[2];

      // 姿态
      if (!e.isMoon || id === 'moon') {
        // 月球走 IAU 2015 自转模型，而不是"本初子午线指向母星"的硬潮汐锁定。
        // 差别不是细节：真实月球的自转是**匀速**的（恒星月），而它的轨道运动
        // 不均匀且轨道面有倾角——两者之差就是光学天平动（经度 ±7.9°、
        // 纬度 ±6.7°），使可见面达到 59% 而不是 50%。
        // 其余卫星仍用潮汐锁定：它们的天平动更小，且缺乏同级 IAU 模型。
        const m = bodyToEclipticMatrix(id, jdTT);
        eclMatrixToWorldQuat(m, e.mesh.quaternion);
      } else {
        // 潮汐锁定：z=轨道法向，本初子午线指向母星
        const local = id === 'moon' ? moonGeocentric(jdTT) : moonLocalPosition(id, jdTT);
        const L = Math.hypot(local.x, local.y, local.z) || 1;
        const toParent = { x: -local.x / L, y: -local.y / L, z: -local.z / L };
        const nHat = moonOrbitNormal(id, jdTT);
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
        e.cloudMat.userData.uniforms.uCenter.value.copy(e.group.position);
        // 相机在云壳内还是外，决定保留哪一面（见 createCloudMaterial 的说明）
        e.cloudMat.userData.uniforms.uCameraInside.value =
          e.group.position.length() < e.cloudMat.userData.uniforms.uRTop.value ? 1 : 0;
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
  let glintSkyFade = 1; // 白昼大气内远距光点熄灭（日光淹没，真实白昼看不见行星"星星"）
  function postWorldUpdate(shipPosKm, simTimeSec) {
    let nearestE = null, nearestSurf = Infinity;
    for (const [id, e] of bodies) {
      if (id === 'sun') continue;
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      const surf = dist - e.phys.radiusKm;
      if (surf < nearestSurf) { nearestSurf = surf; nearestE = e; }
      // 远距光点亮度物理化：相位角 φ（天体处 太阳-天体-相机 夹角）+ 几何反照率
      // 朗伯球相位函数：(sinφ + (π−φ)cosφ)/π，满相 φ=0 最亮，背相 φ→π 熄灭
      const bsX = -e.posKm[0], bsY = -e.posKm[1], bsZ = -e.posKm[2]; // 天体→太阳
      const bcX = shipPosKm[0] - e.posKm[0], bcY = shipPosKm[1] - e.posKm[1], bcZ = shipPosKm[2] - e.posKm[2]; // 天体→相机
      const bsL = Math.hypot(bsX, bsY, bsZ) || 1, bcL = Math.hypot(bcX, bcY, bcZ) || 1;
      const cosPhi = Math.max(-1, Math.min(1, (bsX * bcX + bsY * bcY + bsZ * bcZ) / (bsL * bcL)));
      const phi = Math.acos(cosPhi);
      const phaseF = (Math.sin(phi) + (Math.PI - phi) * cosPhi) / Math.PI;
      if (e.atmoMesh) e.atmoMesh.material.userData.uniforms.uCenter.value.copy(e.group.position);
      if (e.ringMesh) e.ringMesh.material.userData.uniforms.uCenter.value.copy(e.group.position);
      if (e.phys.rings && e.mat) e.mat.userData.uniforms.uCenter.value.copy(e.group.position);
      // Issue #26/#28/#29：动画时间 uniform（实时秒，驱动云层旋转/木星条带/极光帘幕）
      if (e.mat) e.mat.userData.uniforms.uTime.value = simTimeSec;
      if (e.cloudMat) e.cloudMat.userData.uniforms.uTime.value = simTimeSec;
      if (e.atmoMesh) e.atmoMesh.material.userData.uniforms.uTime.value = simTimeSec;
      // 远距光点：保持 ~3px 视觉尺寸；近距淡出；亮度随相位与反照率调制
      const glintSize = dist * 0.004;
      e.glint.scale.setScalar(glintSize);
      const distFade = THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 300) - 1) * 0.8, 0, 0.9);
      const albedoScale = Math.sqrt((GLINT_ALBEDO[id] ?? 0.15) / 0.3);
      e.glint.material.opacity = distFade * (0.2 + 0.8 * phaseF) * albedoScale * glintSkyFade;
      // 卫星 LOD：迟滞窗口防闪烁（进入 2.8 亿 km 显示、退出 3.2 亿 km 隐藏）；
      // 网格隐藏时光点保留（远距卫星本就是点源，相位调制后亮度正确）
      if (e.isMoon) {
        const parent = bodies.get(e.parentId);
        const pd = Math.hypot(
          parent.posKm[0] - shipPosKm[0], parent.posKm[1] - shipPosKm[1], parent.posKm[2] - shipPosKm[2]
        );
        if (e.mesh.visible && pd > 3.2e8) e.mesh.visible = false;
        else if (!e.mesh.visible && pd < 2.8e8) e.mesh.visible = true;
      }
    }
    const dSunKm = Math.hypot(shipPosKm[0], shipPosKm[1], shipPosKm[2]);
    const dAU = Math.max(dSunKm / KM_PER_AU, 0.05);
    // 地形 Standard 材质光强：感知暗适应——人眼会适应光强，真实站在水星正午地表
    // 看到的并非"10倍地球亮度的白炽世界"，而是略亮的暗灰荒原。内外太阳系统一
    // 用 0.55 幂压缩动态范围（旧版仅外太阳系压缩，水星地表 1/d² 全量 26× 被
    // ACES 削顶成白水泥地——地表审查发现）。
    // 系数 π：StandardMaterial 的漫反射含 1/π 因子，而行星盘面材质（planetMaterial）
    // 是 albedo·NdotL·uSunI 无该因子。取 2.5 时地表恒比盘面暗 ~20%，同一处
    // 地面高度看与盘面同色区出现暗斑（月球 200km 的地形斑块）；取 π 后两侧一致。
    const li = 1 / (dAU * dAU);
    sunLight.intensity = Math.PI * Math.pow(li, 0.55);
    // 地表光照穿霾色滤：厚霾天体（金星/土卫六）的阳光被气溶胶滤成橙色并衰减
    // （Venera 橙琥珀原野 / Huygens 橙色漫射光实拍）；随高度指数恢复为自然阳光
    const gt = nearestE?.phys.atmosphere?.groundTint;
    if (gt) {
      const w = Math.exp(-Math.max(nearestSurf, 0) / (nearestE.phys.atmosphere.rayleighScaleKm * 3));
      sunLight.intensity *= 1 + ((nearestE.phys.atmosphere.groundDim ?? 1) - 1) * w;
      sunLight.color.setRGB(
        1.0 + (gt[0] - 1.0) * w,       // 基准色纯白 = (1,1,1)，按 w 混入滤镜色
        1.0 + (gt[1] - 1.0) * w,
        1.0 + (gt[2] - 1.0) * w);
    } else {
      sunLight.color.setHex(0xffffff);
    }
    // 近场阴影移交：可登陆天体表面 2.7km 以下，光照平滑从点光源切到平行光
    // 阴影装置（局部阳光本就近似平行）；0.3km 以下完全由装置接管。
    // 点光源保留远景/其它天体照明，二者方向在玩家处一致，过渡无缝。
    const wSh = (nearestE && nearestE.phys.landable)
      ? THREE.MathUtils.smoothstep(2.7 - Math.max(nearestSurf, 0), 0, 2.4) : 0;
    if (wSh > 0.003) {
      _sunDir.copy(sun.group.position).normalize(); // 世界系（相机为原点）：相机→太阳
      sunShadow.position.copy(_sunDir).multiplyScalar(3);
      sunShadow.target.position.set(0, 0, 0);
      sunShadow.intensity = sunLight.intensity * wSh;
      sunShadow.color.copy(sunLight.color);
      sunShadow.visible = true;
      sunShadow.castShadow = true;
      sunLight.intensity *= 1 - wSh;
    } else if (sunShadow.visible) {
      sunShadow.visible = false;
      sunShadow.castShadow = false;
      sunShadow.intensity = 0;
    }
    sun.update(simTimeSec, dSunKm, isSunOcculted(shipPosKm, sunPhys.radiusKm,
      [...bodies.values()].filter(b => b.phys.id !== 'sun')));
  }

  // 地形颜色采样数据（真实贴图 → ImageData）
  const mapDataCache = new Map();
  function mapDataOf(id) {
    const e = bodies.get(id);
    const file = e?.phys.textures?.map;
    let data = null;
    const tex = file ? cache.get(file) : null;
    const img = tex?.image;
    const cachedData = readMapDataCache(mapDataCache, id, img);
    if (cachedData !== undefined) return cachedData;
    if (img && (img.width || img.videoWidth)) {
      try {
        // 按贴图原生分辨率采样（上限 2048×1024）：地形顶点色直接取自盘面同一张贴图。
        // 降采样会污染海洋像素（sRGB 空间平均 → 偏亮），地球深海掩码
        // om=(b-max(r,g·0.9))·6 随之变弱 → 地形海面偏红偏亮，高空看是可见方片接缝。
        const w = Math.min(img.width || img.videoWidth || 1024, 2048);
        const h = Math.max(1, Math.round(w / 2));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        // CPU terrain sampling expects the original north-at-top atlas, while
        // GPU bitmaps have been flipped during decode to match TextureLoader.
        drawTextureForSampling(ctx, img, w, h);
        data = ctx.getImageData(0, 0, w, h);
      } catch { /* 跨域等异常 → null */ }
    }
    mapDataCache.delete(id);
    mapDataCache.set(id, { image: img, data });
    if (mapDataCache.size > 4) mapDataCache.delete(mapDataCache.keys().next().value);
    return data;
  }

  return { bodies, sunEntry, orbitLines, update, postWorldUpdate, mapDataOf, cache, upgrades, boostTextures: boost,
    /** 白昼大气内远距光点淡出（与星空淡出同一阈值） */
    setSkyFade(f) { glintSkyFade = f > 0.4 ? 1 : 0; } };
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
