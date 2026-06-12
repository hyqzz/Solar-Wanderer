// 登陆地表系统（无人深空级）：相机接近固体天体时在脚下生成同心环形 LOD 地形。
// - 高度场：大尺度构造 + 山地掩码 + 双尺度撞击坑 + 三层细节频率（米级起伏）
// - 颜色：真实全球贴图反照率 × 坡度岩壁化 × 高度调制
// - 片元级三尺度细节噪声（近看不糊，NMS 质感）
// - 世界锚定确定性岩石散布（InstancedMesh，重建不漂移）
// heightFn 同时供行走碰撞使用（几何与碰撞同源，无穿模）。

import * as THREE from 'three';
import { makeNoise, hashSeed } from '../util/noise.js';
import { QUALITY } from '../engine/quality.js';

const PALETTES = {
  gray:     [[0.32, 0.32, 0.33], [0.55, 0.55, 0.56]],
  dark:     [[0.18, 0.17, 0.17], [0.34, 0.33, 0.32]],
  ice:      [[0.72, 0.78, 0.84], [0.95, 0.97, 1.0]],
  earth:    [[0.35, 0.4, 0.28], [0.65, 0.62, 0.55]],
  mars:     [[0.45, 0.24, 0.13], [0.75, 0.46, 0.28]],
  venus:    [[0.45, 0.36, 0.22], [0.72, 0.6, 0.4]],
  io:       [[0.75, 0.65, 0.25], [0.95, 0.85, 0.5]],
  titan:    [[0.5, 0.36, 0.18], [0.72, 0.55, 0.3]],
  triton:   [[0.7, 0.68, 0.66], [0.88, 0.84, 0.8]],
  pluto:    [[0.55, 0.45, 0.35], [0.85, 0.8, 0.72]],
  callisto: [[0.3, 0.28, 0.25], [0.55, 0.5, 0.45]],
  iapetus:  [[0.15, 0.12, 0.1], [0.85, 0.85, 0.82]],
};

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 高度/颜色场：每个可登陆天体一个，懒创建 */
export class HeightField {
  constructor(bodyId, phys, mapImageData = null) {
    this.bodyId = bodyId;
    this.phys = phys;
    this.sp = phys.surface ?? { ampKm: 2, roughness: 0.5, craters: 0.5, palette: 'gray' };
    this.noise = makeNoise(hashSeed(bodyId));
    this.map = mapImageData; // {data,width,height} 用于颜色与海洋掩码
  }

  /** 撞击坑形态：噪声等值带 → 环形坑缘 + 坑底 */
  crater(dir, f) {
    const c = this.noise.fbm(dir.x * f, dir.y * f, dir.z * f, 3);
    const rim = Math.max(0, 1 - Math.abs(c - 0.18) * 14);
    const pit = Math.max(0, 1 - Math.abs(c - 0.3) * 9);
    return rim * rim * 0.25 - pit * pit * 0.35;
  }

  /** 基准半径：默认正球；shape.dims=[X,Y,Z]（km 全径）时为三轴椭球
   * （火卫一等土豆状不规则体，+X 指向母星 / +Y 北极，R9-2c）。 */
  baseRadius(dir) {
    const s = this.phys.shape?.dims;
    if (!s) return this.phys.radiusKm;
    const a = s[0] / 2, b = s[1] / 2, c = s[2] / 2;
    const q = (dir.x * dir.x) / (a * a) + (dir.y * dir.y) / (b * b) + (dir.z * dir.z) / (c * c);
    return 1 / Math.sqrt(Math.max(q, 1e-12));
  }

  /** 海床半径（海面之下 0.7–4 km 起伏的大陆架/深海盆，R9-2b 水下地形） */
  oceanFloor(dir) {
    const n = this.noise;
    const d = 1.0 + 2.4 * (0.5 + 0.5 * n.fbm(dir.x * 22 + 11.1, dir.y * 22, dir.z * 22, 3))
      + 0.5 * n.fbm(dir.x * 240, dir.y * 240, dir.z * 240, 2);
    return this.phys.radiusKm + 0.001 - Math.max(d, 0.3);
  }

  /** 固体表面半径：海洋处返回海床（行走碰撞/相机下限用——水不是固体，可潜入） */
  heightSolid(dir) {
    if (this.sp.ocean && this.isOcean(dir)) return this.oceanFloor(dir);
    return this.height(dir);
  }

  /** dir: 网格本地系单位向量（+Y=北极, +X=本初子午线）。返回该方向的表面半径 km */
  height(dir) {
    const R = this.baseRadius(dir);
    const sp = this.sp;
    if (sp.ocean && this.isOcean(dir)) return this.phys.radiusKm + 0.001;
    const n = this.noise;
    // 大尺度构造（高原/盆地）
    let h = 0.42 * n.fbm(dir.x * 1.6, dir.y * 1.6, dir.z * 1.6, 4);
    // 山地掩码：山脉成链而非满地皆山（NMS 式地貌分区）
    const mMask = sstep(-0.05, 0.5, n.fbm(dir.x * 2.7 + 31.7, dir.y * 2.7, dir.z * 2.7, 3));
    h += mMask * 0.6 * sp.roughness * (n.ridged(dir.x * 7, dir.y * 7, dir.z * 7, 5) * 2 - 1);
    h += 0.16 * n.fbm(dir.x * 30, dir.y * 30, dir.z * 30, 4);
    // 双尺度撞击坑
    if (sp.craters > 0) {
      h += sp.craters * (this.crater(dir, 22) * 0.9 + this.crater(dir, 85) * 0.45);
    }
    // 细节频率（行走尺度起伏：~2km / ~200m / ~40m 波长）
    h += 0.05 * n.fbm(dir.x * 900, dir.y * 900, dir.z * 900, 3);
    h += 0.022 * n.fbm(dir.x * 8000, dir.y * 8000, dir.z * 8000, 2);
    h += 0.009 * n.fbm(dir.x * 42000, dir.y * 42000, dir.z * 42000, 2);
    // 抬升保证地形在全球光滑球面之上
    return R + sp.ampKm * (h * 0.5 + 0.62);
  }

  isOcean(dir) {
    const c = this.sampleMap(dir);
    if (!c) return false;
    return c[2] > c[0] * 1.15 && c[2] > 60; // 偏蓝像素
  }

  /** 真实贴图采样（经纬→像素），返回 [r,g,b] 0-255 或 null */
  sampleMap(dir) {
    if (!this.map) return null;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(-dir.z, dir.x); // 东经为正（网格本地约定）
    const u = (lon / Math.PI + 1) * 0.5;
    const v = 0.5 - lat / Math.PI;
    const x = Math.min(this.map.width - 1, Math.max(0, (u * this.map.width) | 0));
    const y = Math.min(this.map.height - 1, Math.max(0, (v * this.map.height) | 0));
    const i = (y * this.map.width + x) * 4;
    return [this.map.data[i], this.map.data[i + 1], this.map.data[i + 2]];
  }

  /** 顶点颜色：真实贴图反照率 × 坡度岩壁 × 高度调制 */
  color(dir, hKm, slope, out) {
    // 海面：深海蓝（避免贴图浅蓝 × 细节噪声产生大理石纹）
    if (this.sp.ocean && this.isOcean(dir)) {
      const w = 0.5 + 0.5 * this.noise.fbm(dir.x * 300, dir.y * 300, dir.z * 300, 2);
      out.setRGB(0.03 + w * 0.02, 0.1 + w * 0.04, 0.22 + w * 0.06);
      return out;
    }
    const m = this.sampleMap(dir);
    const pal = PALETTES[this.sp.palette] ?? PALETTES.gray;
    const n = this.noise;
    const t = 0.5 + 0.5 * n.fbm(dir.x * 60, dir.y * 60, dir.z * 60, 3);
    let r, g, b;
    if (m) {
      r = m[0] / 255; g = m[1] / 255; b = m[2] / 255;
      r = r * 0.82 + (pal[0][0] + (pal[1][0] - pal[0][0]) * t) * 0.18;
      g = g * 0.82 + (pal[0][1] + (pal[1][1] - pal[0][1]) * t) * 0.18;
      b = b * 0.82 + (pal[0][2] + (pal[1][2] - pal[0][2]) * t) * 0.18;
    } else {
      r = pal[0][0] + (pal[1][0] - pal[0][0]) * t;
      g = pal[0][1] + (pal[1][1] - pal[0][1]) * t;
      b = pal[0][2] + (pal[1][2] - pal[0][2]) * t;
    }
    // 大尺度地块色调变化（地质单元差异，SpaceEngine 式地貌分区观感）
    const hue = n.fbm(dir.x * 12 + 7.3, dir.y * 12, dir.z * 12, 3);
    r *= 1 + hue * 0.07;
    b *= 1 - hue * 0.06;
    g *= 1 + hue * 0.02;
    // 陡坡 → 裸岩（更暗、去饱和）
    const rock = sstep(0.3, 0.62, slope);
    const lum = (r + g + b) / 3;
    r = r * (1 - rock) + (lum * 0.5 + r * 0.12) * rock;
    g = g * (1 - rock) + (lum * 0.5 + g * 0.12) * rock;
    b = b * (1 - rock) + (lum * 0.52 + b * 0.12) * rock;
    // 高度调制
    const shade = 0.85 + 0.3 * ((hKm - this.phys.radiusKm) / Math.max(this.sp.ampKm, 0.01) - 0.5);
    out.setRGB(
      Math.min(1, Math.max(0, r * shade)),
      Math.min(1, Math.max(0, g * shade)),
      Math.min(1, Math.max(0, b * shade))
    );
    return out;
  }
}


/** 地形材质（每 LOD 级一份）：StandardMaterial + 片元级三尺度细节噪声注入（近看不糊）。
 * 顶点坐标为"级原点相对"（R9-2a：绝对体本地坐标模 ≈ R，fp32 在 6400 km 模长下
 * 量化 0.5 m，与 1.7 m 眼高同量级 → 登陆闪烁；改存小坐标后亚毫米精确）。
 * 噪声坐标 = 级原点相对坐标 + uPatchRel（级原点 − 噪声原点，CPU 双精度算好），
 * 全程小数值，跨级噪声严格连续。水面顶点（attribute water=1）低粗糙度 + 时变波纹法线。 */
function makeTerrainMaterial(uPatchRel, uTime, polyUnits) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, fog: true,
    side: THREE.DoubleSide, // 水下仰望可见海面（R9-2b）
    polygonOffset: polyUnits > 0, polygonOffsetFactor: polyUnits > 0 ? 1 : 0,
    polygonOffsetUnits: polyUnits, // 粗级后推，消除 LOD 环带重叠区 z-fight（R9-2a）
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPatchRel = uPatchRel;
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uPatchRel;
        attribute float water;
        varying float vWater;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = position + uPatchRel;
        vWater = water;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vObjPos;
        varying float vWater;
        uniform float uTime;
        float thash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float tnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(thash(i), thash(i + vec3(1,0,0)), f.x), mix(thash(i + vec3(0,1,0)), thash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(thash(i + vec3(0,0,1)), thash(i + vec3(1,0,1)), f.x), mix(thash(i + vec3(0,1,1)), thash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          // 三尺度细节：~28m / ~2.4m / ~20cm（对象空间稳定）；高频项随距离淡出防远处沙噪
          float vd = length(vViewPosition);
          float f2 = 1.0 - smoothstep(0.15, 0.9, vd);   // 2.4m 细节 900m 外淡出
          float f3 = 1.0 - smoothstep(0.015, 0.09, vd); // 20cm 细节 90m 外淡出
          float d1 = tnoise(vObjPos * 35.0);
          float d2 = tnoise(vObjPos * 420.0) * f2;
          float d3 = tnoise(vObjPos * 5200.0) * f3;
          float dm = 0.78 + 0.46 * (d1 * 0.45 + d2 * 0.33 + d3 * 0.22)
                   + (1.0 - f2) * 0.075 + (1.0 - f3) * 0.05; // 均值补偿，避免远处变暗
          diffuseColor.rgb *= mix(dm, 1.0, vWater); // 水面无岩屑细节
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, vWater); // 水面镜面反射（太阳波光）`)
      .replace('#include <normal_fragment_begin>', /* glsl */ `#include <normal_fragment_begin>
        {
          // 程序化凹凸（屏幕导数法）：岩面粗糙起伏；水面 = 双向行进波叠加（时变波纹）
          float vdb = length(vViewPosition);
          float bf = 1.0 - smoothstep(0.1, 1.2, vdb);
          float hRock = (tnoise(vObjPos * 420.0) * 0.68 + tnoise(vObjPos * 5200.0) * 0.32) * 0.0016 * bf;
          float wf = 1.0 - smoothstep(0.05, 14.0, vdb);
          float hWave = (tnoise(vObjPos * 900.0 + vec3(uTime * 0.06, 0.0, uTime * 0.043)) * 0.6
                       + tnoise(vObjPos * 3200.0 - vec3(uTime * 0.11, uTime * 0.05, 0.0)) * 0.4) * 0.0009 * wf;
          float hb = mix(hRock, hWave, vWater);
          vec3 sX = dFdx(-vViewPosition);
          vec3 sY = dFdy(-vViewPosition);
          vec3 r1 = cross(sY, normal);
          vec3 r2 = cross(normal, sX);
          float det = dot(sX, r1);
          det *= (float(gl_FrontFacing) * 2.0 - 1.0);
          vec3 grad = sign(det) * (dFdx(hb) * r1 + dFdy(hb) * r2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  return mat;
}

/** 世界锚定确定性岩石散布：以体固系空间网格哈希决定每块岩石，重建不漂移 */
class RockField {
  constructor(field) {
    this.field = field;
    const sp = field.sp;
    this.density = sp.craters > 0.8 ? 0.4 : sp.palette === 'ice' ? 0.16 : 0.3;
    if (sp.ocean) this.density = 0.12;
    this.MAX = 320;
    // 低多边形岩石：二十面体确定性变形
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const n = makeNoise(hashSeed(field.bodyId + ':rock'));
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = 1 + 0.42 * n.fbm(v.x * 1.7, v.y * 1.7, v.z * 1.7, 3);
      pos.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
    }
    geo.computeVertexNormals();
    const pal = PALETTES[sp.palette] ?? PALETTES.gray;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal[0][0] * 0.8, pal[0][1] * 0.8, pal[0][2] * 0.8),
      roughness: 0.92, metalness: 0, fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  /** 简易确定性哈希（整数格 → [0,1)） */
  static hash(ix, iy, iz, salt) {
    let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + salt * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** origin: 最细级地形原点（实例坐标存原点相对值，与地形同源消 fp32 量化闪烁，R9-2a） */
  rebuild(anchorDir, origin) {
    const R = this.field.phys.radiusKm;
    const CELL = 0.022; // 22 m 格
    const RANGE = 0.33; // 330 m 半径内散布
    this.mesh.position.copy(origin);
    const u = anchorDir.clone().normalize();
    const east = Math.abs(u.y) > 0.999
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0).cross(u).normalize();
    const north = new THREE.Vector3().crossVectors(u, east);
    const N = Math.floor(RANGE / CELL);
    let count = 0;
    const dir = new THREE.Vector3();
    for (let ix = -N; ix <= N && count < this.MAX; ix++) {
      for (let iy = -N; iy <= N && count < this.MAX; iy++) {
        // 世界锚定：以体固系绝对坐标的整数格为键（与 anchor 无关 → 重建稳定）
        this._p.copy(u).multiplyScalar(R)
          .addScaledVector(east, ix * CELL).addScaledVector(north, iy * CELL);
        const kx = Math.floor(this._p.x / CELL), ky = Math.floor(this._p.y / CELL), kz = Math.floor(this._p.z / CELL);
        const r0 = RockField.hash(kx, ky, kz, 1);
        if (r0 > this.density) continue;
        const r1 = RockField.hash(kx, ky, kz, 2);
        const r2 = RockField.hash(kx, ky, kz, 3);
        const r3 = RockField.hash(kx, ky, kz, 4);
        dir.set(
          this._p.x + (r1 - 0.5) * CELL, this._p.y + (r2 - 0.5) * CELL, this._p.z + (r3 - 0.5) * CELL
        ).normalize();
        if (this.field.sp.ocean && this.field.isOcean(dir)) continue; // 海面无岩石
        const h = this.field.height(dir);
        const scale = 0.0004 + r1 * r1 * 0.002; // 0.4 m – 2.4 m
        this._p.copy(dir).multiplyScalar(h + scale * 0.3).sub(origin);
        this._q.setFromAxisAngle(dir, r2 * Math.PI * 2);
        this._s.set(scale * (0.7 + r3 * 0.7), scale, scale * (0.7 + r2 * 0.7));
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(count, this._m);
        count++;
      }
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}

/** 环形 LOD 地形（挂在天体网格之下，本地坐标系） */
export class TerrainPatchSet {
  constructor(field) {
    this.field = field;
    this.grid = QUALITY.terrainGrid; // 画质分档（R7 #8）
    const GRID = this.grid;
    const R = field.phys.radiusKm;
    // 各级半边长（km）：最内 0.03km → 格距 ~1m（R9-2a 行走尺度再加密一级）
    this.extents = [0.03, 0.12, 0.5, 2.5, 12, 60, 280].filter((e) => e < R * 0.7);
    if (this.extents.length === 0) this.extents = [R * 0.3];
    this.group = new THREE.Group();
    this.levels = [];
    this.anchorDir = new THREE.Vector3(0, 1, 0);
    this.uTime = { value: 0 };
    // 噪声原点：跟随玩家、每 2km 重新吸附（保证片元噪声参数始终小数精度充足）
    this.noiseOriginU = { value: new THREE.Vector3(1e9, 0, 0) };
    for (let li = 0; li < this.extents.length; li++) {
      const geo = new THREE.BufferGeometry();
      const verts = (GRID + 1) * (GRID + 1);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('water', new THREE.BufferAttribute(new Float32Array(verts), 1));
      const idx = [];
      const hole = li === 0 ? 0 : (this.extents[li - 1] / this.extents[li]) * GRID * 0.5 * 0.92;
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const cx = Math.abs(x + 0.5 - GRID / 2), cy = Math.abs(y + 0.5 - GRID / 2);
          if (li > 0 && cx < hole && cy < hole) continue;
          const a = y * (GRID + 1) + x;
          idx.push(a, a + 1, a + GRID + 1, a + 1, a + GRID + 2, a + GRID + 1);
        }
      }
      geo.setIndex(idx);
      // 级原点相对几何（R9-2a 修闪烁）：每级独立原点 + 独立材质（粗级 polygonOffset 后推）
      const uPatchRel = { value: new THREE.Vector3() };
      const mat = makeTerrainMaterial(uPatchRel, this.uTime, li * 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.levels.push({
        mesh, geo, mat, uPatchRel, extent: this.extents[li],
        origin: new THREE.Vector3(), builtAnchor: new THREE.Vector3(1e9, 0, 0),
      });
    }
    // 岩石散布层
    this.rocks = new RockField(field);
    this.group.add(this.rocks.mesh);
  }

  /** dirLocal: 相机在天体本地系中的方向（单位）。timeSec: 水面波纹时基。
   * 每帧最多重建 1 级（细级优先）——旧实现一帧全量重建会卡顿跳帧，
   * 破坏滚轮降落的连续感（R7 #1）。 */
  update(dirLocal, timeSec = 0) {
    const R = this.field.phys.radiusKm;
    this.uTime.value = timeSec;
    // 噪声原点吸附（>2km 偏移时跟随，细节噪声仅 90m 内可见，重排不可察觉）
    const px = dirLocal.x * R, py = dirLocal.y * R, pz = dirLocal.z * R;
    const o = this.noiseOriginU.value;
    if (Math.hypot(px - o.x, py - o.y, pz - o.z) > 2) {
      o.set(Math.round(px), Math.round(py), Math.round(pz));
      for (const lv of this.levels) lv.uPatchRel.value.copy(lv.origin).sub(o);
    }
    for (let li = 0; li < this.levels.length; li++) {
      const lv = this.levels[li];
      const moveKm = lv.builtAnchor.distanceTo(dirLocal) * R;
      if (moveKm > lv.extent * 0.25) {
        this.build(lv, dirLocal);
        lv.builtAnchor.copy(dirLocal);
        if (li === 0) this.rocks.rebuild(dirLocal, lv.origin);
        break; // 分帧：其余级下一帧再建
      }
    }
  }

  build(lv, anchor) {
    const GRID = this.grid;
    const R = this.field.phys.radiusKm;
    const u = anchor.clone().normalize();
    const east = Math.abs(u.y) > 0.999
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0).cross(u).normalize();
    const north = new THREE.Vector3().crossVectors(u, east);
    // 级原点：锚点地表（fround 取 fp32 精确可表示值 → mesh.position 无量化误差），
    // 顶点存原点相对坐标（模 ≤ 2×extent，亚毫米精度，R9-2a 修闪烁根因）
    lv.origin.set(
      Math.fround(u.x * R), Math.fround(u.y * R), Math.fround(u.z * R)
    );
    lv.mesh.position.copy(lv.origin);
    lv.uPatchRel.value.copy(lv.origin).sub(this.noiseOriginU.value);
    const pos = lv.geo.attributes.position.array;
    const col = lv.geo.attributes.color.array;
    const wat = lv.geo.attributes.water.array;
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    const dirs = new Float32Array((GRID + 1) * (GRID + 1) * 3);
    const hs = new Float64Array((GRID + 1) * (GRID + 1));
    const isO = this.field.sp.ocean;
    let k = 0;
    for (let y = 0; y <= GRID; y++) {
      for (let x = 0; x <= GRID; x++, k++) {
        const fx = ((x / GRID) * 2 - 1) * lv.extent;
        const fy = ((y / GRID) * 2 - 1) * lv.extent;
        dir.copy(u).addScaledVector(east, fx / R).addScaledVector(north, fy / R).normalize();
        const h = this.field.height(dir);
        hs[k] = h;
        dirs[k * 3] = dir.x; dirs[k * 3 + 1] = dir.y; dirs[k * 3 + 2] = dir.z;
        pos[k * 3] = dir.x * h - lv.origin.x;
        pos[k * 3 + 1] = dir.y * h - lv.origin.y;
        pos[k * 3 + 2] = dir.z * h - lv.origin.z;
        wat[k] = isO && this.field.isOcean(dir) ? 1 : 0;
      }
    }
    lv.geo.attributes.position.needsUpdate = true;
    lv.geo.attributes.water.needsUpdate = true;
    lv.geo.computeVertexNormals();
    lv.geo.attributes.normal.needsUpdate = true;
    // 第二遍：用法线坡度上色（陡坡岩壁化）
    const nrm = lv.geo.attributes.normal.array;
    k = 0;
    for (let y = 0; y <= GRID; y++) {
      for (let x = 0; x <= GRID; x++, k++) {
        dir.set(dirs[k * 3], dirs[k * 3 + 1], dirs[k * 3 + 2]);
        const ndotu = nrm[k * 3] * dir.x + nrm[k * 3 + 1] * dir.y + nrm[k * 3 + 2] * dir.z;
        const slope = 1 - Math.min(1, Math.max(0, ndotu));
        this.field.color(dir, hs[k], slope, c);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
    }
    lv.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    for (const lv of this.levels) lv.geo.dispose();
    this.rocks.dispose();
  }
}

/** 地形管理器：跟踪最近可登陆天体，激活/释放 TerrainPatchSet */
export class TerrainManager {
  constructor() {
    this.fields = new Map();   // bodyId -> HeightField
    this.active = null;        // { bodyId, patches }
    this.getMapData = null;    // 由 builder 注入：bodyId -> ImageData|null
    this.physOf = null;        // bodyId -> phys
    this.meshOf = null;        // bodyId -> 天体网格（地形作为其子节点）
  }

  field(bodyId) {
    let f = this.fields.get(bodyId);
    if (!f) {
      f = new HeightField(bodyId, this.physOf(bodyId), this.getMapData?.(bodyId) ?? null);
      this.fields.set(bodyId, f);
    }
    return f;
  }

  /** 行走碰撞/相机下限用：固体表面（海洋处为海床——水可潜入，R9-2b） */
  heightAt(bodyId, dirLocal) {
    return this.field(bodyId).heightSolid(dirLocal);
  }

  /** 水面判定（行走浮力/水下环境用） */
  isWater(bodyId, dirLocal) {
    const f = this.field(bodyId);
    return !!(f.sp.ocean && f.isOcean(dirLocal));
  }

  update(nearest, camLocalDir, timeSec = 0) {
    // 激活半径：小天体按半径比例（火卫一在数十 km 外不该看到地形补丁色块，R9-2c）
    let wantId = null;
    if (nearest && nearest.landable) {
      const R = this.physOf(nearest.id).radiusKm;
      const actDist = R < 100 ? Math.max(8, R * 0.6) : Math.max(60, R * 0.06);
      if (nearest.distSurface < actDist) wantId = nearest.id;
    }

    if (this.active && this.active.bodyId !== wantId) {
      this.active.patches.group.removeFromParent();
      this.active.patches.dispose();
      this.active = null;
    }
    if (wantId && !this.active) {
      const patches = new TerrainPatchSet(this.field(wantId));
      this.meshOf(wantId).add(patches.group);
      this.active = { bodyId: wantId, patches };
    }
    if (this.active && camLocalDir) this.active.patches.update(camLocalDir, timeSec);
  }
}
