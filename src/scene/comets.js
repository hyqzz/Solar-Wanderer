// 著名彗星：SBDB 当前历元真实根数（cometOrbits.generated.js，由 tools/fetch-small-bodies.mjs
// 从 JPL SBDB 拉取）优先；内置表作为离线兜底。彗尾指向反日方向，长度/亮度随日距变化。

import * as THREE from 'three';
import { solveKepler, KM_PER_AU, DEG } from '../astro/kepler.js';
import { eclToWorld } from '../config.js';
import { COMET_ORBITS } from '../astro/cometOrbits.generated.js';

const GM_SUN = 1.32712440018e11; // km³/s²

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

/** 彗星日心位置（km，黄道 J2000）：优先 SBDB 当前历元根数，缺失回退内置表 */
export function cometPosition(c, jdTT) {
  const o = COMET_ORBITS[c.id];
  if (o) {
    const aKm = o.aAU * KM_PER_AU;
    const n = Math.sqrt(GM_SUN / (aKm * aKm * aKm)) * 86400 / DEG; // °/天
    const M = o.M0Deg + n * (jdTT - o.epochJd);
    const E = solveKepler(M * DEG, o.e);
    const xp = aKm * (Math.cos(E) - o.e);
    const yp = aKm * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
    const w = o.periArgDeg * DEG, O = o.nodeDeg * DEG, inc = o.iDeg * DEG;
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O);
    const ci = Math.cos(inc), si = Math.sin(inc);
    return {
      x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
      y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
    };
  }
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

/** 尘埃尾粒子数（syndyne 弧线采样） */
const DUST_N = 220;

/** 创建彗星可视对象集合；返回 { entries: [{c, group, head, ionTail, dustTail, posKm}], update(jdTT) } */
export function createComets(world) {
  const glow = makeGlowTexture();
  const entries = COMETS.map((c) => {
    const group = new THREE.Group();
    // 彗发：蓝绿色（CN/C₂ 388nm 发射）球状辉光
    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xcfe8d8, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    group.add(head);

    // I 型离子尾：窄、直、蓝（CO⁺ ~420nm），严格沿太阳风（反日）方向
    const ionGeo = new THREE.ConeGeometry(1, 1, 12, 1, true);
    ionGeo.translate(0, 0.5, 0);
    const ionTail = new THREE.Mesh(ionGeo, new THREE.MeshBasicMaterial({
      color: 0x7fb4ff, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    group.add(ionTail);

    // II 型尘埃尾：宽、黄白、沿 syndyne 弧线向轨道后方弯曲
    // （辐射压把尘埃推离太阳，同时尘埃因轨道速度略低而滞后于彗星）
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(DUST_N * 3);
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustTail = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xf0e6c8, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    dustTail.frustumCulled = false;
    group.add(dustTail);

    const posKm = new Float64Array(3);
    world.register(posKm, group);
    return { c, group, head, ionTail, dustTail, dustPos, dustGeo, posKm };
  });

  const _dir = new THREE.Vector3();
  const _lag = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _q = new THREE.Quaternion();
  const C_KM_PER_DAY = 299792.458 * 86400;

  return {
    entries,
    update(jdTT, shipPosKm) {
      for (const e of entries) {
        // 光行时视位置（与行星一致：相机看到 t − d/c 时刻）
        let jdUse = jdTT;
        if (shipPosKm) {
          let p0 = cometPosition(e.c, jdTT);
          for (let k = 0; k < 2; k++) {
            const w0 = eclToWorld(p0);
            const d = Math.hypot(w0.x - shipPosKm[0], w0.y - shipPosKm[1], w0.z - shipPosKm[2]);
            jdUse = jdTT - d / C_KM_PER_DAY;
            p0 = cometPosition(e.c, jdUse);
          }
        }
        const p = cometPosition(e.c, jdUse);
        const w = eclToWorld(p);
        e.posKm[0] = w.x; e.posKm[1] = w.y; e.posKm[2] = w.z;
        const rAU = Math.hypot(p.x, p.y, p.z) / KM_PER_AU;
        // 活动度：4 AU 内显著（气体升华），亮度 ∝ 1/r²（反照）× 活动度
        const act = Math.max(0, Math.min(1, (4 - rAU) / 3.5));
        e.head.scale.setScalar(3e5 + act * 2.5e6);
        e.head.material.opacity = Math.min(1, 0.35 + act * 0.65);

        // ── 离子尾：反日直尾 ──
        const ionLen = act * act * 0.5 * KM_PER_AU;
        e.ionTail.visible = act > 0.02;
        if (e.ionTail.visible) {
          e.ionTail.scale.set(ionLen * 0.04, ionLen, ionLen * 0.04); // 比旧版更窄更直
          _dir.set(w.x, w.y, w.z).normalize();
          _q.setFromUnitVectors(_up, _dir);
          e.ionTail.quaternion.copy(_q);
          e.ionTail.material.opacity = (0.06 + act * 0.22) / (1 + rAU * 0.5);
        }

        // ── 尘埃尾：syndyne 弧线（反日 + 轨道滞后弯曲）──
        e.dustTail.visible = act > 0.03;
        if (e.dustTail.visible) {
          // 彗星轨道速度方向（数值微分，世界系）——尘埃沿轨道后方滞后
          const pAhead = eclToWorld(cometPosition(e.c, jdTT + 0.5));
          _lag.set(pAhead.x - w.x, pAhead.y - w.y, pAhead.z - w.z).normalize().negate();
          _dir.set(w.x, w.y, w.z).normalize(); // 反日
          const dustLen = act * 0.28 * KM_PER_AU;
          const curveK = 0.9; // 弯曲强度（辐射压比值β的经验上限）
          for (let i = 0; i < DUST_N; i++) {
            const s = i / (DUST_N - 1);
            // syndyne：位置 = 头 + s·L·(反日 + s·curveK·滞后方向)，二次弯曲
            const px = _dir.x + s * curveK * _lag.x;
            const py = _dir.y + s * curveK * _lag.y;
            const pz = _dir.z + s * curveK * _lag.z;
            e.dustPos[i * 3] = px * dustLen * s;
            e.dustPos[i * 3 + 1] = py * dustLen * s;
            e.dustPos[i * 3 + 2] = pz * dustLen * s;
          }
          e.dustGeo.attributes.position.needsUpdate = true;
          e.dustTail.material.opacity = (0.10 + act * 0.30) / (1 + rAU * 0.6);
        }
      }
    },
  };
}
