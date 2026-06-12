// 天体标签：DOM 投影标签 + 准星瞄准选择。
// 指针锁定时：准星附近 5° 内最近的天体高亮，单击选中；
// 未锁定时：标签可直接点击选中。

import * as THREE from 'three';
import { formatDist } from '../config.js';

const _v = new THREE.Vector3();

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
    el.innerHTML = `<span class="ln">${target.nameZh}</span><span class="ld"></span>`;
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
    for (const { el, target } of this.items.values()) {
      const rel = target.getRelPos(_v);
      const dist = rel.length();
      // 球体遮挡测试：视线与近旁天体相交且目标在交点之后 → 隐藏
      if (occluder && dist > 1) {
        const tc = (rel.x * occluder.pos.x + rel.y * occluder.pos.y + rel.z * occluder.pos.z) / dist;
        if (tc > 0 && tc < dist - occluder.r * 0.5) {
          const d2 = occluder.pos.lengthSq() - tc * tc;
          if (d2 < occluder.r * occluder.r * 0.96) {
            el.style.display = 'none';
            continue;
          }
        }
      }
      // 视线方向角（用于准星瞄准）
      const ndc = rel.clone().project(this.camera);
      const behind = ndc.z > 1 || ndc.z < -1;
      if (behind || ndc.x < -1.05 || ndc.x > 1.05 || ndc.y < -1.05 || ndc.y > 1.05) {
        el.style.display = 'none';
        continue;
      }
      // 太近（已充满视野）时隐藏标签
      if (dist < target.radiusKm * 1.6) {
        el.style.display = 'none';
        continue;
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
