// 星空背景：真实银河全景贴图（按银道坐标系正确定向）+ 真实星表恒星（BSC5，9096 颗）。
// 恒星以真实 3D 位置注册浮动原点——有三角视差的近星会产生可辨视差（R11）。

import * as THREE from 'three';
import { raDecToWorld, LY_KM } from '../config.js';
import { bvToRgb, magToDisplayIntensity } from '../astro/starCatalog.js';

const DEG = Math.PI / 180;
// km，背景程序化星空球半径（固定相机，零视差）。
// 直接铺到相机远平面边界内侧：天球以相机为心，半径只需落在 [近平面, 远平面] 内即可全程可见。
// 取 9e14 km（远平面 camera.far=1e15 的 90%）——即"扩展到相机最远边界外缘"，使得无论相机
// 飞到太阳系任何位置（出柯伊伯带、日球层、乃至奥尔特云），自适应近平面（最大 1e10 km）都远
// 在其内侧、绝不把整个背景天球裁掉 → 满天繁星与银河始终存在（物理正确：真实星空在数光年外，
// 太阳系内任何位置观感一致）。9e14 同时略大于最远亮星(94ly≈8.89e14 km)，使银河层始终居于最外。
// 因 sizeAttenuation:false + 相机居中，放大半径在视觉上完全不变（仅消除远距裁剪）。
const SKY_R = 9e14;
export { SKY_R };

export function createStarfield(milkywayTex) {
  const group = new THREE.Group();
  const fadeMats = []; // 白昼大气内星空淡出（真实：日光散射淹没星光）
  let milkyMat = null;

  // 银河球：银道坐标定向（NGP: RA 192.8595°, Dec 27.1284°；银心: RA 266.405°, Dec −28.936°）
  if (milkywayTex) {
    milkywayTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: milkywayTex, side: THREE.BackSide, depthWrite: false, fog: false,
      transparent: true,
      color: new THREE.Color(0.5, 0.5, 0.55), // 压暗，避免压过前景
    });
    milkyMat = mat;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 64, 32), mat);
    const xg = raDecToWorld(266.405 * DEG, -28.936 * DEG, new THREE.Vector3()); // 银心 → 本地+X
    const zg = raDecToWorld(192.8595 * DEG, 27.1284 * DEG, new THREE.Vector3()); // NGP → 本地+Y
    // 正交化；银经向东增加映射到本地 −Z（球面UV约定），故 Z 列 = −(xg×y)
    const y = zg.clone().sub(xg.clone().multiplyScalar(zg.dot(xg))).normalize();
    const zCol = new THREE.Vector3().crossVectors(xg, y).negate();
    const m = new THREE.Matrix4().makeBasis(xg, y, zCol);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.renderOrder = -10;
    group.add(mesh);
  }

  const pointCanvas = document.createElement('canvas');
  pointCanvas.width = pointCanvas.height = 32;
  const pointCtx = pointCanvas.getContext('2d');
  const pointGlow = pointCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  pointGlow.addColorStop(0, 'rgba(255,255,255,1)');
  pointGlow.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  pointGlow.addColorStop(1, 'rgba(255,255,255,0)');
  pointCtx.fillStyle = pointGlow; pointCtx.fillRect(0, 0, 32, 32);
  const pointMap = new THREE.CanvasTexture(pointCanvas);

  // ── 真实星表（BSC5，9096 颗 V ≤ 6.5）────────────────────────────────────
  // 这里是**全部**恒星，不再叠程序化假星。
  // 此前是"132 颗手写亮星 + 11900 颗虚构背景星"：手写表后半段把前面的星按坐标
  // 回收复制、只改星等（天狼星出现两次、星等 −1.46 与 2.95 并存），专名也大量错位。
  // 结果是星座形状似是而非——恰恰是"看着像真的、一对照就露"的典型。
  // 真实星表自带正确的星座形状、亮度层次与颜色，不需要再编。
  //
  // 分两层绘制，因为点尺寸在屏幕空间是常数（sizeAttenuation:false）：
  // 亮星给大一点的尺寸才像"亮星"，暗星用小尺寸避免糊成一片。
  const brightGroup = new THREE.Group(); // 注册浮动原点（posKm=[0,0,0]=日心）
  // 用命名区间而不是位置元组：写成 [size, maxMag, minMag] 这种三元组时，
  // 第二层的 min/max 极易写反，而写反的后果是条件永假——那 92 颗亮星会**静默消失**，
  // 画面照出、只是天上少了一批最该有的星（实测就栽在这里：只剩 9004 颗暗星）。
  const LAYERS = [
    // 三档而不是两档：只有两档时天狼星（−1.46 等）与一颗 2.4 等星圆面一样大，
    // 只差强度——"亮星"的层次感全压在最亮那一档里。多一档几乎零成本。
    { size: 5.0, lo: -Infinity, hi: 0.5 },   // 一等星及以上（天狼、老人、南门二…）
    { size: 3.2, lo: 0.5, hi: 2.0 },         // 二等
    { size: 1.7, lo: 2.0, hi: Infinity },    // 三等及以下
  ];
  const layers = [];
  for (const spec of LAYERS) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const mat = new THREE.PointsMaterial({
      size: spec.size, map: pointMap, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = spec.size > 2 ? -8 : -9;
    brightGroup.add(pts);
    layers.push({ mat, geo, lo: spec.lo, hi: spec.hi });
  }
  brightGroup.frustumCulled = false;

  const _dir = new THREE.Vector3();
  const _rgb = [1, 1, 1];
  // 视差：距离超过 camera.far/LY_KM 的星截断到 94 ly（方向不变，视差小到不影响体验）
  const PARALLAX_LY_LIMIT = 94;

  /** 用真实星表填充各层。cat 为 null（加载失败）时星空只剩银河贴图，不报错。 */
  function setCatalog(cat) {
    if (!cat) return 0;
    const buckets = layers.map(() => ({ pos: [], col: [] }));
    for (let i = 0; i < cat.count; i++) {
      const mag = cat.mag[i];
      const li = layers.findIndex((L) => mag >= L.lo && mag < L.hi);
      if (li < 0) continue;
      raDecToWorld(cat.ra[i] * DEG, cat.dec[i] * DEG, _dir);
      // 有三角视差的用真实距离（近星产生可辨视差），没有的放到天球边缘
      const ly = cat.distLy[i] > 0 ? Math.min(cat.distLy[i], PARALLAX_LY_LIMIT) : PARALLAX_LY_LIMIT;
      const d = ly * LY_KM;
      const b = buckets[li];
      b.pos.push(_dir.x * d, _dir.y * d, _dir.z * d);
      bvToRgb(cat.bv[i], _rgb);
      // 星等 → 显示强度（物理通量 + 人眼感知压缩，见 magToDisplayIntensity）。
      // 系数把 0 等星压到 1 附近，再由加法混合与整体曝光决定最终观感。
      const I = 1.15 * magToDisplayIntensity(mag);
      b.col.push(_rgb[0] * I, _rgb[1] * I, _rgb[2] * I);
    }
    layers.forEach((L, i) => {
      const b = buckets[i];
      L.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
      L.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
      L.geo.computeBoundingSphere();
      L.count = b.pos.length / 3;
    });
    return cat.count;
  }

  group.frustumCulled = false;

  return {
    group,
    brightGroup,       // 需在 main.js 中 scene.add + world.register([0,0,0], brightGroup)
    setCatalog,
    /** 各层实际绘制的恒星数（供诊断与回归断言） */
    get starCounts() { return layers.map((L) => L.count ?? 0); },
    /** f∈[0,1]：白昼大气内日光淹没星光（0=不可见） */
    setFade(f) {
      for (const m of fadeMats) m.opacity = f;
      if (milkyMat) milkyMat.opacity = f;
      group.visible = f > 0.01;
      brightGroup.visible = f > 0.01;
    },
  };
}
