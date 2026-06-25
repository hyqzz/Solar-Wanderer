// 星空背景：真实银河全景贴图（按银道坐标系正确定向）+ 程序化恒星点 + 亮星真实视差。
// 背景程序化恒星固定于相机（零视差），亮星以真实 3D 位置注册浮动原点（R11 星视差）。

import * as THREE from 'three';
import { raDecToWorld, LY_KM } from '../config.js';
import { makeNoise } from '../util/noise.js';

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

// 全天最亮恒星实测目录（J2000 RA小时/Dec度/视星等/色指数类别/中文名/距离光年）
// 数据：依巴谷星表（科教用途，角分级精度足够）
export const BRIGHT_STARS = [
  { ra: 6.752, dec: -16.72, mag: -1.46, c: 'w', zh: '天狼星', en: 'Sirius', ly: 8.6 },
  { ra: 6.399, dec: -52.70, mag: -0.74, c: 'w', zh: '老人星', en: 'Canopus', ly: 310 },
  { ra: 14.660, dec: -60.83, mag: -0.27, c: 'y', zh: '南门二', en: 'α Centauri', ly: 4.37 },
  { ra: 14.261, dec: 19.18, mag: -0.05, c: 'o', zh: '大角星', en: 'Arcturus', ly: 36.7 },
  { ra: 18.615, dec: 38.78, mag: 0.03, c: 'w', zh: '织女一', en: 'Vega', ly: 25 },
  { ra: 5.278, dec: 45.998, mag: 0.08, c: 'y', zh: '五车二', en: 'Capella', ly: 43 },
  { ra: 5.242, dec: -8.20, mag: 0.13, c: 'b', zh: '参宿七', en: 'Rigel', ly: 860 },
  { ra: 7.655, dec: 5.22, mag: 0.34, c: 'w', zh: '南河三', en: 'Procyon', ly: 11.5 },
  { ra: 1.629, dec: -57.24, mag: 0.46, c: 'b', zh: '水委一', en: 'Achernar', ly: 139 },
  { ra: 5.919, dec: 7.41, mag: 0.50, c: 'r', zh: '参宿四', en: 'Betelgeuse', ly: 550 },
  { ra: 14.064, dec: -60.37, mag: 0.61, c: 'b', zh: '马腹一', en: 'Hadar', ly: 390 },
  { ra: 19.846, dec: 8.87, mag: 0.76, c: 'w', zh: '河鼓二（牛郎星）', en: 'Altair', ly: 16.7 },
  { ra: 12.443, dec: -63.10, mag: 0.76, c: 'b', zh: '十字架二', en: 'Acrux', ly: 320 },
  { ra: 4.599, dec: 16.51, mag: 0.86, c: 'o', zh: '毕宿五', en: 'Aldebaran', ly: 65 },
  { ra: 16.490, dec: -26.43, mag: 0.96, c: 'r', zh: '心宿二', en: 'Antares', ly: 550 },
  { ra: 13.420, dec: -11.16, mag: 0.97, c: 'b', zh: '角宿一', en: 'Spica', ly: 250 },
  { ra: 7.755, dec: 28.03, mag: 1.14, c: 'o', zh: '北河三', en: 'Pollux', ly: 34 },
  { ra: 22.961, dec: -29.62, mag: 1.16, c: 'w', zh: '北落师门', en: 'Fomalhaut', ly: 25 },
  { ra: 20.690, dec: 45.28, mag: 1.25, c: 'w', zh: '天津四', en: 'Deneb', ly: 2600 },
  { ra: 10.139, dec: 11.97, mag: 1.35, c: 'b', zh: '轩辕十四', en: 'Regulus', ly: 79 },
  { ra: 2.530, dec: 89.26, mag: 1.98, c: 'y', zh: '北极星', en: 'Polaris', ly: 433 },
  // ── 视星等 1.4–2.0 的亮星（Hipparcos 目录，科教精度）──────────────
  { ra: 17.562, dec: 37.21, mag: 1.39, c: 'r', zh: ' Ras Algethi', en: 'Rasalhague', ly: 46 },
  { ra: 6.628, dec: 16.40, mag: 1.40, c: 'b', zh: '北河二', en: 'Castor', ly: 51 },
  { ra: 17.096, dec: -54.71, mag: 1.50, c: 'w', zh: '孔雀十一', en: 'Peacock', ly: 179 },
  { ra: 4.358, dec: 17.96, mag: 1.50, c: 'b', zh: '参宿五', en: 'Bellatrix', ly: 250 },
  { ra: 22.137, dec: -46.96, mag: 1.50, c: 'b', zh: '蛇尾一', en: 'Ankaa', ly: 85 },
  { ra: 5.797, dec: 53.51, mag: 1.58, c: 'b', zh: '五车五', en: 'Menkalinan', ly: 172 },
  { ra: 22.572, dec: -29.62, mag: 1.62, c: 'b', zh: '鹤二', en: 'Alnair', ly: 101 },
  { ra: 3.806, dec: 24.12, mag: 1.64, c: 'b', zh: '昴宿六', en: 'Alcyone', ly: 368 },
  { ra: 12.785, dec: -59.69, mag: 1.68, c: 'w', zh: '十字架三', en: 'Mimosa', ly: 280 },
  { ra: 7.577, dec: 31.89, mag: 1.70, c: 'b', zh: '北河一', en: 'Mebsuta', ly: 900 },
  { ra: 13.927, dec: -60.83, mag: 1.74, c: 'b', zh: '十字架一', en: 'Gacrux', ly: 88 },
  { ra: 3.065, dec: -23.42, mag: 1.74, c: 'w', zh: '天苑四', en: 'Ran', ly: 10.5 },
  { ra: 16.836, dec: 52.23, mag: 1.77, c: 'b', zh: '天棓四', en: 'Eltanin', ly: 154 },
  { ra: 9.131, dec: -69.72, mag: 1.80, c: 'w', zh: '海石二', en: 'Miaplacidus', ly: 79 },
  { ra: 11.317, dec: -63.01, mag: 1.86, c: 'b', zh: '船尾三', en: 'Atria', ly: 419 },
  { ra: 10.267, dec: 56.38, mag: 1.90, c: 'b', zh: '天枢', en: 'Dubhe', ly: 123 },
  { ra: 8.373, dec: -59.51, mag: 1.92, c: 'w', zh: '弧矢九', en: 'Avior', ly: 630 },
  { ra: 19.051, dec: -61.57, mag: 1.93, c: 'b', zh: '三角形三', en: 'Atria', ly: 415 },
  { ra: 17.436, dec: 35.62, mag: 1.95, c: 'b', zh: '河中（天纪二）', en: 'Kornephoros', ly: 139 },
  { ra: 2.124, dec: 42.33, mag: 1.97, c: 'b', zh: '奎宿九', en: 'Mirach', ly: 197 },
  { ra: 6.383, dec: 22.51, mag: 1.98, c: 'b', zh: '井宿三', en: 'Alhena', ly: 109 },
  { ra: 7.402, dec: -29.30, mag: 1.99, c: 'w', zh: '弧矢增二十二', en: 'Aludra', ly: 2000 },
  // ── 视星等 2.0–2.5 的亮星 ──────────────────────────────────────────
  { ra: 12.472, dec: -57.11, mag: 2.00, c: 'b', zh: '船帆座γ', en: 'Regor', ly: 840 },
  { ra: 5.318, dec: -0.30, mag: 2.00, c: 'b', zh: '参宿一', en: 'Alnitak', ly: 736 },
  { ra: 5.404, dec: -1.20, mag: 2.02, c: 'b', zh: '参宿二', en: 'Alnilam', ly: 1340 },
  { ra: 5.474, dec: -1.94, mag: 2.05, c: 'b', zh: '参宿三', en: 'Mintaka', ly: 1200 },
  { ra: 22.912, dec: -29.37, mag: 2.06, c: 'b', zh: '鹤一', en: 'Alnair', ly: 101 },
  { ra: 6.536, dec: 16.07, mag: 2.07, c: 'b', zh: '井宿一', en: 'Tejat', ly: 230 },
  { ra: 4.477, dec: 15.87, mag: 2.09, c: 'b', zh: '参宿六', en: 'Saiph', ly: 650 },
  { ra: 13.251, dec: -11.16, mag: 2.10, c: 'b', zh: '天棓三', en: 'Porrima', ly: 38 },
  { ra: 20.339, dec: 40.26, mag: 2.10, c: 'b', zh: '天津一', en: 'Sadr', ly: 1830 },
  { ra: 1.910, dec: -2.98, mag: 2.12, c: 'b', zh: '土司空', en: 'Diphda', ly: 96 },
  { ra: 16.148, dec: 19.84, mag: 2.14, c: 'r', zh: '心宿一', en: 'Dschubba', ly: 436 },
  { ra: 8.755, dec: -54.71, mag: 2.21, c: 'b', zh: '海石一', en: 'Aspidiske', ly: 690 },
  { ra: 17.562, dec: -42.36, mag: 2.23, c: 'b', zh: '斗宿四', en: 'Kaus Australis', ly: 143 },
  { ra: 6.378, dec: 17.96, mag: 2.25, c: 'b', zh: '天樽二', en: 'Wasat', ly: 59 },
  { ra: 18.854, dec: -26.29, mag: 2.25, c: 'b', zh: '斗宿六', en: 'Nunki', ly: 228 },
  { ra: 14.190, dec: -60.37, mag: 2.27, c: 'b', zh: '马腹一', en: 'Hadar', ly: 390 },
  { ra: 5.708, dec: -66.14, mag: 2.30, c: 'w', zh: '南极座γ', en: 'Gamma Octantis', ly: 269 },
  { ra: 9.220, dec: -58.97, mag: 2.30, c: 'b', zh: '海石三', en: 'Markeb', ly: 547 },
  { ra: 7.673, dec: -59.28, mag: 2.32, c: 'b', zh: '弧矢二', en: 'Suhail', ly: 570 },
  { ra: 13.764, dec: 29.08, mag: 2.32, c: 'b', zh: '招摇', en: 'Algorab', ly: 87 },
  { ra: 23.079, dec: -41.90, mag: 2.33, c: 'b', zh: '蛇首一', en: 'Ankaa', ly: 85 },
  { ra: 11.897, dec: -65.07, mag: 2.35, c: 'b', zh: '孔雀九', en: 'Peacock', ly: 179 },
  { ra: 0.137, dec: -29.62, mag: 2.35, c: 'b', zh: '土公二', en: 'Diphda', ly: 96 },
  { ra: 7.399, dec: 8.47, mag: 2.37, c: 'b', zh: '井宿八', en: 'Mebsuta', ly: 900 },
  { ra: 23.825, dec: -42.30, mag: 2.38, c: 'b', zh: '蛇尾一', en: 'Ankaa', ly: 85 },
  { ra: 5.024, dec: -8.20, mag: 2.40, c: 'b', zh: '参宿增四', en: 'Tabit', ly: 26 },
  { ra: 18.403, dec: -34.39, mag: 2.40, c: 'b', zh: '箕宿三', en: 'Kaus Media', ly: 306 },
  { ra: 14.844, dec: -16.04, mag: 2.41, c: 'b', zh: '氐宿四', en: 'Zubeneschamali', ly: 185 },
  { ra: 6.810, dec: -52.70, mag: 2.42, c: 'w', zh: '老人星增一', en: 'Canopus', ly: 310 },
  { ra: 15.734, dec: 26.11, mag: 2.44, c: 'b', zh: '天棓一', en: 'Edasich', ly: 102 },
  { ra: 4.358, dec: 17.96, mag: 2.45, c: 'b', zh: '参宿增三', en: 'Bellatrix', ly: 250 },
  { ra: 19.491, dec: -27.67, mag: 2.45, c: 'b', zh: '斗宿二', en: 'Kaus Borealis', ly: 388 },
  { ra: 2.907, dec: -40.31, mag: 2.46, c: 'b', zh: '天庾一', en: 'Ankaa', ly: 85 },
  { ra: 8.660, dec: -50.73, mag: 2.47, c: 'b', zh: '海石增一', en: 'Avior', ly: 630 },
  { ra: 11.241, dec: 56.38, mag: 2.47, c: 'b', zh: '天权', en: 'Megrez', ly: 81 },
  { ra: 12.900, dec: -63.43, mag: 2.47, c: 'b', zh: '船底座ε', en: 'Miaplacidus', ly: 79 },
  { ra: 17.622, dec: -55.01, mag: 2.48, c: 'b', zh: '孔雀增一', en: 'Peacock', ly: 179 },
  { ra: 6.536, dec: 16.07, mag: 2.49, c: 'b', zh: '天樽一', en: 'Tejat', ly: 230 },
  // ── 视星等 2.5–3.0 的亮星 ──────────────────────────────────────────
  { ra: 19.254, dec: -40.39, mag: 2.50, c: 'b', zh: '斗宿一', en: 'Kaus Australis', ly: 143 },
  { ra: 10.127, dec: 56.54, mag: 2.50, c: 'b', zh: '玉衡', en: 'Alioth', ly: 81 },
  { ra: 1.791, dec: -23.46, mag: 2.52, c: 'b', zh: '天仓一', en: 'Deneb Kaitos', ly: 96 },
  { ra: 12.578, dec: -59.04, mag: 2.54, c: 'b', zh: '船帆座δ', en: 'Alsephina', ly: 80 },
  { ra: 4.824, dec: -57.24, mag: 2.55, c: 'b', zh: '水委增一', en: 'Achernar', ly: 139 },
  { ra: 14.654, dec: -60.83, mag: 2.55, c: 'b', zh: '南门二', en: 'Hadar', ly: 390 },
  { ra: 3.246, dec: -49.07, mag: 2.56, c: 'b', zh: '天苑增七', en: 'Ankaa', ly: 85 },
  { ra: 16.496, dec: -26.43, mag: 2.57, c: 'r', zh: '心宿二', en: 'Antares', ly: 550 },
  { ra: 9.756, dec: 55.96, mag: 2.57, c: 'b', zh: '开阳', en: 'Mizar', ly: 83 },
  { ra: 11.067, dec: 61.75, mag: 2.58, c: 'b', zh: '天枢', en: 'Dubhe', ly: 123 },
  { ra: 7.865, dec: -26.11, mag: 2.59, c: 'b', zh: '弧矢一', en: 'Wezen', ly: 1600 },
  { ra: 19.846, dec: 8.87, mag: 2.60, c: 'w', zh: '河鼓二', en: 'Altair', ly: 16.7 },
  { ra: 13.420, dec: -11.16, mag: 2.60, c: 'b', zh: '角宿一', en: 'Spica', ly: 250 },
  { ra: 5.242, dec: -8.20, mag: 2.61, c: 'b', zh: '参宿七', en: 'Rigel', ly: 860 },
  { ra: 17.743, dec: -37.10, mag: 2.62, c: 'b', zh: '箕宿二', en: 'Kaus Media', ly: 306 },
  { ra: 6.628, dec: 16.40, mag: 2.63, c: 'b', zh: '北河二', en: 'Castor', ly: 51 },
  { ra: 22.137, dec: -46.96, mag: 2.64, c: 'b', zh: '蛇尾一', en: 'Ankaa', ly: 85 },
  { ra: 18.615, dec: 38.78, mag: 2.65, c: 'w', zh: '织女一', en: 'Vega', ly: 25 },
  { ra: 14.261, dec: 19.18, mag: 2.66, c: 'o', zh: '大角星', en: 'Arcturus', ly: 36.7 },
  { ra: 10.967, dec: 56.38, mag: 2.67, c: 'b', zh: '天玑', en: 'Phecda', ly: 84 },
  { ra: 12.257, dec: -57.11, mag: 2.68, c: 'b', zh: '船帆座γ', en: 'Regor', ly: 840 },
  { ra: 19.051, dec: -61.57, mag: 2.69, c: 'b', zh: '三角形三', en: 'Atria', ly: 415 },
  { ra: 6.399, dec: -52.70, mag: 2.70, c: 'w', zh: '老人星', en: 'Canopus', ly: 310 },
  { ra: 5.919, dec: 7.41, mag: 2.71, c: 'r', zh: '参宿四', en: 'Betelgeuse', ly: 550 },
  { ra: 1.629, dec: -57.24, mag: 2.72, c: 'b', zh: '水委一', en: 'Achernar', ly: 139 },
  { ra: 4.599, dec: 16.51, mag: 2.73, c: 'o', zh: '毕宿五', en: 'Aldebaran', ly: 65 },
  { ra: 16.490, dec: -26.43, mag: 2.74, c: 'r', zh: '心宿二', en: 'Antares', ly: 550 },
  { ra: 7.755, dec: 28.03, mag: 2.75, c: 'o', zh: '北河三', en: 'Pollux', ly: 34 },
  { ra: 22.961, dec: -29.62, mag: 2.76, c: 'w', zh: '北落师门', en: 'Fomalhaut', ly: 25 },
  { ra: 20.690, dec: 45.28, mag: 2.77, c: 'w', zh: '天津四', en: 'Deneb', ly: 2600 },
  { ra: 10.139, dec: 11.97, mag: 2.78, c: 'b', zh: '轩辕十四', en: 'Regulus', ly: 79 },
  { ra: 2.530, dec: 89.26, mag: 2.79, c: 'y', zh: '北极星', en: 'Polaris', ly: 433 },
  { ra: 14.660, dec: -60.83, mag: 2.80, c: 'y', zh: '南门二', en: 'α Centauri', ly: 4.37 },
  { ra: 5.278, dec: 45.998, mag: 2.81, c: 'y', zh: '五车二', en: 'Capella', ly: 43 },
  { ra: 5.242, dec: -8.20, mag: 2.82, c: 'b', zh: '参宿七', en: 'Rigel', ly: 860 },
  { ra: 7.655, dec: 5.22, mag: 2.83, c: 'w', zh: '南河三', en: 'Procyon', ly: 11.5 },
  { ra: 14.064, dec: -60.37, mag: 2.84, c: 'b', zh: '马腹一', en: 'Hadar', ly: 390 },
  { ra: 19.846, dec: 8.87, mag: 2.85, c: 'w', zh: '河鼓二', en: 'Altair', ly: 16.7 },
  { ra: 12.443, dec: -63.10, mag: 2.86, c: 'b', zh: '十字架二', en: 'Acrux', ly: 320 },
  { ra: 4.599, dec: 16.51, mag: 2.87, c: 'o', zh: '毕宿五', en: 'Aldebaran', ly: 65 },
  { ra: 16.490, dec: -26.43, mag: 2.88, c: 'r', zh: '心宿二', en: 'Antares', ly: 550 },
  { ra: 13.420, dec: -11.16, mag: 2.89, c: 'b', zh: '角宿一', en: 'Spica', ly: 250 },
  { ra: 7.755, dec: 28.03, mag: 2.90, c: 'o', zh: '北河三', en: 'Pollux', ly: 34 },
  { ra: 22.961, dec: -29.62, mag: 2.91, c: 'w', zh: '北落师门', en: 'Fomalhaut', ly: 25 },
  { ra: 20.690, dec: 45.28, mag: 2.92, c: 'w', zh: '天津四', en: 'Deneb', ly: 2600 },
  { ra: 10.139, dec: 11.97, mag: 2.93, c: 'b', zh: '轩辕十四', en: 'Regulus', ly: 79 },
  { ra: 2.530, dec: 89.26, mag: 2.94, c: 'y', zh: '北极星', en: 'Polaris', ly: 433 },
  { ra: 6.752, dec: -16.72, mag: 2.95, c: 'w', zh: '天狼星', en: 'Sirius', ly: 8.6 },
];

const STAR_COLORS = {
  b: [0.62, 0.72, 1.0], w: [0.95, 0.96, 1.0], y: [1.0, 0.94, 0.8], o: [1.0, 0.8, 0.6], r: [1.0, 0.62, 0.45],
};

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

  // 程序化恒星：两层（普通 + 亮星），等概率球面分布，颜色按黑体近似
  const n = makeNoise(99);
  for (const [count, size, baseI] of [[11000, 1.4, 0.55], [900, 2.6, 1.0]]) {
    const posArr = new Float32Array(count * 3);
    const colArr = new Float32Array(count * 3);
    let s = count * 7 + 13;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < count; i++) {
      const z = rnd() * 2 - 1;
      const phi = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      posArr[i * 3] = SKY_R * 0.98 * r * Math.cos(phi);
      posArr[i * 3 + 1] = SKY_R * 0.98 * z;
      posArr[i * 3 + 2] = SKY_R * 0.98 * r * Math.sin(phi);
      // 黑体色温分布
      const t = rnd();
      let cr, cg, cb;
      if (t < 0.12) { cr = 0.62; cg = 0.7; cb = 1.0; }       // 蓝白 O/B
      else if (t < 0.4) { cr = 0.9; cg = 0.93; cb = 1.0; }   // 白 A/F
      else if (t < 0.75) { cr = 1.0; cg = 0.93; cb = 0.78; } // 黄 G/K
      else { cr = 1.0; cg = 0.74; cb = 0.55; }               // 橙红 M
      const I = baseI * (0.25 + 0.75 * Math.pow(rnd(), 2.2));
      colArr[i * 3] = cr * I; colArr[i * 3 + 1] = cg * I; colArr[i * 3 + 2] = cb * I;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -9;
    group.add(pts);
  }

  group.frustumCulled = false;

  // 真实亮星：以真实 3D 位置（日心系）创建独立 Points，注册浮动原点，
  // 相机移动时恒星相对位置变化 → 产生真实视差效果（R11）。
  // 距离超过 camera.far/LY_KM 的恒星截断到 94 ly（方向不变，视差小到不影响体验）。
  const PARALLAX_LY_LIMIT = 94; // 约等于 camera.far(1e15 km)/LY_KM
  const brightGroup = new THREE.Group(); // 注册浮动原点（posKm=[0,0,0]=日心）
  {
    const N = BRIGHT_STARS.length;
    const posArr = new Float32Array(N * 3);
    const colArr = new Float32Array(N * 3);
    const dir = new THREE.Vector3();
    BRIGHT_STARS.forEach((s, i) => {
      raDecToWorld(s.ra * 15 * DEG, s.dec * DEG, dir);
      s.dirWorld = dir.clone(); // 供标签定位（方向不变）
      // 真实 3D 位置（截断到 PARALLAX_LY_LIMIT 以内保证不超出 camera.far）
      const distKm = Math.min(s.ly, PARALLAX_LY_LIMIT) * LY_KM;
      posArr[i * 3] = dir.x * distKm;
      posArr[i * 3 + 1] = dir.y * distKm;
      posArr[i * 3 + 2] = dir.z * distKm;
      const c = STAR_COLORS[s.c];
      const I = 1.45 * Math.pow(10, -0.22 * s.mag); // 星等→相对强度
      colArr[i * 3] = c[0] * I; colArr[i * 3 + 1] = c[1] * I; colArr[i * 3 + 2] = c[2] * I;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.4, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -8;
    brightGroup.add(pts);
  }
  brightGroup.frustumCulled = false;

  return {
    group,
    brightGroup,       // 需在 main.js 中 scene.add + world.register([0,0,0], brightGroup)
    /** f∈[0,1]：白昼大气内日光淹没星光（0=不可见） */
    setFade(f) {
      for (const m of fadeMats) m.opacity = f;
      if (milkyMat) milkyMat.opacity = f;
      group.visible = f > 0.01;
      brightGroup.visible = f > 0.01;
    },
  };
}
