// 3D 指南针小部件（#37）：屏幕右下角的轻量 SVG 指南针。
// 显示本地北、天顶、太阳方向、最近主要天体方向，三种模式（orbit/fly/walk）通用。
//
// 设计要点：
// - 纯 SVG 绘制（不引入 Three.js 渲染管线），每帧仅更新标记坐标，开销极低。
// - 方向向量接受 {x,y,z} / THREE.Vector3，四元数接受 {x,y,z,w} / THREE.Quaternion——
//   只读属性，无需 import Three.js，保持模块独立。
// - 投影模型：将世界方向经相机四元数逆变换到相机空间，再用 Lambert 方位等积投影
//   映射到圆盘：正前方 → 圆心，90° 偏轴 → 边缘，背后 → 边缘暗显（提示转向方向）。
// - i18n：先查全局 t()（主代理集成后生效），缺失时回退本地字典，确保开箱即用。

import { t, LANG } from './i18n.js';

// ── 本地 i18n 回退字典（主代理将这些 key 添加到 i18n.js 后自动接管）────────
const I18N = {
  'compass.title':   { zh: '指南针（C 切换）', en: 'Compass (C)', es: 'Brújula (C)', ja: 'コンパス（C）', fr: 'Boussole (C)', de: 'Kompass (C)', ru: 'Компас (C)' },
  'compass.sun':     { zh: '太阳', en: 'Sun', es: 'Sol', ja: '太陽', fr: 'Soleil', de: 'Sonne', ru: 'Солнце' },
  'compass.zenith':  { zh: '天顶', en: 'Zenith', es: 'Cenit', ja: '天頂', fr: 'Zénith', de: 'Zenit', ru: 'Зенит' },
  'compass.nearest': { zh: '最近天体', en: 'Nearest', es: 'Cercano', ja: '最寄り', fr: 'Proche', de: 'Nah', ru: 'Ближ.' },
  'compass.north':   { zh: '北', en: 'N', es: 'N', ja: '北', fr: 'N', de: 'N', ru: 'С' },
  'compass.south':   { zh: '南', en: 'S', es: 'S', ja: '南', fr: 'S', de: 'S', ru: 'Ю' },
  'compass.east':    { zh: '东', en: 'E', es: 'E', ja: '東', fr: 'E', de: 'O', ru: 'В' },
  'compass.west':    { zh: '西', en: 'W', es: 'O', ja: '西', fr: 'O', de: 'W', ru: 'З' },
};

/** 先查全局 i18n，缺失时回退本地字典 */
function tt(key, vars) {
  const g = t(key, vars);
  if (g !== key) return g;
  const e = I18N[key];
  if (!e) return key;
  let s = typeof e === 'string' ? e : (e[LANG] ?? e.en ?? e.zh ?? key);
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 48; // 圆盘半径（SVG 单位）

// ── 四元数 / 向量纯数学（不依赖 Three.js）──────────────────────────────

/**
 * 将向量 v 用单位四元数 q 的逆旋转（world → camera space）。
 * 对单位四元数，q⁻¹ = 共轭 = {x:-qx, y:-qy, z:-qz, w:qw}。
 * 旋转公式 v' = q⁻¹ ⊗ v ⊗ q 等价于用共轭做 q* v q*⁻¹ → 简化为 applyQuat(v, conjugate(q))。
 */
function applyInvQuat(v, q) {
  // 共轭
  const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;
  // t = 2 × cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v' = v + qw * t + cross(q.xyz, t)
  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

/** 三维叉积 */
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** 归一化（原地修改失败时返回 null） */
function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-12) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * 将世界方向投影到指南针圆盘坐标。
 * 相机约定（Three.js）：-Z = 前方, +X = 右, +Y = 上。
 * SVG 约定：+X = 右, +Y = 下（翻转 Y）。
 *
 * @returns {{x:number, y:number, opacity:number, behind:boolean}}
 */
function projectToDisc(dir, cameraQuat) {
  const cam = applyInvQuat(dir, cameraQuat);
  const sx = cam.x;
  const sy = -cam.y; // SVG Y 翻转
  const sz = cam.z;  // >0 = 在相机背后

  if (sz <= 0.001) {
    // 前半球：Lambert 方位投影，正前方→圆心，90°偏轴→边缘
    return { x: sx * R, y: sy * R, opacity: 1, behind: false };
  }
  // 后半球：投影到边缘并暗显，指示需要转向的方向
  const len = Math.hypot(sx, sy);
  if (len < 1e-6) {
    return { x: 0, y: R * 0.82, opacity: 0.22, behind: true };
  }
  return {
    x: (sx / len) * R * 0.82,
    y: (sy / len) * R * 0.82,
    opacity: 0.22,
    behind: true,
  };
}

export class Compass {
  /**
   * @param {HTMLElement} container 挂载容器（通常 document.body）
   */
  constructor(container) {
    this.visible = true;
    this._build(container);
  }

  _build(container) {
    this.root = document.createElement('div');
    this.root.className = 'compass-widget';
    this.root.style.cssText = [
      'position:fixed', 'bottom:14px', 'right:14px', 'z-index:15',
      'pointer-events:none', 'opacity:0.88',
      'transition:opacity 0.3s',
      'font-family:inherit',
    ].join(';');

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '120');
    svg.setAttribute('height', '120');
    svg.setAttribute('viewBox', '-60 -60 120 120');
    svg.setAttribute('aria-label', tt('compass.title'));

    // ── 背景圆盘 ──
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', '0'); bg.setAttribute('cy', '0'); bg.setAttribute('r', String(R + 4));
    bg.setAttribute('fill', 'rgba(8,16,28,0.55)');
    bg.setAttribute('stroke', 'rgba(110,160,210,0.28)');
    bg.setAttribute('stroke-width', '1');
    svg.appendChild(bg);

    // ── 内圈（地平线参考）──
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', '0'); inner.setAttribute('cy', '0'); inner.setAttribute('r', String(R * 0.5));
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', 'rgba(110,160,210,0.12)');
    inner.setAttribute('stroke-width', '0.5');
    svg.appendChild(inner);

    // ── 十字刻度线 ──
    for (const [x1, y1, x2, y2] of [[0, -R, 0, R], [-R, 0, R, 0]]) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', 'rgba(110,160,210,0.1)');
      line.setAttribute('stroke-width', '0.5');
      svg.appendChild(line);
    }

    // ── 方向标记容器（每帧更新位置）──
    // 顺序：先画 cardinal（底层），再画 sun/body/zenith（上层）
    this._markers = {};

    // Cardinal: N / S / E / W
    for (const key of ['north', 'south', 'east', 'west']) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '10');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', key === 'north' ? 'rgba(255,233,176,0.9)' : 'rgba(160,190,220,0.6)');
      text.setAttribute('opacity', '0');
      text.textContent = tt('compass.' + key);
      svg.appendChild(text);
      this._markers[key] = { el: text, opacity: 0 };
    }

    // Sun marker
    this._markers.sun = this._mkMarker(svg, '#ffcc55', '☉', 9);

    // Nearest body marker
    this._markers.body = this._mkMarker(svg, '#7fd4ff', '●', 7);

    // Zenith marker
    this._markers.zenith = this._mkMarker(svg, '#a8e8a8', '↑', 9);

    // ── 圆心（相机前方）──
    const center = document.createElementNS(SVG_NS, 'circle');
    center.setAttribute('cx', '0'); center.setAttribute('cy', '0'); center.setAttribute('r', '1.5');
    center.setAttribute('fill', 'rgba(160,200,240,0.5)');
    svg.appendChild(center);

    // ── 模式标签 ──
    this._modeLabel = document.createElementNS(SVG_NS, 'text');
    this._modeLabel.setAttribute('x', '0');
    this._modeLabel.setAttribute('y', String(R + 16));
    this._modeLabel.setAttribute('text-anchor', 'middle');
    this._modeLabel.setAttribute('font-size', '8');
    this._modeLabel.setAttribute('fill', 'rgba(160,190,220,0.5)');
    svg.appendChild(this._modeLabel);

    this.root.appendChild(svg);
    container.appendChild(this.root);
  }

  /** 创建一个标记组（圆点 + 符号文字 + 标签文字） */
  _mkMarker(svg, color, symbol, fontSize) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('opacity', '0');

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', color);
    g.appendChild(dot);

    const sym = document.createElementNS(SVG_NS, 'text');
    sym.setAttribute('text-anchor', 'middle');
    sym.setAttribute('dominant-baseline', 'central');
    sym.setAttribute('font-size', String(fontSize));
    sym.setAttribute('fill', color);
    sym.setAttribute('y', '-8');
    sym.textContent = symbol;
    g.appendChild(sym);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('font-size', '6');
    label.setAttribute('fill', color);
    label.setAttribute('y', '10');
    g.appendChild(label);

    svg.appendChild(g);
    return { el: g, dot, sym, label, opacity: 0 };
  }

  /** 更新单个标记的位置与可见性 */
  _updateMarker(key, dir, quat, labelText) {
    const m = this._markers[key];
    if (!m || !dir) {
      m.el.setAttribute('opacity', '0');
      m.opacity = 0;
      return;
    }
    const p = projectToDisc(dir, quat);
    m.el.setAttribute('transform', `translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`);
    m.el.setAttribute('opacity', String(p.opacity));
    if (labelText !== undefined) m.label.textContent = labelText;
    m.opacity = p.opacity;
  }

  /**
   * 每帧更新指南针标记。
   * @param {object} state
   *   mode: 'orbit'|'fly'|'walk'
   *   cameraQuat: {x,y,z,w} — 相机世界四元数
   *   sunDir: {x,y,z}|null — 指向太阳的单位向量（世界空间）
   *   nearestBodyDir: {x,y,z}|null — 指向最近天体的单位向量
   *   nearestBodyName: string|null
   *   northDir: {x,y,z}|null — 本地北方向（天体自转北极方向）
   *   zenithDir: {x,y,z}|null — 本地天顶方向（远离天体中心）
   */
  update(state) {
    if (!this.visible || !state) return;
    const q = state.cameraQuat;
    if (!q) return;

    // ── 太阳 ──
    this._updateMarker('sun', state.sunDir, q, state.sunDir ? tt('compass.sun') : '');

    // ── 最近天体 ──
    this._updateMarker('body', state.nearestBodyDir, q,
      state.nearestBodyDir ? (state.nearestBodyName || tt('compass.nearest')) : '');

    // ── 天顶 ──
    this._updateMarker('zenith', state.zenithDir, q, state.zenithDir ? tt('compass.zenith') : '');

    // ── 基本方位 N / S / E / W ──
    const north = state.northDir ? normalize3(state.northDir) : null;
    const zenith = state.zenithDir ? normalize3(state.zenithDir) : null;

    if (north) {
      this._updateMarker('north', north, q);
      this._updateMarker('south', { x: -north.x, y: -north.y, z: -north.z }, q);

      // East = cross(North, Zenith)（右手系：N × Up = East）
      if (zenith) {
        const east = normalize3(cross3(north, zenith));
        if (east) {
          this._updateMarker('east', east, q);
          this._updateMarker('west', { x: -east.x, y: -east.y, z: -east.z }, q);
        } else {
          // 北与天顶平行（极点）：无法定义东/西
          this._hideMarker('east');
          this._hideMarker('west');
        }
      } else {
        this._hideMarker('east');
        this._hideMarker('west');
      }
    } else {
      this._hideMarker('north');
      this._hideMarker('south');
      this._hideMarker('east');
      this._hideMarker('west');
    }

    // ── 模式标签 ──
    if (state.mode) {
      this._modeLabel.textContent = state.mode.toUpperCase();
    }
  }

  _hideMarker(key) {
    const m = this._markers[key];
    if (m) {
      m.el.setAttribute('opacity', '0');
      m.opacity = 0;
    }
  }

  setVisible(on) {
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  dispose() {
    this.root.remove();
  }
}
