// 比例参照物（#38）：可切换的人体剪影与地月真实比例对比。
//
// 两个独立功能：
// 1. 人体剪影（toggleHuman）：在相机前方放置 1.7 m 高的人体轮廓，
//    让用户在贴近天体表面时直观感受尺度。仅在近地面（近平面足够小）时可见——
//    高空轨道下 1.7 m 人体本就不可见，这是物理正确的行为。
// 2. 比较模式（toggleCompare）：将地球与月球以真实直径比和距离比并排显示，
//    附带教育性标注（直径、距离、光行时间、当前缩放比）。
//    3D 球体使用真实半径构建、整组统一缩放，比例严格正确。
//
// 浮动原点：相机恒在原点，人体 / 比较组不注册到 world，直接挂 scene 即可。
// 近平面适应：比较组距离 = max(near×5, 500) km，确保不被近平面裁切。

import * as THREE from 'three';
import { t, LANG } from './i18n.js';

// ── 真实天文数据（来源：NASA/IAU，与 bodies.js 一致）──────────────────
const EARTH_RADIUS_KM = 6371.0;
const MOON_RADIUS_KM = 1737.4;
const EARTH_MOON_DIST_KM = 384400; // 平均距离
const LIGHT_TIME_S = EARTH_MOON_DIST_KM / 299792.458; // ≈1.28 s

// ── 本地 i18n 回退（主代理将这些 key 加入 i18n.js 后自动接管）──────────
const I18N = {
  'scaleref.title':     { zh: '地球 – 月球 比例对比', en: 'Earth – Moon Scale', es: 'Escala Tierra – Luna', ja: '地球–月 スケール比較', fr: 'Échelle Terre – Lune', de: 'Erde – Mond Maßstab', ru: 'Масштаб Земля – Луна' },
  'scaleref.earthD':    { zh: '地球直径', en: 'Earth Ø', es: 'Ø Tierra', ja: '地球直径', fr: 'Ø Terre', de: 'Erde Ø', ru: 'Земля Ø' },
  'scaleref.moonD':     { zh: '月球直径', en: 'Moon Ø', es: 'Ø Luna', ja: '月直径', fr: 'Ø Lune', de: 'Mond Ø', ru: 'Луна Ø' },
  'scaleref.distance':  { zh: '平均距离', en: 'Avg. distance', es: 'Dist. media', ja: '平均距離', fr: 'Dist. moyenne', de: 'Ø Entfernung', ru: 'Ср. расстояние' },
  'scaleref.lightTime': { zh: '光行时间', en: 'Light travel', es: 'Tiempo de luz', ja: '光到達時間', fr: 'Temps de lumière', de: 'Lichtzeit', ru: 'Световое время' },
  'scaleref.scale':     { zh: '缩放比', en: 'Scale', es: 'Escala', ja: '縮尺', fr: 'Échelle', de: 'Maßstab', ru: 'Масштаб' },
  'scaleref.human':     { zh: '人体参照 1.7 m', en: 'Human reference 1.7 m', es: 'Referencia humana 1.7 m', ja: '人体参照 1.7 m', fr: 'Référence humaine 1,7 m', de: 'Mensch-Referenz 1,7 m', ru: 'Эталон человека 1,7 м' },
};

function tt(key, vars) {
  const g = t(key, vars);
  if (g !== key) return g;
  const e = I18N[key];
  if (!e) return key;
  let s = typeof e === 'string' ? e : (e[LANG] ?? e.en ?? e.zh ?? key);
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

// 复用临时向量，避免每帧分配
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pos = new THREE.Vector3();

export class ScaleReference {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._human = null;       // THREE.Group
    this._humanGeos = [];
    this._humanMat = null;
    this._compareGroup = null; // THREE.Group
    this._compareGeos = [];
    this._compareMats = [];
    this._compareOverlay = null;
    this._curCompareScale = 0;
  }

  // ── 人体剪影 ────────────────────────────────────────────────────────

  /** 切换人体剪影显示。返回新状态（true=显示） */
  toggleHuman() {
    if (this._human) {
      this._disposeHuman();
      return false;
    }
    this._createHuman();
    return true;
  }

  _createHuman() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });

    // 身体（胶囊）：半径 0.2m，圆柱 1.1m → 总高 1.5m
    const bodyGeo = new THREE.CapsuleGeometry(0.0002, 0.0011, 4, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.00075; // 胶囊中心，底部在 y=0
    group.add(body);

    // 头部（球体）：半径 0.12m
    const headGeo = new THREE.SphereGeometry(0.00012, 12, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 0.00162; // 身体顶部 + 头半径
    group.add(head);

    // 总高 ≈ 0.00174 km = 1.74m（接近 1.7m 目标）
    this._human = group;
    this._humanGeos = [bodyGeo, headGeo];
    this._humanMat = mat;
    this.scene.add(group);
  }

  _updateHuman(camPos, camQuat) {
    _forward.set(0, 0, -1).applyQuaternion(camQuat);
    _right.set(1, 0, 0).applyQuaternion(camQuat);
    _up.set(0, 1, 0).applyQuaternion(camQuat);

    // 放在相机前方 5m、右侧 2m、下方 1.5m（脚部约在相机视线高度）
    _pos.copy(camPos)
      .addScaledVector(_forward, 0.005)
      .addScaledVector(_right, 0.002)
      .addScaledVector(_up, -0.0015);
    this._human.position.copy(_pos);
  }

  _disposeHuman() {
    if (!this._human) return;
    this.scene.remove(this._human);
    for (const g of this._humanGeos) g.dispose();
    this._humanMat?.dispose();
    this._human = null;
    this._humanGeos = [];
    this._humanMat = null;
  }

  // ── 地月比较模式 ────────────────────────────────────────────────────

  /** 切换地月比较模式。返回新状态（true=显示） */
  toggleCompare() {
    if (this._compareGroup) {
      this._disposeCompare();
      return false;
    }
    this._createCompare();
    return true;
  }

  _createCompare() {
    const group = new THREE.Group();

    // 地球：真实半径构建，整组缩放后比例不变
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM, 32, 16);
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x2266bb });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.position.x = -EARTH_MOON_DIST_KM / 2;
    group.add(earth);

    // 月球：真实半径（=地球的 27.3%）
    const moonGeo = new THREE.SphereGeometry(MOON_RADIUS_KM, 24, 12);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.x = EARTH_MOON_DIST_KM / 2;
    group.add(moon);

    // 距离参考线
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-EARTH_MOON_DIST_KM / 2, 0, 0),
      new THREE.Vector3(EARTH_MOON_DIST_KM / 2, 0, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x6688aa, transparent: true, opacity: 0.35 });
    const line = new THREE.Line(lineGeo, lineMat);
    group.add(line);

    this._compareGroup = group;
    this._compareGeos = [earthGeo, moonGeo, lineGeo];
    this._compareMats = [earthMat, moonMat, lineMat];
    this.scene.add(group);

    // HTML 标注面板
    this._createCompareOverlay();
  }

  _createCompareOverlay() {
    const el = document.createElement('div');
    el.className = 'scaleref-overlay';
    el.style.cssText = [
      'position:fixed', 'top:14px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:15', 'pointer-events:none',
      'background:rgba(8,16,28,0.62)', 'border:1px solid rgba(110,160,210,0.25)',
      'border-radius:8px', 'padding:10px 16px',
      'font-size:13px', 'line-height:1.7', 'color:#cfe3f5',
      'backdrop-filter:blur(6px)', 'white-space:nowrap',
      'font-family:inherit',
    ].join(';');

    const fmt = (n) => n.toLocaleString();
    el.innerHTML = [
      `<div style="font-size:14px;font-weight:bold;color:#e8f4ff;margin-bottom:4px;">${tt('scaleref.title')}</div>`,
      `<div>${tt('scaleref.earthD')}: <b>${fmt(Math.round(EARTH_RADIUS_KM * 2))}</b> km</div>`,
      `<div>${tt('scaleref.moonD')}: <b>${fmt(Math.round(MOON_RADIUS_KM * 2))}</b> km <span style="opacity:0.6">(${(MOON_RADIUS_KM / EARTH_RADIUS_KM * 100).toFixed(1)}%)</span></div>`,
      `<div>${tt('scaleref.distance')}: <b>${fmt(EARTH_MOON_DIST_KM)}</b> km <span style="opacity:0.6">(${(EARTH_MOON_DIST_KM / EARTH_RADIUS_KM).toFixed(1)} R⊕)</span></div>`,
      `<div>${tt('scaleref.lightTime')}: <b>${LIGHT_TIME_S.toFixed(2)}</b> s</div>`,
      `<div class="sr-scale-row">${tt('scaleref.scale')}: <b class="sr-scale-val">1 : …</b></div>`,
    ].join('');

    document.body.appendChild(el);
    this._compareOverlay = el;
  }

  _updateCompare(camPos, camQuat) {
    // 根据相机 FOV / 近平面动态计算放置距离与缩放，确保地月完整入画
    const fovRad = this.camera.fov * Math.PI / 180;
    const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * this.camera.aspect);
    const limitingFov = Math.min(fovRad, hFovRad);

    // 放置距离：超越近平面 × 5（防裁切），且至少 500 km
    const minDist = Math.max(this.camera.near * 5 + 10, 500);
    // 地月连线占视野宽度的 ~60%
    const viewWidth = 2 * minDist * Math.tan(limitingFov / 2);
    const scale = (viewWidth * 0.6) / EARTH_MOON_DIST_KM;

    _forward.set(0, 0, -1).applyQuaternion(camQuat);
    this._compareGroup.position.copy(camPos).addScaledVector(_forward, minDist);
    this._compareGroup.scale.setScalar(scale);

    // 更新缩放比标注（仅在变化 >1% 时写 DOM）
    if (Math.abs(this._curCompareScale - scale) / Math.max(scale, 1e-9) > 0.01) {
      this._curCompareScale = scale;
      const ratio = Math.round(1 / scale);
      const val = this._compareOverlay?.querySelector('.sr-scale-val');
      if (val) val.textContent = `1 : ${ratio.toLocaleString()}`;
    }
  }

  _disposeCompare() {
    if (!this._compareGroup) return;
    this.scene.remove(this._compareGroup);
    for (const g of this._compareGeos) g.dispose();
    for (const m of this._compareMats) m.dispose();
    this._compareOverlay?.remove();
    this._compareGroup = null;
    this._compareGeos = [];
    this._compareMats = [];
    this._compareOverlay = null;
    this._curCompareScale = 0;
  }

  // ── 每帧更新 ────────────────────────────────────────────────────────

  /**
   * 每帧调用，保持人体 / 比较组跟随相机。
   * @param {object} [state] 可选（预留扩展）；默认从 this.camera 读取
   */
  update(state = {}) {
    if (!this._human && !this._compareGroup) return;
    const camPos = this.camera.position;
    const camQuat = this.camera.quaternion;
    if (this._human) this._updateHuman(camPos, camQuat);
    if (this._compareGroup) this._updateCompare(camPos, camQuat);
  }

  /** 彻底释放所有资源 */
  dispose() {
    this._disposeHuman();
    this._disposeCompare();
  }
}
