// 真实小天体层：JPL SBDB 真实轨道根数（主带/近地/周期彗星），按需后台加载。
// 与 belts.js 的统计点云叠加：统计云提供密度氛围，本层提供"每一颗都是真的"。
//
// 性能设计：
// - 数据 467KB，进入场景后后台 fetch，不阻塞启动；
// - 位置传播（开普勒）按仿真时间节流（Δjd > 0.02 天）且至少间隔 500ms 挂钟；
// - 浮动原点注册：日心结构，与 belts 一致。

import * as THREE from 'three';
import { solveKepler, KM_PER_AU, DEG } from '../astro/kepler.js';
import { asset } from '../config.js';

const GM_SUN = 1.32712440018e11; // km³/s²
const KIND_STYLE = [
  { color: 0xd8c8b0, size: 2.2, opacity: 0.95 }, // 0=主带：亮暖灰（真实亮天体，压过统计云）
  { color: 0xe8d0a8, size: 2.4, opacity: 1.0 },  // 1=近地：更亮
  { color: 0x9fd8d0, size: 1.8, opacity: 0.8 },  // 2=周期彗星：青灰
];

export function createSmallBodies() {
  const group = new THREE.Group();
  group.name = 'smallBodies';

  let bodies = null;      // 解析后的数据行
  let layers = null;      // 三个 Points
  let loading = false;
  let lastJd = null;
  let lastWall = 0;

  async function load() {
    try {
      const resp = await fetch(asset('data/smallbodies.json'));
      if (!resp.ok) return;
      const json = await resp.json();
      bodies = json.bodies;
      buildLayers();
    } catch { /* 离线/缺失 → 本层静默缺省，统计云仍在 */ }
  }

  function buildLayers() {
    const byKind = [[], [], []];
    for (const b of bodies) byKind[b[10]].push(b);
    layers = byKind.map((rows, kind) => {
      if (!rows.length) return null;
      const pos = new Float32Array(rows.length * 3);
      const col = new Float32Array(rows.length * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const st = KIND_STYLE[kind];
      // 颜色改为**逐点**：亮度由真实视星等决定（见 applyMagnitude），不再是一律
      // 2.2px 全亮。真实的小行星带肉眼几乎不可见——谷神星 6.7–9.3 等、灶神星
      // 5.2–8.5 等，其余更暗；一律画成亮点会得到一条"喷带"，与真实相差最远。
      const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: st.size, sizeAttenuation: false,
        vertexColors: true, transparent: true, opacity: st.opacity,
        depthWrite: false, fog: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      group.add(pts);
      return { rows, pos, geo, col, base: new THREE.Color(st.color) };
    });
  }

  /** 传播全部天体到 jdTT（黄道 → three 世界：(x,y,z) → (x,z,−y)） */
  function propagate(jdTT) {
    for (const layer of layers) {
      if (!layer) continue;
      const { rows, pos } = layer;
      for (let i = 0; i < rows.length; i++) {
        const b = rows[i];
        const aKm = b[1] * KM_PER_AU;
        const n = Math.sqrt(GM_SUN / (aKm * aKm * aKm)) * 86400 / DEG; // deg/day
        const M = (b[6] + n * (jdTT - b[7])) * DEG;
        const E = solveKepler(M, b[2]);
        const e = b[2];
        const xp = aKm * (Math.cos(E) - e);
        const yp = aKm * Math.sqrt(1 - e * e) * Math.sin(E);
        const w = b[5] * DEG, O = b[4] * DEG, inc = b[3] * DEG;
        const cw = Math.cos(w), sw = Math.sin(w);
        const cO = Math.cos(O), sO = Math.sin(O);
        const ci = Math.cos(inc), si = Math.sin(inc);
        const x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
        const y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
        const z = (sw * si) * xp + (cw * si) * yp;
        pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y; // ecl→world: (x, z, −y)
      }
      layer.geo.attributes.position.needsUpdate = true;
      layer.geo.attributes.color.needsUpdate = true;
    }
  }

  /** 视星等 → 顶点亮度。
   *  m = H + 5·log10(r·Δ)（忽略相位角；对"看不看得见"这个判断足够）。
   *  以肉眼极限 6.0 等为 1.0，每暗 2.5 等衰减 10 倍。
   *  这样只有谷神星/灶神星/智神星/健神星这类大天体可见，与真实夜空一致。 */
  const NAKED_EYE_M = 6.0;
  function applyMagnitude(camPosKm) {
    const cx = camPosKm[0], cy = camPosKm[1], cz = camPosKm[2];
    for (const layer of layers) {
      if (!layer) continue;
      const { rows, pos, col, base } = layer;
      for (let i = 0; i < rows.length; i++) {
        const b = rows[i];
        const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
        const rAU = Math.max(Math.hypot(px, py, pz) / KM_PER_AU, 1e-3);
        const dAU = Math.max(Math.hypot(px - cx, py - cy, pz - cz) / KM_PER_AU, 1e-3);
        const m = b[8] + 5 * Math.log10(rAU * dAU);
        const L = Math.min(1, Math.pow(10, -0.4 * (m - NAKED_EYE_M)));
        col[i * 3] = base.r * L; col[i * 3 + 1] = base.g * L; col[i * 3 + 2] = base.b * L;
      }
    }
  }

  return {
    group,
    /** 每帧调用；内部按需加载与节流 */
    update(jdTT, camPosKm) {
      if (!bodies) {
        if (!loading) { loading = true; load(); }
        return;
      }
      const now = performance.now();
      if (lastJd != null && (Math.abs(jdTT - lastJd) < 0.02 || now - lastWall < 500)) return;
      lastJd = jdTT;
      lastWall = now;
      propagate(jdTT);
      if (camPosKm) applyMagnitude(camPosKm);
    },
    /** 已加载天体数（测试/诊断用） */
    get count() { return bodies?.length ?? 0; },
  };
}
