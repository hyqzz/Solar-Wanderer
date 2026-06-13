// 天体标签：DOM 投影标签 + 准星瞄准选择。
// 指针锁定时：准星附近 5° 内最近的天体高亮，单击选中；
// 未锁定时：标签可直接点击选中。

import * as THREE from 'three';
import { formatDist } from '../config.js';

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();

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
    el.className = 'body-label' + (target.kind === 'moon' ? ' label-moon' : '') +
      (target.kind === 'poi' ? ' label-poi' : '') +
      (target.kind === 'fixstar' ? ' label-star' : '');
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
   * @param occluder {pos:Vector3(相机相对), r:km}|null 近旁天体遮挡（站在星球上看不到地平线下的标签）
   */
  update(selectedId, occluder = null) {
    if (!this.visible) return;
    const w = window.innerWidth, h = window.innerHeight;
    let bestAim = null, bestAng = 0.09; // ~5°
    // 相机前向（世界）：用于稳定的"是否在相机前方"判定，替代易抖动的 ndc.z>1
    this.camera.getWorldDirection(_fwd);
    for (const item of this.items.values()) {
      const { el, target } = item;
      const rel = target.getRelPos(_v);
      const dist = rel.length();

      // 在相机后方？用视线方向点积判定（稳定，不受 far=1e15 时 ndc.z≈1 浮点抖动影响）
      // —— 这是远处标签持续闪烁的根因（#3）：原 ndc.z>1 在远平面附近来回跳变。
      const vz = rel.x * _fwd.x + rel.y * _fwd.y + rel.z * _fwd.z;
      if (vz <= 0) { el.style.display = 'none'; item._hideStreak = 0; continue; }

      // 球体遮挡测试：视线与近旁天体相交且目标在交点之后 → 隐藏
      let wantHide = false;
      if (occluder && dist > 1) {
        const tc = (rel.x * occluder.pos.x + rel.y * occluder.pos.y + rel.z * occluder.pos.z) / dist;
        if (tc > 0 && tc < dist - occluder.r * 0.5) {
          const d2 = occluder.pos.lengthSq() - tc * tc;
          if (d2 < occluder.r * occluder.r * 0.96) wantHide = true;
        }
      }
      const ndc = rel.clone().project(this.camera);
      if (ndc.x < -1.08 || ndc.x > 1.08 || ndc.y < -1.08 || ndc.y > 1.08) wantHide = true;
      // 太近（已充满视野）时隐藏标签
      if (dist < target.radiusKm * 1.6) wantHide = true;

      // 迟滞：连续 2 帧想隐藏才真正隐藏；想显示则立即显示（消除边界单帧抖动）
      if (wantHide) {
        item._hideStreak = (item._hideStreak || 0) + 1;
        if (item._hideStreak >= 2) { el.style.display = 'none'; continue; }
      } else {
        item._hideStreak = 0;
      }

      el.style.display = '';
      const x = ((ndc.x + 1) / 2) * w;
      const y = ((1 - ndc.y) / 2) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.querySelector('.ld').textContent = target.distText ?? formatDist(dist);
      el.classList.toggle('selected', target.id === selectedId);
      if (target.kind !== 'fixstar') {
        const angOff = Math.hypot(ndc.x * (w / h), ndc.y) * 0.5 * (this.camera.fov * Math.PI / 180);
        if (angOff < bestAng) { bestAng = angOff; bestAim = target.id; }
      }
    }
    // 瞄准高亮
    if (this.aimedId && this.aimedId !== bestAim) {
      this.items.get(this.aimedId)?.el.classList.remove('aimed');
    }
    if (bestAim) this.items.get(bestAim)?.el.classList.add('aimed');
    this.aimedId = bestAim;
  }
}
