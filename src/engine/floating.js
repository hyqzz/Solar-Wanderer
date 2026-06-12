// 浮动原点世界管理器：所有实体的绝对坐标用 double（Float64Array, 世界轴, km）保存，
// 每帧将 mesh.position 设为 (绝对坐标 − 相机绝对坐标)。GPU 端只见相对小量，
// 配合 logarithmicDepthBuffer 实现从 10cm 到 10^10 km 的无抖动渲染。

import * as THREE from 'three';

export class World {
  constructor() {
    this.entities = []; // { posKm: Float64Array(3), object3D }
  }

  register(posKm, object3D) {
    const e = { posKm, object3D };
    this.entities.push(e);
    return e;
  }

  /** cameraPosKm: Float64Array(3) 绝对坐标（相机/玩家） */
  update(cameraPosKm) {
    for (const e of this.entities) {
      e.object3D.position.set(
        e.posKm[0] - cameraPosKm[0],
        e.posKm[1] - cameraPosKm[1],
        e.posKm[2] - cameraPosKm[2]
      );
    }
  }
}

const _v = new THREE.Vector3();

/** 绝对坐标差 → 距离 km */
export function distKm(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 从绝对坐标 a 指向 b 的单位向量（three Vector3，世界轴） */
export function dirTo(a, b, out = _v) {
  out.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return out.normalize();
}
