// 天体标签：DOM 投影标签 + 准星瞄准选择。
// 指针锁定时：准星附近 5° 内最近的天体高亮，单击选中；
// 未锁定时：标签可直接点击选中。

import * as THREE from 'three';
import { formatDist } from '../config.js';

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
// 投影用的暂存向量。此前每帧对每个标签都新分配一个 Vector3 再投影——
// Vector3 分配（199 个/帧），纯粹给 GC 添堵，且与渲染预算直接抢时间。
const _ndc = new THREE.Vector3();

export class Labels {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.items = new Map(); // id -> { el, target }
    this.onSelect = null;
    this.onFlyTo = null;
    this.aimedId = null;
    this.visible = true;
  }

  /** target: { id, nameZh, getRelPos():Vector3(相机相对km), radiusKm, kind, distText? } */
  add(target) {
    const el = document.createElement('div');
    // label-faint：白昼天空（daysky）中物理上不可见的暗弱目标，整体隐藏保沉浸感
    // （TNO ≥17 等、彗星、探测器、边界/区域标记在白昼地表天空中均不可见）
    const faint = ['tno', 'comet', 'probe', 'boundary', 'region'].includes(target.kind);
    el.className = 'body-label' + (target.kind === 'moon' ? ' label-moon' : '') +
      (target.kind === 'poi' ? ' label-poi' : '') +
      (target.kind === 'fixstar' ? ' label-star' : '') +
      (faint ? ' label-faint' : '');
    el.innerHTML = `<span class="ln">${target.name ?? target.nameZh}</span><span class="ld"></span>`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSelect?.(target.id);
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.onFlyTo?.(target.id); // GE 风格：双击前往
    });
    this.container.appendChild(el);
    this.items.set(target.id, { el, target });
  }

  setVisible(v) {
    this.visible = v;
    this.container.style.display = v ? '' : 'none';
  }

  /**
   * @param occluders 遮挡体数组 [{id, pos:Vector3(相机相对), r:km}] —— 所有投影角足够大的天体都参与
   * （修复：原实现仅在相机贴近最近天体 2.5R 内才遮挡，远处天体的标签会叠加在眼前行星盘面上）
   */
  /** 隐藏一个标签（带状态缓存，避免每帧重复写同一样式） */
  _hide(item, el) {
    if (item._shown !== false) { el.style.display = 'none'; item._shown = false; }
  }

  update(selectedId, occluders = []) {
    if (!this.visible) return;
    const occList = Array.isArray(occluders) ? occluders : (occluders ? [occluders] : []);
    const w = window.innerWidth, h = window.innerHeight;
    let bestAim = null, bestAng = 0.09; // ~5°
    const frame = []; // 本帧可见标签（重叠避让用）
    // 相机前向（世界）：用于稳定的"是否在相机前方"判定，替代易抖动的 ndc.z>1
    this.camera.getWorldDirection(_fwd);
    for (const item of this.items.values()) {
      const { el, target } = item;
      const rel = target.getRelPos(_v);
      const dist = rel.length();

      // 在相机后方？用视线方向点积判定（稳定，不受 far=1e15 时 ndc.z≈1 浮点抖动影响）
      // —— 这是远处标签持续闪烁的根因（#3）：原 ndc.z>1 在远平面附近来回跳变。
      const vz = rel.x * _fwd.x + rel.y * _fwd.y + rel.z * _fwd.z;
      if (vz <= 0) { this._hide(item, el); item._hideStreak = 0; continue; }

      // 球体遮挡测试：视线与任一前景天体相交且目标在交点之后 → 隐藏
      let wantHide = false;
      if (occList.length && dist > 1) {
        for (const oc of occList) {
          if (oc.id === target.id) continue; // 自身标签不遮挡
          const tc = (rel.x * oc.pos.x + rel.y * oc.pos.y + rel.z * oc.pos.z) / dist;
          if (tc > 0 && tc < dist - oc.r * 0.5) {
            const d2 = oc.pos.lengthSq() - tc * tc;
            if (d2 < oc.r * oc.r * 0.96) { wantHide = true; break; }
          }
        }
      }
      const ndc = _ndc.copy(rel).project(this.camera);
      if (ndc.x < -1.08 || ndc.x > 1.08 || ndc.y < -1.08 || ndc.y > 1.08) wantHide = true;
      // 太近（已充满视野）时隐藏标签
      if (dist < target.radiusKm * 1.6) wantHide = true;

      // 迟滞：连续 2 帧想隐藏才真正隐藏；想显示则立即显示（消除边界单帧抖动）
      if (wantHide) {
        item._hideStreak = (item._hideStreak || 0) + 1;
        if (item._hideStreak >= 2) { this._hide(item, el); continue; }
      } else {
        item._hideStreak = 0;
      }

      // 只在状态真的变化时写样式：`display=''` 每帧写 199 次是无效的样式失效
      // 与重排风险（浏览器的样式系统仍要比较新值）。
      if (item._shown !== true) { el.style.display = ''; item._shown = true; }
      const x = ((ndc.x + 1) / 2) * w;
      const y = ((1 - ndc.y) / 2) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // 距离数字只在**选中**或**准星瞄准**的天体上显示。
      // 此前每帧给全部标签写距离，天空看上去像一块测量仪表盘——
      // 真实星空里你不会在每颗星旁边看到"3.2 AU"。
      const detail = target.id === selectedId || target.id === this.aimedId;
      // 缓存子元素：每帧对每个标签做 querySelector 会在 199 个标签上白扔掉
      // 若干毫秒（直接与渲染预算抢）。
      const ld = item._ld ?? (item._ld = el.querySelector('.ld'));
      if (ld) ld.textContent = detail ? (target.distText ?? formatDist(dist)) : '';
      el.classList.toggle('selected', target.id === selectedId);
      // 收入本帧可见集，供重叠避让（优先级：选中 > 视半径大 > 近）
      const name = target.name ?? target.nameZh ?? '';
      frame.push({
        id: target.id, el, x, y,
        bw: Math.min(40 + name.length * 8, 150), bh: 30,
        score: (target.id === selectedId ? 1e9 : 0) + (target.radiusKm / Math.max(dist, 1e-6)),
      });
      if (target.kind !== 'fixstar') {
        const angOff = Math.hypot(ndc.x * (w / h), ndc.y) * 0.5 * (this.camera.fov * Math.PI / 180);
        if (angOff < bestAng) { bestAng = angOff; bestAim = target.id; }
      }
    }

    // 标签防重叠：按优先级贪心保留，重叠的低优先级本帧隐藏
    // （优先级由视半径/选中态决定，帧间稳定，不会闪烁）
    frame.sort((a, b) => b.score - a.score);
    const accepted = [];
    for (const it of frame) {
      const overlap = accepted.some((a) =>
        Math.abs(a.x - it.x) < (a.bw + it.bw) / 2 && Math.abs(a.y - it.y) < (a.bh + it.bh) / 2);
      if (overlap) this._hide(it, it.el);
      else accepted.push(it);
    }
    // 瞄准高亮
    if (this.aimedId && this.aimedId !== bestAim) {
      this.items.get(this.aimedId)?.el.classList.remove('aimed');
    }
    if (bestAim) this.items.get(bestAim)?.el.classList.add('aimed');
    this.aimedId = bestAim;
  }
}
