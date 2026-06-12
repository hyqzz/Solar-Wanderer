// 著名彗星：真实轨道根数（J2000 黄道），位置随仿真时间解析求解；
// 彗尾指向反日方向，长度/亮度随日距按活动度变化（近日点附近最盛）。

import * as THREE from 'three';
import { solveKepler, KM_PER_AU, DEG } from '../astro/kepler.js';
import { eclToWorld } from '../config.js';

// q:近日距AU e i Ω ω Tp(JD) P(年)
export const COMETS = [
  { id: 'halley', nameZh: '哈雷彗星', nameEn: '1P/Halley',
    q: 0.586, e: 0.967, i: 162.26, node: 58.42, peri: 111.33, tp: 2446470.95, pYears: 75.32,
    desc: '最著名的周期彗星，每 75–76 年回归一次。上次回归 1986 年，下次 2061 年。' },
  { id: 'halebopp', nameZh: '海尔-波普彗星', nameEn: 'C/1995 O1',
    q: 0.914, e: 0.99511, i: 89.43, node: 282.47, peri: 130.59, tp: 2450544.4, pYears: 2533,
    desc: '1997 年大彗星，肉眼可见长达 18 个月，轨道周期约 2500 年。' },
  { id: 'cg67p', nameZh: '丘留莫夫-格拉西缅科彗星', nameEn: '67P/C-G',
    q: 1.243, e: 0.641, i: 7.04, node: 50.14, peri: 12.78, tp: 2459520.5, pYears: 6.44,
    desc: '罗塞塔号探测器 2014–2016 年环绕研究的"橡皮鸭"彗星。' },
  { id: 'encke', nameZh: '恩克彗星', nameEn: '2P/Encke',
    q: 0.336, e: 0.848, i: 11.78, node: 334.57, peri: 186.55, tp: 2460239.5, pYears: 3.30,
    desc: '轨道周期最短的彗星（3.3 年），金牛座流星雨的母体。' },
];

/** 彗星日心位置（km，黄道 J2000） */
export function cometPosition(c, jdTT) {
  const a = c.q / (1 - c.e);
  const n = 360 / (c.pYears * 365.25); // °/天
  const M = n * (jdTT - c.tp);
  const E = solveKepler((M % 360) * DEG, c.e);
  const xp = a * (Math.cos(E) - c.e) * KM_PER_AU;
  const yp = a * Math.sqrt(1 - c.e * c.e) * Math.sin(E) * KM_PER_AU;
  const w = c.peri * DEG, O = c.node * DEG, inc = c.i * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O);
  const ci = Math.cos(inc), si = Math.sin(inc);
  return {
    x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    z: (sw * si) * xp + (cw * si) * yp,
  };
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(220,240,255,1)');
  g.addColorStop(0.3, 'rgba(180,220,255,0.4)');
  g.addColorStop(1, 'rgba(150,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** 创建彗星可视对象集合；返回 { entries: [{c, group, head, tail, posKm}], update(jdTT, sunPosKm) } */
export function createComets(world) {
  const glow = makeGlowTexture();
  const entries = COMETS.map((c) => {
    const group = new THREE.Group();
    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    group.add(head);
    // 彗尾：锥体（沿 +Y），运行时定向到反日方向
    const tailGeo = new THREE.ConeGeometry(1, 1, 12, 1, true);
    tailGeo.translate(0, 0.5, 0);
    const tail = new THREE.Mesh(tailGeo, new THREE.MeshBasicMaterial({
      color: 0x9fc8ff, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    group.add(tail);
    const posKm = new Float64Array(3);
    world.register(posKm, group);
    return { c, group, head, tail, posKm };
  });

  const _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _q = new THREE.Quaternion();

  return {
    entries,
    update(jdTT) {
      for (const e of entries) {
        const p = cometPosition(e.c, jdTT);
        const w = eclToWorld(p);
        e.posKm[0] = w.x; e.posKm[1] = w.y; e.posKm[2] = w.z;
        const rAU = Math.hypot(p.x, p.y, p.z) / KM_PER_AU;
        // 活动度：4 AU 内显著（气体升华）
        const act = Math.max(0, Math.min(1, (4 - rAU) / 3.5));
        const tailLen = act * act * 0.4 * KM_PER_AU;
        e.head.scale.setScalar(3e5 + act * 2.5e6);
        e.tail.visible = act > 0.02;
        if (e.tail.visible) {
          e.tail.scale.set(tailLen * 0.1, tailLen, tailLen * 0.1);
          _dir.set(w.x, w.y, w.z).normalize(); // 反日方向（日心系即位置方向）
          _q.setFromUnitVectors(_up, _dir);
          e.tail.quaternion.copy(_q);
          e.tail.material.opacity = 0.05 + act * 0.2;
        }
      }
    },
  };
}
