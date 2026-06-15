// 主程序：Google Earth 范式 × 整个日球层。
// 三种模式：
//   orbit(探索, 默认) — GE 式环绕相机：拖拽旋转/滚轮缩放/搜索/双击前往，焦点恒居中
//   fly(自由飞行)     — 指针锁定 6DOF 飞船（F 切换）
//   walk(地表行走)    — 近地表按 G 登陆，真实重力
// 仿真时钟（系统时间起步，可加速/倒退）驱动星历层 → 浮动原点世界 → HDR 渲染。

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { SimClock } from './astro/time.js';
import { surfaceGravity } from './astro/bodies.js';
import { World } from './engine/floating.js';
import { Ship, Input } from './engine/ship.js';
import { OrbitCamera } from './engine/orbitCamera.js';
import { buildSolarSystem } from './scene/builder.js';
import { createStarfield, BRIGHT_STARS, SKY_R } from './scene/starfield.js';
import { createBelts, createOortCloud } from './scene/belts.js';
import { createTNOScene } from './scene/tnoScene.js';
import { createComets } from './scene/comets.js';
import { createHeliosphere, VOYAGERS, voyagerPosition } from './scene/heliosphere.js';
import { TerrainManager } from './scene/terrain.js';
import { Labels } from './ui/labels.js';
import { HUD, targetInfo } from './ui/hud.js';
import { SearchUI } from './ui/search.js';
import { eclToWorldArr, KM_PER_AU } from './config.js';
import { initQuality, makeFpsGuard, QUALITY, IS_MOBILE } from './engine/quality.js';
import { TouchControls } from './ui/touchControls.js';
import { t, bodyName, LANG, applyDomI18n } from './ui/i18n.js';

const canvas = document.getElementById('app');
// powerPreference: 多显卡系统由浏览器选高性能独显（R7 #8）
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
});
initQuality(renderer); // 必须在 buildSolarSystem 之前（着色器步进/网格密度构建期固化）
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0); // 地形气溶胶透视（仅 fog:true 材质受影响）
// R11：far 扩展到 ~106 ly 以支持亮星真实 3D 位置（视差）+ 奥尔特云粒子（100000 AU=1.58 ly）
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 5e-7, 1e15);
scene.add(camera);
const ambient = new THREE.AmbientLight(0x404858, 0.02);
scene.add(ambient);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / QUALITY.bloomDiv, window.innerHeight / QUALITY.bloomDiv),
  0.38, 0.5, 1.1
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// 运行时帧率兜底：识别失败的弱 GPU 在持续低帧时一次性降档
const fpsGuard = makeFpsGuard(renderer, () => {
  for (const [, e] of builder.bodies) {
    if (e.mat?.userData.uniforms?.uDetailMode) e.mat.userData.uniforms.uDetailMode.value = 0;
  }
  hud.tip(t('tip.quality'));
});

const hud = new HUD();
const world = new World();
const input = new Input(window, canvas);
const ship = new Ship();
const orbitCam = new OrbitCamera(camera);
const simClock = new SimClock();
const clock = new THREE.Clock();

let builder, comets, labels, searchUI, touchControls, sky, belts, oortCloud, tnoScene;
let appMode = 'orbit'; // orbit | fly | walk
const registry = new Map();
let selectedId = null;
const voyagerEntries = [];
const boundaryEntries = [];
const IDENTITY_Q = new THREE.Quaternion();
let lastLabelClickFocus = 'earth';
let lastLabelClickId = null;
let labelClickTimer = null;
const LABEL_CLICK_WINDOW = 250;

init();

async function init() {
  applyDomI18n();
  builder = await buildSolarSystem(scene, world, (d, total) => hud.setLoading(d, total));

  sky = createStarfield(builder.cache.get('milkyway.jpg'));
  scene.add(sky.group); // 背景程序化星空固定相机（零视差）

  // R11：亮星真实 3D 位置注册浮动原点（产生恒星视差效果）
  scene.add(sky.brightGroup);
  world.register(new Float64Array(3), sky.brightGroup);

  // 带/尘光/日球层壳为日心结构：必须注册浮动原点，否则会错误地以相机为中心
  belts = createBelts();
  scene.add(belts);
  world.register(new Float64Array(3), belts);

  // R11：奥尔特云统计粒子层（2000–100000 AU）
  oortCloud = createOortCloud(); // { group, update(dSunAU) }
  scene.add(oortCloud.group);
  world.register(new Float64Array(3), oortCloud.group);
  const helio = createHeliosphere();
  scene.add(helio);
  world.register(new Float64Array(3), helio);
  comets = createComets(world);
  for (const e of comets.entries) scene.add(e.group);

  // 旅行者号
  for (const vg of VOYAGERS) {
    const group = new THREE.Group();
    const posKm = new Float64Array(3);
    world.register(posKm, group);
    scene.add(group);
    voyagerEntries.push({ vg, posKm, group });
  }

  // 日球层边界地标（可前往的"边界鼻尖"）
  const DEG = Math.PI / 180;
  const noseLon = 255.4 * DEG, noseLat = 5.1 * DEG;
  const noseEcl = {
    x: Math.cos(noseLat) * Math.cos(noseLon),
    y: Math.cos(noseLat) * Math.sin(noseLon),
    z: Math.sin(noseLat),
  };
  for (const [id, nameZh, nameEn, rAU, desc] of [
    ['termshock', '终止激波（鼻尖）', 'Termination Shock', 90,
      '太阳风从超音速骤降为亚音速的边界（约 90 AU）。旅行者 1 号于 2004 年穿越此处。'],
    ['heliopause', '日球层顶（鼻尖）', 'Heliopause', 121,
      '太阳风与星际介质压力平衡的边界——太阳系"势力范围"的尽头（约 121 AU）。穿过这里就是星际空间。'],
  ]) {
    const posKm = new Float64Array([0, 0, 0]);
    const w = eclToWorldArr({ x: noseEcl.x * rAU * KM_PER_AU, y: noseEcl.y * rAU * KM_PER_AU, z: noseEcl.z * rAU * KM_PER_AU });
    posKm[0] = w[0]; posKm[1] = w[1]; posKm[2] = w[2];
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    world.register(posKm, group);
    scene.add(group);
    boundaryEntries.push({ id, nameZh, nameEn, desc, posKm, group, rAU });
  }

  // R11：28 颗海外天体（TNO）— 柯伊伯带、散射盘、延伸散射盘
  // 轨道线挂在 sun.group（日心，随浮动原点平移）
  tnoScene = createTNOScene(scene, world, builder.sunEntry.group);
  for (const [id, e] of tnoScene.entries) {
    registry.set(id, {
      nameZh: e.phys.nameZh, nameEn: e.phys.nameEn,
      desc: e.phys.desc, kind: 'tno',
      phys: { radiusKm: e.phys.radiusKm, type: 'dwarf' },
      posKm: e.posKm, relObj: e.group, quatRef: null,
      groundRadius: null,
      minDistKm: e.phys.radiusKm * 1.5, // 防止穿进天体内部
      viewDist: Math.max(e.phys.radiusKm * 12, 3e5),
    });
  }

  buildRegistry();
  setupLabels();
  searchUI = new SearchUI(registry, (id) => flyTo(id), {
    getOrbits: () => orbitLinesOn,
    toggleOrbits: () => { orbitLinesOn = !orbitLinesOn; },
    onSelect: () => { touchControls?.closeDirectory(); },
  });

  // Mobile on-screen controls — only created on touch devices (IS_MOBILE)
  if (IS_MOBILE) {
    touchControls = new TouchControls(input, {
      switchToFly:    switchToFly,
      switchToOrbit:  switchToOrbit,
      toggleOrbits:   () => { orbitLinesOn = !orbitLinesOn; },
      warpUp:         () => hud.warpUp(),
      warpDown:       () => hud.warpDown(),
    });
  }

  setupTerrainMgr();

  // 初始：GE 式俯瞰地球（无需指针锁定）
  builder.update(simClock.jdTT);
  orbitCam.init(orbitEnv, 'earth', 4);
  syncShipToOrbit();
  select('earth');

  // ---- URL hash 书签（#1）：加载时解析；Ctrl+L 复制当前位置链接 ----
  applyLocationHash();
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyL' && !e.shiftKey) {
      e.preventDefault(); // 阻止浏览器原生地址栏聚焦
      copyShareUrl();
    }
  });

  document.getElementById('start-btn').addEventListener('click', () => hud.hideStart());
  let downX = 0, downY = 0;
  canvas.addEventListener('mousedown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('click', (e) => {
    // fly/walk 需要指针锁定（桌面）；移动端不请求锁定
    if ((appMode === 'fly' || appMode === 'walk') && !input.locked && !IS_MOBILE) canvas.requestPointerLock();
    else if (input.locked && labels.aimedId) select(labels.aimedId);
    else if (appMode === 'orbit' && !input.locked && !orbitCam.flight &&
      Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
      // 点击天体 = 选择延迟焦点（R10-fix-3：镜头先不动，滚动再平滑切换并居中目标）
      const hit = pickBody(e.clientX, e.clientY);
      if (hit && hit.id !== orbitCam.focusId) {
        orbitCam.setPendingFocus(hit.id, hit.localDir, hit.localDist);
        select(hit.id);
        focusTipUntil = performance.now() + 2600;
      }
    }
  });
  input.onLockChange = (locked) => {
    // Esc 解锁 → 回探索模式（桌面专用；移动端无指针锁定）
    if (!locked && appMode === 'fly' && !IS_MOBILE) switchToOrbit();
  };
  window.addEventListener('resize', onResize);
  hud.loadingDone();
  window.__game = { ship, simClock, select, flyTo, orbitCam, builder, registry, input, terrainMgr, camera, getMode: () => appMode };
  renderer.setAnimationLoop(loop);
}

function buildRegistry() {
  for (const [id, e] of builder.bodies) {
    registry.set(id, {
      nameZh: e.phys.nameZh, nameEn: e.phys.nameEn, phys: e.phys,
      desc: e.phys.desc, parentId: e.parentId,
      kind: id === 'sun' ? 'star' : e.isMoon ? 'moon' : 'planet',
      posKm: e.posKm, relObj: e.group, quatRef: e.mesh.quaternion,
      // 地形感知相机下限（与行走碰撞同源）；气巨允许下潜入大气（R7 #1/#5）
      groundRadius: e.phys.landable ? (dir) => terrainMgr.heightAt(id, dir) : null,
      minDistKm: !e.phys.landable && e.phys.atmosphere && id !== 'sun'
        ? e.phys.radiusKm * 1.0012 : null,
    });
  }
  for (const e of comets.entries) {
    registry.set(e.c.id, {
      nameZh: e.c.nameZh, nameEn: e.c.nameEn, desc: e.c.desc, kind: 'comet',
      phys: { radiusKm: 10 }, posKm: e.posKm, relObj: e.group, viewDist: 2.5e6,
    });
  }
  for (const v of voyagerEntries) {
    registry.set(v.vg.id, {
      nameZh: v.vg.nameZh, nameEn: v.vg.nameEn, desc: v.vg.desc, kind: 'probe',
      phys: { radiusKm: 0.01 }, posKm: v.posKm, relObj: v.group, viewDist: 8e5,
    });
  }
  for (const b of boundaryEntries) {
    registry.set(b.id, {
      nameZh: b.nameZh, nameEn: b.nameEn, desc: b.desc, kind: 'boundary',
      phys: { radiusKm: 1 }, posKm: b.posKm, relObj: b.group, viewDist: 2.5 * KM_PER_AU,
    });
  }
  // 星带与全景区域条目（目录分组 + 远距标签，#7）。kind:'region' 在 pickBody/centerHit 中
  // 被排除（无固体表面、不可点击拾取/缩放收敛），仅用于目录前往与远距科教标注。
  // radiusKm 决定标签隐藏阈值（dist < radiusKm×1.6 时隐藏）：取各结构的代表尺度，
  // 使标签仅在足够远、整个结构入画时才出现，避免贴近行星时挡在太阳前方。
  registry.set('asteroidbelt', {
    nameZh: '小行星带', nameEn: 'Asteroid Belt', kind: 'region',
    desc: '主小行星带（2.1–3.4 AU）：火星与木星之间数十万颗小天体的盘状结构。',
    phys: { radiusKm: 2 * KM_PER_AU }, posKm: new Float64Array(3), relObj: belts, viewDist: 5.5 * KM_PER_AU,
  });
  registry.set('kuiperbelt', {
    nameZh: '柯伊伯带', nameEn: 'Kuiper Belt', kind: 'region',
    desc: '柯伊伯带（30–50 AU）：海王星轨道外的冰质天体盘，冥王星、妊神星等均位于其中。',
    phys: { radiusKm: 40 * KM_PER_AU }, posKm: new Float64Array(3), relObj: belts, viewDist: 75 * KM_PER_AU,
  });
  registry.set('oortcloud', {
    nameZh: '奥尔特云', nameEn: 'Oort Cloud', kind: 'region',
    desc: '太阳系最外层的球状彗星云团，距太阳约 2 000–100 000 AU，是长周期彗星的家园。',
    phys: { radiusKm: 200 * KM_PER_AU }, posKm: new Float64Array(3), relObj: oortCloud.group, viewDist: 6000 * KM_PER_AU,
  });
}

/** OrbitCamera 环境访问器 */
const orbitEnv = {
  get(id) {
    const t = registry.get(id);
    return {
      posKm: t.posKm,
      radiusKm: t.phys?.radiusKm ?? 1,
      ringsOuterKm: t.phys?.rings?.outerKm ?? null,
      quat: t.quatRef ?? IDENTITY_Q,
      viewDist: t.viewDist,
      groundRadius: t.groundRadius ?? null,
      minDistKm: t.minDistKm ?? null,
    };
  },
  /** 屏幕中心视线命中的最近天体（id+深度 km）——缩放收敛目标与焦点交接依据
   * （R8 #2 / R9-1b/1d）。无命中返回 null。 */
  centerHit(posKm, dir) {
    let best = null;
    for (const [id, t] of registry) {
      if (t.kind === 'region') continue; // 区域条目（星带/奥尔特云）不作为缩放收敛目标
      const R = t.phys?.radiusKm ?? 0;
      if (R < 1) continue; // 探测器/边界点不作为缩放收敛目标
      const margin = R * 1.004 + 1; // 收敛下限留在表面略上方
      const ox = t.posKm[0] - posKm[0];
      const oy = t.posKm[1] - posKm[1];
      const oz = t.posKm[2] - posKm[2];
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      if (b <= 0) continue;
      const det = b * b - (ox * ox + oy * oy + oz * oz - margin * margin);
      if (det < 0) continue;
      const tHit = b - Math.sqrt(det);
      if (tHit > 1e-6 && (best === null || tHit < best.depth)) best = { id, depth: tHit };
    }
    return best;
  },
  centerDepth(posKm, dir) { return this.centerHit(posKm, dir)?.depth ?? null; },
};

function setupLabels() {
  labels = new Labels(document.getElementById('labels'), camera);
  // 标签点击：探索模式下设为延迟焦点（镜头先不动，滚动/PageUpDown 再平滑切换焦点）；
  // 双击仍从原始焦点起飞。用短时窗口记录同一标签双击前的焦点，避免第一次点击切焦点
  // 后第二次点击把 fromId 覆盖成新焦点。
  labels.onSelect = (id) => {
    // 恒星与区域条目（星带/奥尔特云）无固体表面，不作延迟焦点目标——仅选中显示信息。
    if (appMode === 'orbit' && !orbitCam.flight && !id.startsWith('star_') &&
        registry.get(id)?.kind !== 'region') {
      if (!labelClickTimer || lastLabelClickId !== id) {
        lastLabelClickFocus = orbitCam.focusId;
      }
      lastLabelClickId = id;
      clearTimeout(labelClickTimer);
      labelClickTimer = setTimeout(() => { labelClickTimer = null; lastLabelClickId = null; }, LABEL_CLICK_WINDOW);
      if (id !== orbitCam.focusId) {
        orbitCam.setPendingFocus(id);
        focusTipUntil = performance.now() + 2600;
      }
    }
    select(id);
  };
  labels.onFlyTo = (id) => {
    clearTimeout(labelClickTimer);
    labelClickTimer = null;
    lastLabelClickId = null;
    const fromId = appMode === 'orbit' ? (lastLabelClickFocus ?? orbitCam.focusId) : null;
    flyTo(id, fromId);
  };
  for (const [id, t] of registry) {
    labels.add({
      id, name: bodyName(t),
      kind: t.kind === 'moon' ? 'moon' : t.kind === 'planet' || t.kind === 'star' ? 'planet'
        : t.kind === 'region' ? 'region' : 'poi',
      radiusKm: t.phys?.radiusKm ?? 1,
      getRelPos: (v) => v.copy(t.relObj.position),
    });
  }
  // 真实亮星标签（恒星视为无穷远，方向固定；显示真实光年距离——科教）
  for (const s of BRIGHT_STARS) {
    if (!s.dirWorld) continue;
    const name = LANG === 'zh' ? s.zh : (s.en || s.zh);
    labels.add({
      id: 'star_' + s.en, name, kind: 'fixstar', radiusKm: 0.001,
      distText: s.ly + ' ' + t('u.ly'),
      getRelPos: (v) => v.copy(s.dirWorld).multiplyScalar(SKY_R * 0.97),
    });
  }
}

function select(id) {
  selectedId = id;
}

/** 屏幕坐标拾取天体（点击设焦点用，~0.7° 容差，R10）。返回 { id, t, localDir, localDist } 或 null */
const _pickDir = new THREE.Vector3();
const _pickP = new THREE.Vector3();
const _pickHit = new THREE.Vector3();
const _pickQ = new THREE.Quaternion();
let focusTipUntil = 0;
function pickBody(cx, cy) {
  _pickDir.set(
    (cx / window.innerWidth) * 2 - 1, -((cy / window.innerHeight) * 2 - 1), 0.5
  ).unproject(camera).normalize(); // 浮动原点：相机恒在原点，未归一向量即射线方向
  let best = null;
  for (const [id, t] of registry) {
    if (t.kind === 'region') continue; // 区域条目不可点击拾取
    const R = t.phys?.radiusKm ?? 0;
    if (R < 1) continue;
    _pickP.copy(t.relObj.position); // 相机相对位置
    const b = _pickP.dot(_pickDir);
    if (b <= 0) continue;
    const margin = Math.max(R, b * 0.012); // 远小天体按 ~0.7° 角容差扩大可点面积
    const det = b * b - (_pickP.lengthSq() - margin * margin);
    if (det < 0) continue;
    const tHit = b - Math.sqrt(det);
    if (best === null || tHit < best.t) best = { id, t: Math.max(tHit, 0), entry: t, p: _pickP.clone() };
  }
  if (!best) return null;
  const R = best.entry.phys?.radiusKm ?? 1;
  // 命中点相对天体中心（相机空间）
  _pickHit.copy(_pickDir).multiplyScalar(best.t).sub(best.p);
  // 转到体固系
  _pickQ.copy(best.entry.quatRef ?? IDENTITY_Q).invert();
  const localDist = Math.max(_pickHit.length(), R * 0.1);
  const localDir = _pickHit.clone().applyQuaternion(_pickQ).normalize();
  return { id: best.id, t: best.t, localDir, localDist };
}

/** GE 式前往：任意模式 → 飞行动画 → 探索模式锚定目标（fromId 仅用于 orbit 模式标签双击） */
function flyTo(id, fromId = null) {
  if (!registry.has(id)) return;
  select(id);
  if (appMode !== 'orbit') {
    // 从飞船/行走就地接管为探索模式（带 quat：视向连续）
    const focus = nearestCache?.id ?? 'sun';
    document.exitPointerLock?.();
    orbitCam.adoptPosition(orbitEnv, focus, ship.posKm, ship.quat);
    appMode = 'orbit';
    ship.mode = 'fly';
  }
  orbitCam.flyTo(orbitEnv, id, fromId);
}

function syncShipToOrbit() {
  ship.posKm[0] = orbitCam.posKm[0];
  ship.posKm[1] = orbitCam.posKm[1];
  ship.posKm[2] = orbitCam.posKm[2];
  ship.quat.copy(orbitCam.quat);
  ship.vel.set(0, 0, 0);
}

function switchToOrbit() {
  appMode = 'orbit';
  ship.mode = 'fly';
  document.exitPointerLock?.();
  const focus = nearestCache?.id ?? selectedId ?? 'sun';
  orbitCam.adoptPosition(orbitEnv, focus, ship.posKm, ship.quat); // 视向连续（R7 #7）
  // 从行走/飞行切回探索时把相机抬升一段，避免贴地时 GE 键盘平移速率过低、
  // 滚轮已到下限，让用户感觉"操控失效"（R10 后用户反馈）。
  // 同时把用户倾斜复位：adoptPosition 为保留原视向会把 this.tilt 设为 -autoTilt，
  // 抬升后 auto-tilt 消失，负 tilt 会让视线指向地平线下方，导致径向缩放条件失效、
  // 滚轮进入 dolly。复位后由 auto-tilt 在抬升过程中自然接管。
  orbitCam.tilt = 0;
  orbitCam.panOffset.set(0, 0, 0); // 重置平移偏置以确保下次滚轮缩放走径向而非 dolly
  orbitCam.distTarget = orbitCam.dist + Math.max(orbitCam.dist * 0.002, 0.05);
  input.cancelGestures(); // 清理旧手势状态，防止平移/捏合泄漏到新模式
}

function switchToFly() {
  if (orbitCam.flight) orbitCam.cancelFlight(orbitEnv);
  appMode = 'fly';
  ship.mode = 'fly';
  syncShipToOrbit();
  if (!IS_MOBILE) canvas.requestPointerLock();
}

// ---------- 地形 ----------
const terrainMgr = new TerrainManager();
function setupTerrainMgr() {
  terrainMgr.physOf = (id) => builder.bodies.get(id).phys;
  terrainMgr.meshOf = (id) => builder.bodies.get(id).mesh;
  terrainMgr.getMapData = (id) => builder.mapDataOf(id);
}

// ---------- 主循环 ----------
const _rel = new THREE.Vector3();
const _q = new THREE.Quaternion();
let exposureTarget = 1;
let nearestCache = null;
let lastTakeoff = -1e9; // 滚轮起飞时间戳（自动登陆 0.8s 冷却，防滞回）

function loop() {
  const dtReal = Math.min(clock.getDelta(), 0.1);

  // 时间系统
  handleTimeKeys();
  simClock.rate = hud.warpRate(simClock.paused);
  const jdTT = simClock.tick(dtReal);

  // 星历驱动
  builder.update(jdTT);
  comets.update(jdTT);
  tnoScene.update(jdTT, ship.posKm);
  for (const v of voyagerEntries) {
    const p = voyagerPosition(v.vg, jdTT);
    const w = eclToWorldArr(p);
    v.posKm[0] = w[0]; v.posKm[1] = w[1]; v.posKm[2] = w[2];
  }

  const nearest = findNearest();
  nearestCache = nearest;
  const env = makeEnv(nearest);

  // ---------- 模式更新 ----------
  if (appMode === 'orbit') {
    // 拖拽打断飞行动画（GE 行为）
    if (orbitCam.flight && input.drag.active) orbitCam.cancelFlight(orbitEnv);
    orbitCam.update(dtReal, input, orbitEnv);
    syncShipToOrbit();
    // 登陆：按 G，或滚轮一路拉近贴地自动转行走（NMS 式无缝衔接，R7 #1）
    const landRange = nearest ? Math.max(20, nearest.radiusKm * 0.05) : 0;
    let autoLand = false;
    if (nearest?.landable && !orbitCam.flight && nearest.distSurface < 30 &&
      performance.now() - lastTakeoff > 800) {
      _rel.set(
        ship.posKm[0] - nearest.posKm[0], ship.posKm[1] - nearest.posKm[1], ship.posKm[2] - nearest.posKm[2]
      );
      const relLen = _rel.length();
      _q.copy(builder.bodies.get(nearest.id).mesh.quaternion).invert();
      _rel.applyQuaternion(_q).normalize();
      const altGround = relLen - terrainMgr.heightAt(nearest.id, _rel);
      // 移动端阈值放宽至 5m：捏合缩放步长比鼠标滚轮大，需更宽触发窗口才能触发着陆
      autoLand = altGround < (IS_MOBILE ? 0.005 : 0.0022);
    }
    if ((autoLand || (input.tapped('KeyG') && nearest?.landable && nearest.distSurface < landRange))
      && !orbitCam.flight) {
      ship.enterWalk(env); // 视向严格连续（yaw+pitch 自当前相机反解）
      appMode = 'walk';
      // 移动端：无指针锁定，行走使用单指拖拽环视
      if (!IS_MOBILE) try { canvas.requestPointerLock(); } catch { /* 非手势上下文 */ }
    }
    if (input.tapped('KeyF') && !orbitCam.flight) switchToFly();
  } else {
    // 行走中滚轮后退/PageUp → 无缝起飞回探索模式（视向连续，R7 #1；
    // 阈值 0.5 防触控板轻扫误触发；下潜中滚轮上 = 向上游，不触发起飞，R10）
    if (appMode === 'walk' && !ship.walk.diving &&
      (input.wheel >= 0.5 || input.down('PageUp'))) {
      lastTakeoff = performance.now();
      document.exitPointerLock?.();
      orbitCam.adoptPosition(orbitEnv, ship.walk.bodyId, ship.posKm, ship.quat);
      // 滚轮起飞后复位 tilt 并抬升相机，避免 adoptPosition 留下的 -autoTilt 在 auto-tilt
      // 消失后导致视线指向地平线下方，进而使径向缩放条件失效、滚轮进入 dolly。
      orbitCam.tilt = 0;
      orbitCam.panOffset.set(0, 0, 0); // 重置平移偏置：起飞后应能径向缩放重新着陆
      orbitCam.distTarget = orbitCam.dist + Math.max(orbitCam.dist * 0.002, 0.05);
      appMode = 'orbit';
      ship.mode = 'fly';
      ship.vel.set(0, 0, 0);
      input.cancelGestures(); // 清理起飞手势，防止捏合/平移状态泄漏
    } else {
      ship.update(dtReal, input, env);
      if (appMode === 'walk' && ship.mode === 'fly') {
        switchToOrbit(); // 行走中按 G 返回 → 探索模式
      } else {
        appMode = ship.mode === 'walk' ? 'walk' : 'fly';
      }
      if (appMode === 'fly' && input.tapped('KeyF')) switchToOrbit();
    }
  }
  if (input.tapped('KeyT') && selectedId) flyTo(selectedId);

  // 浮动原点（相机=飞船位姿）
  world.update(ship.posKm);
  builder.postWorldUpdate(ship.posKm, performance.now() / 1000);
  camera.quaternion.copy(ship.quat);

  // 地形
  if (nearest && nearest.landable) {
    const e = builder.bodies.get(nearest.id);
    _rel.set(
      ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
    );
    _q.copy(e.mesh.quaternion).invert();
    _rel.applyQuaternion(_q).normalize();
    terrainMgr.update(nearest, _rel, performance.now() / 1000);
  } else {
    terrainMgr.update(null, null);
  }

  updateAtmosphereFogAndExposure(nearest, dtReal);
  handleUIKeys();

  // HUD
  hud.updateTime(simClock);
  const flight = orbitCam.flight;
  hud.updateNav({
    mode: appMode,
    flight: flight ? { toName: bodyName(registry.get(flight.toId)), t: flight.t } : null,
    speed: ship.vel.length(),
    speedSetting: ship.speedSetting,
    focusName: appMode === 'orbit' ? bodyName(registry.get(orbitCam.focusId)) : null,
    nearest: nearest ? { name: bodyName(registry.get(nearest.id)), distSurface: nearest.distSurface } : null,
    gravity: appMode === 'walk' ? surfaceGravity(builder.bodies.get(ship.walk.bodyId).phys) : null,
  });
  updateTip(nearest);
  if (selectedId) {
    const t = registry.get(selectedId);
    const dist = Math.hypot(
      t.posKm[0] - ship.posKm[0], t.posKm[1] - ship.posKm[1], t.posKm[2] - ship.posKm[2]
    );
    const dSun = Math.hypot(t.posKm[0], t.posKm[1], t.posKm[2]);
    hud.updateTarget(targetInfo(selectedId, registry, dist, dSun));
  } else {
    hud.updateTarget(null);
  }
  // 标签遮挡：贴近天体时，地平线以下/天体背面的标签隐藏
  let occluder = null;
  if (nearest && nearest.distSurface < nearest.radiusKm * 2.5) {
    const e = builder.bodies.get(nearest.id);
    occluder = { pos: e.group.position, r: nearest.radiusKm * 0.999 };
  }
  labels.update(selectedId, occluder);
  document.getElementById('crosshair').style.display =
    appMode === 'orbit' ? 'none' : '';

  // 自适应近平面：保证近平面始终略小于最近天体表面，最大化深度精度。
  // 修复（#8）：5e-7 km 的极小近平面 + 1e15 km far 使深度缓冲精度不足，远处天体会
  // "穿透"近处天体（如土卫一未遮挡土星）。行走时保持极小近平面（贴地无裁切），在
  // 空间中按最近表面距离放大近平面（始终 < 最近表面，绝不裁切）。
  {
    let dNear = nearest ? nearest.distSurface : Infinity;
    for (const [, e] of tnoScene.entries) {
      const d = Math.hypot(
        e.posKm[0] - ship.posKm[0], e.posKm[1] - ship.posKm[1], e.posKm[2] - ship.posKm[2]
      ) - e.phys.radiusKm;
      if (d < dNear) dNear = d;
    }
    const want = appMode === 'walk'
      ? 5e-7
      : THREE.MathUtils.clamp(Math.max(dNear, 0) * 0.3, 5e-7, 1e10);
    if (Math.abs(want - camera.near) > camera.near * 0.02) {
      camera.near = want;
      camera.updateProjectionMatrix();
    }
  }

  // 移动端屏显控制：累加 held-zoom、刷新按钮状态
  touchControls?.update(appMode, nearestCache, orbitCam);

  fpsGuard(dtReal);
  input.endFrame();
  composer.render();
}

function findNearest() {
  let best = null;
  for (const [id, e] of builder.bodies) {
    const d = Math.hypot(
      e.posKm[0] - ship.posKm[0], e.posKm[1] - ship.posKm[1], e.posKm[2] - ship.posKm[2]
    );
    const ds = d - e.phys.radiusKm;
    if (!best || ds < best.distSurface) {
      best = {
        id, posKm: e.posKm, radiusKm: e.phys.radiusKm,
        landable: !!e.phys.landable, distSurface: ds,
      };
    }
  }
  return best;
}

function makeEnv(nearest) {
  return {
    nearest,
    getBodyQuat: (id) => builder.bodies.get(id).mesh.quaternion,
    getBodyPos: (id) => builder.bodies.get(id).posKm,
    heightFn: (id, dir) => terrainMgr.heightAt(id, dir),
    heightSolidFn: (id, dir) => terrainMgr.heightSolidAt(id, dir),
    isWater: (id, dir) => terrainMgr.isWater(id, dir),
    phys: (id) => builder.bodies.get(id).phys,
  };
}

function handleTimeKeys() {
  if (input.tapped('BracketRight')) hud.warpUp();
  if (input.tapped('BracketLeft')) hud.warpDown();
  if (input.tapped('KeyP')) simClock.paused = !simClock.paused;
  if (input.tapped('KeyN')) { simClock.setNow(); hud.warpReset(); simClock.paused = false; }
}

const PLANET_KEYS = {
  Digit1: 'mercury', Digit2: 'venus', Digit3: 'earth', Digit4: 'mars', Digit5: 'jupiter',
  Digit6: 'saturn', Digit7: 'uranus', Digit8: 'neptune', Digit9: 'pluto', Digit0: 'sun',
};

let orbitLinesOn = true;
let tnoOrbitsOn = false; // 海外天体（TNO）轨道线默认关闭（#4：数量多且远，避免画面杂乱）

function handleUIKeys() {
  for (const [key, id] of Object.entries(PLANET_KEYS)) {
    if (input.tapped(key)) flyTo(id); // GE 风格：快捷键直接前往
  }
  if (input.tapped('KeyO')) orbitLinesOn = !orbitLinesOn;
  if (input.tapped('KeyK')) { // K：海外天体轨道线独立开关（#4）
    tnoOrbitsOn = !tnoOrbitsOn;
    hud.tip(tnoOrbitsOn ? t('tip.tnoOrbitsOn') : t('tip.tnoOrbitsOff'));
  }
  // V：惯性观察模式（相机不随天体自转——配合时间加速观赏卫星/行星绕转，R9-1e）
  if (input.tapped('KeyV') && appMode === 'orbit' && !orbitCam.flight) {
    orbitCam.setInertial(!orbitCam.inertial, orbitEnv);
  }
  // 行走模式自动隐藏轨道辅助线（沉浸真实星空）
  const showOrbits = orbitLinesOn && appMode !== 'walk';
  for (const line of Object.values(builder.orbitLines.userData)) line.visible = showOrbits;
  // 海外天体（TNO）轨道线：独立开关（K），默认关闭（#4）
  const showTnoOrbits = tnoOrbitsOn && appMode !== 'walk';
  for (const [, e] of tnoScene.entries) {
    if (e.orbitLine) e.orbitLine.visible = showTnoOrbits;
  }
  if (input.tapped('KeyL')) labels.setVisible(!labels.visible);
  if (input.tapped('KeyH')) hud.toggleHelp();
}

function updateTip(nearest) {
  const atm = nearest ? builder.bodies.get(nearest.id)?.phys.atmosphere : null;
  if (performance.now() < focusTipUntil && appMode === 'orbit') {
    const tipId = orbitCam.pendingFocusId ?? selectedId ?? orbitCam.focusId;
    const tipName = bodyName(registry.get(tipId)) || t('word.target');
    if (orbitCam.pendingFocusId && orbitCam.pendingFocusId !== orbitCam.focusId) {
      hud.tip(t('tip.pendingFocus', { name: tipName }));
    } else {
      hud.tip(t('tip.lockedFocus', { name: tipName }));
    }
  } else if (orbitCam.flight) {
    hud.tip(t('tip.flyingTo', { name: bodyName(registry.get(orbitCam.flight.toId)) }));
  } else if (appMode === 'walk') {
    hud.tip(IS_MOBILE ? t('tip.walkTouch') : (input.locked ? t('tip.walkLocked') : t('tip.walkUnlocked')));
  } else if (nearest && nearest.landable &&
    nearest.distSurface < Math.max(20, nearest.radiusKm * 0.05)) {
    hud.tip(t('tip.landNear', { name: bodyName(registry.get(nearest.id)) }));
  } else if (appMode === 'orbit' && nearest && nearest.landable &&
    nearest.distSurface < nearest.radiusKm * 0.6) {
    hud.tip(t('tip.landAny'));
  } else if (nearest && !nearest.landable && nearest.id !== 'sun' && atm &&
    nearest.distSurface < atm.heightKm) {
    hud.tip(t('tip.enterAtmo', { name: bodyName(registry.get(nearest.id)) }));
  } else if (nearest && !nearest.landable && nearest.id !== 'sun' && nearest.distSurface < nearest.radiusKm * 0.5) {
    hud.tip(t('tip.gasGiant'));
  } else if (nearest && nearest.id === 'sun' && nearest.distSurface < nearest.radiusKm * 2) {
    hud.tip(t('tip.sun'));
  } else if (appMode === 'orbit' && orbitCam.inertial) {
    hud.tip(t('tip.inertial', { name: bodyName(registry.get(orbitCam.focusId)) }));
  } else {
    hud.tip(null);
  }
}

const immersionEl = document.getElementById('immersion');
let lastBoosted = null; // 上一个被密度增幅的大气网格（离开时必须复位为 1）

function updateAtmosphereFogAndExposure(nearest, dt) {
  const dSunAU = Math.hypot(ship.posKm[0], ship.posKm[1], ship.posKm[2]) / KM_PER_AU;
  // 近日处压低曝光以保留米粒组织细节；行星处≈1；外太阳系适度提亮
  exposureTarget = THREE.MathUtils.clamp(Math.pow(Math.max(dSunAU, 0.004), 0.85), 0.25, 12);

  let fogDensity = 0;
  let skyFade = 1; // 白昼大气内星空淡出（日光散射淹没星光，物理正确）
  let immersion = 0; // 气巨大气浸没（全屏云雾层，R7 #5）
  let immTint = null;
  let waterFx = null; // 水下环境（R9-2b）
  const fogColor = new THREE.Color(0x000000);
  if (nearest) {
    const e = builder.bodies.get(nearest.id);
    const atm = e.phys.atmosphere;
    const inAtmo = atm && nearest.distSurface < atm.heightKm;
    // 入气密度增幅：仅气巨/冰巨且相机在大气内（在大气外恒 1 → R5 外观零回归）
    if (e.atmoMesh) {
      const gasGiant = e.phys.type === 'gas' || e.phys.type === 'ice';
      const depth = inAtmo ? 1 - Math.max(nearest.distSurface, 0) / atm.heightKm : 0;
      e.atmoMesh.material.userData.uniforms.uBoost.value =
        gasGiant && inAtmo ? 1 + depth * depth * 24 : 1;
      if (lastBoosted && lastBoosted !== e.atmoMesh) {
        lastBoosted.material.userData.uniforms.uBoost.value = 1;
      }
      lastBoosted = e.atmoMesh;
      if (gasGiant && inAtmo) {
        // 浸没层：深入云层逐渐被云雾吞没（色调取自该行星散射系数）
        immersion = THREE.MathUtils.smoothstep(depth, 0.45, 0.85);
        const b = atm.rayleigh;
        const m = Math.max(b[0], b[1], b[2]);
        immTint = [b[0] / m, b[1] / m, b[2] / m];
      }
    }
    // 水下环境（R9-2b）：海面之下 → 深海雾 + 光照随深度指数衰减 + 星空遮蔽
    if (e.phys.landable && e.phys.surface?.ocean) {
      _rel.set(
        ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
      );
      const relLen = _rel.length();
      _q.copy(e.mesh.quaternion).invert();
      _rel.applyQuaternion(_q).normalize();
      const surfR = e.phys.radiusKm + 0.001;
      if (relLen < surfR - 0.00003 && terrainMgr.isWater(nearest.id, _rel)) {
        const depth = surfR - relLen; // km
        const dim = Math.exp(-depth * 1.6); // 海水对日光的指数衰减
        waterFx = { depth, dim };
      }
    }
    if (inAtmo) {
      const alt = Math.max(nearest.distSurface, 0);
      _rel.set(
        ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
      ).normalize();
      const sunDir = new THREE.Vector3(-e.posKm[0], -e.posKm[1], -e.posKm[2]).normalize();
      const sunElev = _rel.dot(sunDir);
      const b = atm.rayleigh;
      const m = Math.max(b[0], b[1], b[2]);
      const tint = new THREE.Color(b[0] / m, b[1] / m, b[2] / m);
      const day = THREE.MathUtils.clamp(sunElev * 4 + 0.1, 0, 1);
      const dusk = Math.max(0, 1 - Math.abs(sunElev) * 6);
      fogColor.copy(tint).multiplyScalar(0.5 * day / Math.max(dSunAU * dSunAU, 1e-4));
      fogColor.r += dusk * 0.25; fogColor.g += dusk * 0.1;
      fogDensity = (1 / 180) * Math.exp(-alt / atm.rayleighScaleKm) * (atm.multiplier >= 3 ? 4 : 1);
      // 星空淡出：白昼且身处稠密层内
      const density = Math.exp(-alt / (atm.rayleighScaleKm * 2.2));
      skyFade = THREE.MathUtils.clamp(1 - day * density * 0.97, 0, 1);
      // 穿越云层薄纱（R9-2b）：掠过云甲板高度时短暂白雾，入气更有层次
      if (e.cloudMesh && !waterFx) {
        const hc = e.phys.radiusKm * 0.0035;
        const veil = Math.exp(-(((alt - hc) / 1.8) ** 2)) * 0.4 * (0.3 + 0.7 * day);
        if (veil > immersion) {
          immersion = veil;
          immTint = [0.9, 0.94, 1.0];
        }
      }
    }
  }
  if (waterFx) {
    // 水下（R9-2b）：深海蓝绿雾 + 全屏浸没层随深度变暗 + 曝光衰减 + 星空遮蔽
    const { depth, dim } = waterFx;
    fogColor.setRGB(0.015 + 0.09 * dim, 0.09 + 0.2 * dim, 0.15 + 0.26 * dim);
    fogDensity = 16 + depth * 28;
    skyFade = Math.min(skyFade, 0.04);
    exposureTarget = Math.max(exposureTarget * Math.max(dim, 0.045), 0.05);
    const wr = Math.round((0.04 + 0.16 * dim) * 255);
    const wg = Math.round((0.12 + 0.34 * dim) * 255);
    const wb = Math.round((0.2 + 0.42 * dim) * 255);
    immersionEl.style.background =
      `radial-gradient(ellipse at center, rgba(${wr},${wg},${wb},0.45) 0%, rgba(${Math.round(wr * 0.4)},${Math.round(wg * 0.4)},${Math.round(wb * 0.4)},0.9) 85%)`;
    immersionEl.style.opacity = THREE.MathUtils.clamp(0.3 + depth * 0.5, 0, 0.9).toFixed(3);
  } else {
    // 气巨浸没层/穿云薄纱：全屏云雾渐显（深处白化吞没，离开时归零）
    if (immersion > 0 && immTint) {
      skyFade = Math.min(skyFade, 1 - immersion); // 云中看不见星空
      const cr = Math.round((immTint[0] * 0.45 + 0.55) * 255);
      const cg = Math.round((immTint[1] * 0.45 + 0.55) * 255);
      const cb = Math.round((immTint[2] * 0.45 + 0.55) * 255);
      immersionEl.style.background =
        `radial-gradient(ellipse at center, rgba(${cr},${cg},${cb},0.75) 0%, rgb(${cr},${cg},${cb}) 78%)`;
    }
    immersionEl.style.opacity = immersion.toFixed(3);
  }

  scene.fog.color.copy(fogColor);
  scene.fog.density = fogDensity;
  sky.setFade(skyFade);
  belts.visible = skyFade > 0.4;      // 带点云为统计表示，白昼天空中不可见
  oortCloud.group.visible = skyFade > 0.4; // 奥尔特云同理
  oortCloud.update(dSunAU);            // 进入云内部按距离淡出（#5）
  document.getElementById('labels').classList.toggle('daysky', skyFade < 0.5);

  // 行走在夜面时的微环境光（地照/星光下的暗适应，保证夜间探索可见性）
  ambient.intensity += ((appMode === 'walk' ? 0.14 : 0.02) - ambient.intensity) * Math.min(dt * 3, 1);

  // 方向性眼睛适应（#21）：进入强光快（瞳孔收缩 ~0.4s），进入暗处慢（视杆适应 ~1.4s）
  const adaptSpeed = exposureTarget < renderer.toneMappingExposure ? 2.5 : 0.7;
  renderer.toneMappingExposure +=
    (exposureTarget - renderer.toneMappingExposure) * Math.min(dt * adaptSpeed, 1);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ---- 可分享 URL（issue #1）----
// 格式：#<focusId>,<lat_deg>,<lon_deg>,<dist_km>,<jdTT>
// 仅编码探索模式相机状态；fly/walk 模式下只记录最近探索快照。

function applyLocationHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const parts = hash.split(',');
  if (parts.length < 4) return;
  const [focusId, latDeg, lonDeg, distKm, jdStr] = parts;
  if (!registry.has(focusId)) return;
  const DEG = Math.PI / 180;
  const lat = parseFloat(latDeg), lon = parseFloat(lonDeg), dist = parseFloat(distKm);
  if (!isFinite(lat) || !isFinite(lon) || !isFinite(dist) || dist <= 0) return;
  orbitCam.focusId = focusId;
  orbitCam.lat = lat * DEG;
  orbitCam.lon = lon * DEG;
  orbitCam.dist = dist;
  orbitCam.distTarget = dist;
  orbitCam.tilt = 0;
  orbitCam.heading = 0;
  orbitCam.panOffset.set(0, 0, 0);
  if (jdStr) {
    const jd = parseFloat(jdStr);
    if (isFinite(jd) && jd > 2000000) simClock.jdTT = jd;
  }
  syncShipToOrbit();
  select(focusId);
}

function copyShareUrl() {
  if (appMode !== 'orbit') return; // 仅在探索模式下共享（fly/walk 位置无法直接还原）
  const DEG = Math.PI / 180;
  const lat = (orbitCam.lat / DEG).toFixed(5);
  const lon = (orbitCam.lon / DEG).toFixed(5);
  const dist = orbitCam.dist.toFixed(3);
  const jd = simClock.jdTT.toFixed(3);
  const hash = `#${orbitCam.focusId},${lat},${lon},${dist},${jd}`;
  const url = location.href.replace(/#.*$/, '') + hash;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => hud.tip(t('tip.urlCopied')))
      .catch(() => { history.replaceState(null, '', hash); hud.tip(t('tip.urlUpdated')); });
  } else {
    history.replaceState(null, '', hash);
    hud.tip(t('tip.urlUpdated'));
  }
}
