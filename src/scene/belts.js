// 小行星主带与柯伊伯带（统计分布点云，确定性种子）+ 黄道尘光。

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';

function makeBelt({ count, aMinAU, aMaxAU, inclSigmaDeg, color, size, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  for (let i = 0; i < count; i++) {
    const a = (aMinAU + (aMaxAU - aMinAU) * Math.sqrt(rnd())) * KM_PER_AU;
    const th = rnd() * Math.PI * 2;
    const inc = gauss() * inclSigmaDeg * (Math.PI / 180);
    const r = a * (1 + 0.12 * gauss());
    // 世界轴：黄道面为 XZ 平面
    pos[i * 3] = r * Math.cos(th) * Math.cos(inc);
    pos[i * 3 + 1] = r * Math.sin(inc);
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(inc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, transparent: true, opacity,
    depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function createBelts() {
  const group = new THREE.Group();
  // 主带 2.1–3.4 AU
  group.add(makeBelt({
    count: 14000, aMinAU: 2.1, aMaxAU: 3.4, inclSigmaDeg: 9,
    color: 0x9a8e80, size: 1.3, opacity: 0.5, seed: 4242,
  }));
  // 柯伊伯带 32–48 AU
  group.add(makeBelt({
    count: 9000, aMinAU: 32, aMaxAU: 48, inclSigmaDeg: 4,
    color: 0x8fa3b8, size: 1.3, opacity: 0.42, seed: 7777,
  }));

  // 黄道尘光：黄道面内暗淡光晕盘
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,240,220,0.5)');
  g.addColorStop(0.25, 'rgba(255,235,210,0.12)');
  g.addColorStop(1, 'rgba(255,230,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const dust = new THREE.Mesh(
    new THREE.PlaneGeometry(6 * KM_PER_AU, 6 * KM_PER_AU),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.11, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    })
  );
  dust.rotation.x = -Math.PI / 2; // 置于黄道面（世界 XZ）
  dust.renderOrder = -5;
  group.add(dust);
  return group;
}
