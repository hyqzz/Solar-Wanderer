// 行星表面材质：自定义光照着色器。
// - 真实太阳方向的昼夜明暗（平滑晨昏线）
// - 地球：夜面城市灯光 + 海洋镜面反射（按贴图蓝色启发式掩码）
// - HDR：太阳辐照度按 1/d²（地球处=1）缩放
// - R7 #4：片元程序化细节（分辨率无关，SpaceEngine 路线）——
//   气巨/冰巨：纬向拉伸湍流双尺度 + 风暴涡 + 临边昏暗；岩质：各向同性细节。
//   按行星视半径淡入：远观与 R5 审查版一致，贴近时低清贴图不再糊。

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';
import { HAPKE_PARAMS } from '../astro/bodies.js';
import { QUALITY } from '../engine/quality.js';

// 1×1 占位纹理：避免未启用分支的 sampler 绑定空值
const DUMMY_TEX = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1);
DUMMY_TEX.needsUpdate = true;

/**
 * 云贴图 → 光学厚度的共享映射。
 *
 * 行星着色器（地表云影）与云层着色器都要做这一步，此前是两处各写一份**逐字相同**的
 * 阈值公式——一旦改一边就会"阴影与可见云错位"，所以抽到这里只写一次。
 *
 * 为什么不能阈值化：旧版 `clamp((lum − 0.10) × 1.8, 0, 1)` 在 lum > 0.65 就饱和到 1。
 * 云贴图里大片中间调因此被压成**硬边不透明白斑**（地球近景一眼可见的假），
 * 而真实云即使星下点也很少完全不透明，边缘更是连续渐变的。
 * 改成幂律：光学厚度随亮度平滑增长、永不硬截断，细节全部保留。
 * 系数经覆盖比例校准——真实地球瞬时云量约六成，含大量薄云与大片晴空。
 */
const CLOUD_GLSL = /* glsl */ `
  // 云量 → 光学厚度。
  //
  // 这里**不是**把 GIBS 的"云量"直接当光学厚度用。云量产品（MODIS 云量）统计的是
  // "被云覆盖的像元比例"，薄卷云也算满格，而薄卷云在可见光下几乎透明。直接映射的
  // 后果实测过：全球云量均值 0.70 → 平均不透明度 0.775，整颗地球糊成一个白球
  // （日下点盘面 180,193,211，63.8% 的盘面像元亮度 >200，云的结构全被冲掉）。
  //
  // 改成**更高次幂的连续幂律**（1.45 → 4.5）：同样把均值压下来，但不引入阈值——
  // 阈值化会在高云量处饱和成硬边不透明白斑（这条踩过一次，有回归测试盯着）。
  // 指数 4.5 与系数 2.0 是按"看起来像地球"标定的：全球云量均值 0.70 处的
  // 不透明度从 0.775 降到约 0.33，厚云仍到 0.7 以上。
  // 判据见 tools/audit-cloudab.mjs（关云对照给出 (53,87,133) 的深蓝海洋作为参照）。
  float cloudTau(vec3 cl) {
    float lum = clamp(dot(cl, vec3(0.34)), 0.0, 1.0);
    return pow(lum, 4.5) * 2.0;
  }
  // 星下点垂直光程下的不透明度（Beer–Lambert：永不饱和，薄云保持半透明）
  float cloudAlpha(vec3 cl) { return 1.0 - exp(-cloudTau(cl)); }

  /**
   * 云的动画采样 UV（自转偏移 + 扰动）。
   *
   * 扰动噪声必须按 **3D 方向**采样，不能按 uv：uv.x 在反经线处 1→0 跳变，
   * 噪声在那一圈上断裂，画面上是一条贯穿盘面的点状缝——地球近景一眼可见，
   * 而它既不是轨道线也不是贴图缝，很难归因。方向向量跨反经线连续，
   * 且极点附近不退化（uv 噪声在极点会被压缩成同心条纹）。
   */
  vec2 cloudUV(vec2 uv, float t) {
    // uv 是 SphereGeometry 口径（见 latLonOf）：u 增大 = 经度**减小**，
    // 所以经度是 (0.5 − u)·2π，与 v 的 (v − 0.5)·π 不是同一个式子。
    vec2 ang = vec2((0.5 - uv.x) * 6.2831853, (uv.y - 0.5) * 3.14159265);
    vec3 dir = vec3(cos(ang.y) * cos(ang.x), sin(ang.y), cos(ang.y) * sin(ang.x));
    float d = pnoise(dir * 8.0 + vec3(0.0, 0.0, t * 0.008));
    // 自转偏移取负号：u 轴是反的，云要**东移**（相对地表超旋转）就得减 u。
    // 写成加号会让云向西倒着飘——一帧看不出来，时间加速跑一会儿就明显了。
    return uv + vec2(-t * 0.00002 + d * 0.008, d * 0.004);
  }
`;

// 天体 ID（着色器内 int 分支选择）：与 bodies.js 的 key 对应。
// 用 int 而非 string——GLSL ES 1.0 不支持字符串比较，且 int 分支开销极低。
const BODY_EARTH = 3, BODY_MARS = 4, BODY_JUPITER = 5, BODY_SATURN = 6, BODY_TRITON = 100;
const BODY_ID_MAP = {
  earth: BODY_EARTH, mars: BODY_MARS, jupiter: BODY_JUPITER,
  saturn: BODY_SATURN, triton: BODY_TRITON,
};

// 逐天体色彩分级（对标 NASA/JPL 实测影像：信使号/旅行者/卡西尼/新视野号参考观感）。
// 引擎的 1/d² 辐照 + 暗适应曝光补偿在物理上正确，但与公众熟知的探测器影像观感有系统偏差
// （探测器影像本身做了各自的曝光/增强），此处按天体逐一校正：
// - grade：反照率增益（亮度/色温）
// - sat：饱和度（ACES 压缩去饱和的补偿）
// - veil/veilColor：不透明霾罩（土卫六：可见光完全无法穿透的橙色 tholin 烟雾，
//   卡西尼可见光影像为无表面特征的橙色圆盘；降到霾层高度以下才逐渐显露出表面）
const BODY_GRADE = {
  mercury: { grade: [0.40, 0.38, 0.36] },          // 真实反照率 0.09，暗灰微棕（MESSENGER）
  earth:   { grade: [1, 1, 1], sat: 1 },
  // 木星/土星：ACES 在亮部会去饱和，而真实照片里两者的棕褐/淡金是很明确的。
  // 这里的 sat 是**显示层**的饱和度补偿（与星历/反照率无关），幅度按
  // "盘面 R−B 分离度接近实拍"标定，不改变相对亮度。
  jupiter: { sat: 1.35 },
  uranus:  { grade: [1.50, 1.65, 1.70] },          // 淡青（旅行者 2 号观感）
  // Oxford/Irwin 2024: Neptune is pale green-blue, not enhanced Voyager blue.
  // Approximate display correction of this legacy map; not spectral calibration.
  // dim 是**显示级**压暗（不参与物理）：按实测反照率 0.442 标定后，海王星盘面
  // 比线上亮约 4 倍（线上其实欠曝）。取中间值 0.45，既保留"冰巨星是亮的"这个
  // 物理事实，又回到人眼熟悉的那种深蓝。
  neptune: { grade: [2.50, 2.50, 2.50], tint: [0.86, 1.02, 1.09], tintMix: 0.94, dim: 0.28 },
  pluto:   { grade: [1, 1, 1], sat: 1 },
  triton:  { grade: [1.08, 1.00, 0.95], sat: 1 },
  callisto: { grade: [0.90, 0.90, 0.92] },         // 压暗压冷，突出亮坑
  saturn:  { sat: 1.22 },                          // 淡金：ACES 亮部去饱和的补偿
  // 不透明橙色霾（卡西尼自然色：柔和卡其橙盘）。
  // 已知未闭合：按"贴图均值×分级=实测反照率 0.22"标定后，盘面仍偏亮约 1.8 倍，
  // 且颜色偏中性——20R 处土卫六的盘面只有 ~25px，测量掩膜已大于盘面，
  // 读数被背景污染。需要专门的近距机位重测，本轮未闭合。
  titan:   { veil: 0.94, veilColor: [0.92, 0.45, 0.14] },
};
// 地形层（terrain.js 顶点色采样同一份贴图）需要同步这份反照率校正，
// 否则从太空看分级正确的暗天体（水星 0.40×），落到地表却是未分级的亮贴图色。
// sat 一并导出（地球：盘面靠 uSat 补偿 ACES 去饱和，地形若无同款饱和度陆地会发灰）。

// ── 反照率标定：贴图只承载"相对"结构，绝对亮度由实测反照率给定 ──────────────
//
// 贴图是"显示参考"的中间调，它的绝对亮度没有物理含义。此前整条链路的表面亮度
// 就等于贴图的像素值（乘光照），于是亮度排序完全错：土卫二的贴图均值 0.136、
// 火星 0.219，两者相近，渲染出来土卫二甚至比火星更暗——而实测几何反照率是
// 0.99 对 0.25（差 4 倍）。太阳系最白的固体表面被画成了一个灰球。
//
// 标定方式：albedo = 贴图 × (实测反照率 / 贴图线性均值)。这样贴图保留全部
// 相对结构（坑、月海、条带），绝对亮度锚在实测值上。
//
// 两个输入：
//   TEXTURE_LIN_MEAN —— tools/audit-texmean.mjs 实测（sRGB 解码到线性后取均值）
//   SURFACE_ALBEDO   —— 实测几何反照率。注意要填**贴图所描绘的那一层**：
//                       地球贴图是无云地表（≈0.20），不是含云的行星几何反照率 0.434；
//                       金星贴图是云顶，所以填 0.67 是对的。
// 表里没有的天体（无实测值 / 程序化贴图）标定系数为 1，即保持原样——宁可不改，
// 也不拿猜的数去改。
export const TEXTURE_LIN_MEAN = {
  'enceladus.jpg': 0.1363, 'mimas.jpg': 0.1653, 'tethys.jpg': 0.1887, 'dione.jpg': 0.2106,
  'rhea.jpg': 0.1709, 'iapetus.jpg': 0.2244, 'titan.jpg': 0.2477, 'charon.jpg': 0.1664,
  'europa.png': 0.5171, 'io.jpg': 0.2872, 'callisto.jpg': 0.1669, 'ganymede.jpg': 0.2076,
  'moon.jpg': 0.3026, 'mercury.jpg': 0.2277, 'mars.jpg': 0.2186, 'earth_day.jpg': 0.1958,
  'pluto.jpg': 0.3975, 'jupiter.jpg': 0.3613, 'saturn.jpg': 0.5440, 'uranus.jpg': 0.5505,
  'neptune.jpg': 0.1010, 'triton.jpg': 0.3096, 'venus_atmosphere.jpg': 0.5543,
};

/** 实测几何反照率（贴图所描绘的那一层）。无实测值的天体不列，标定系数取 1。 */
export const SURFACE_ALBEDO = {
  mercury: 0.106, venus: 0.67, earth: 0.20, moon: 0.136, mars: 0.25,
  jupiter: 0.538, saturn: 0.499, uranus: 0.488, neptune: 0.442, pluto: 0.52,
  io: 0.63, europa: 0.67, ganymede: 0.43, callisto: 0.17,
  mimas: 0.962, enceladus: 0.99, tethys: 0.80, dione: 0.998, rhea: 0.949,
  titan: 0.22, iapetus: 0.25, triton: 0.76, charon: 0.38,
  // ── 2026-10-18 补齐：曝光适应需要**每个**可聚焦天体都有反照率锚点，
  // 缺一个就等于那个天体的"自动曝光"失效（要么过暗要么过亮）。
  // 数值取各任务的几何反照率（NSSDC / JPL 小体数据库 / 探测器反演）。
  phobos: 0.071, deimos: 0.068, ceres: 0.09,
  hyperion: 0.30, phoebe: 0.081, janus: 0.71, epimetheus: 0.73,
  prometheus: 0.60, pandora: 0.50, pan: 0.50, atlas: 0.40,
  miranda: 0.32, ariel: 0.39, umbriel: 0.21, titania: 0.27, oberon: 0.23,
  puck: 0.32, portia: 0.30,
  proteus: 0.10, nereid: 0.155, larissa: 0.09, galatea: 0.60,
  hydra: 0.35, nix: 0.35, kerberos: 0.35, styx: 0.35,
  amalthea: 0.09, thebe: 0.05, metis: 0.06, adrastea: 0.05,
  daphnis: 0.50, helene: 0.60, telesto: 0.60, calypso: 0.60,
};

/** 贴图 → 标定系数。无贴图 / 无实测值 / 无实测反照率时返回 1（不改）。 */
export function albedoScaleOf(texFile, bodyId) {
  const m = texFile ? TEXTURE_LIN_MEAN[texFile] : undefined;
  const a = bodyId ? SURFACE_ALBEDO[bodyId] : undefined;
  if (!(m > 0) || !(a > 0)) return 1;
  return a / m;
}

// 天体 → 贴图文件名（反照率标定要按贴图查线性均值；只有三个不符合 <id>.jpg 的约定）
const TEX_FILE_BY_BODY = { earth: 'earth_day.jpg', europa: 'europa.png', venus: 'venus_atmosphere.jpg' };
const texFileOf = (id) => TEX_FILE_BY_BODY[id] ?? `${id}.jpg`;

/** 显示分级表：**亮度**全部由实测反照率给定，BODY_GRADE 只保留**色相**。
 *
 * 为什么要把 BODY_GRADE 的亮度归一掉：它的 grade 里本来就混着"亮度校正"——
 * 水星 0.40 与反照率标定算出来的 0.466 几乎是同一个数，是同一件事的手调版本。
 * 直接相乘会把这份校正计入两次（水星变成 0.19，比物理值暗一倍多）。
 * 归一掉亮度、只留色相，再乘物理标定系数，就既没有重复计入、又保住了原色。
 *
 * 盘面（uGrade）与地形（TERRAIN_GRADE）必须用**同一张表**，否则同一天体
 * 在太空与落地两种亮度。 */
const DISPLAY_GRADE = (() => {
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const ids = new Set([...Object.keys(BODY_GRADE), ...Object.keys(SURFACE_ALBEDO)]);
  const out = {};
  for (const id of ids) {
    const g = BODY_GRADE[id] ?? {};
    const s = albedoScaleOf(texFileOf(id), id);
    const base = g.grade ?? [1, 1, 1];
    const l = lum(base) || 1;
    const grade = base.map((v) => (v / l) * s * (g.dim ?? 1));
    if (!g.grade && s === 1) continue;   // 既无手调分级又无实测反照率：不列，用默认
    out[id] = { grade, sat: g.sat ?? 1 };
  }
  return out;
})();

/** 地形层用的分级表（与盘面同源，见 DISPLAY_GRADE）。 */
export const TERRAIN_GRADE = DISPLAY_GRADE;

/** 盘面材质用的分级（同样来自 DISPLAY_GRADE）。 */
export function displayGradeOf(bodyId) { return DISPLAY_GRADE[bodyId] ?? null; }

/**
 * Hapke 模型的**盘面积分亮度**（相位角 0、正对日下点观测），相对"正对白面"。
 *
 * 为什么需要它：几何反照率的定义基准是"完美兰伯特球"——盘面平均亮度 = 2/3。
 * 而 Hapke 相位函数的盘面平均并不是 2/3：以月球的参数算出来只有约 0.29，
 * 于是 `albedo(=实测几何反照率) × shade` 把整颗天体压暗了 2 倍以上
 * （实测：土卫二盘面 134，而反照率 0.25 的火星是 162——排序是反的）。
 *
 * 这里按定义数值积分：加权用的是投影面积元 μdμ（正对观测时 μ=cosθ）。
 * 兰伯特情形 shade=μ 代入得到 2/3，可作为公式自检。
 */
export function hapkeDiskMean(w, B0, h, g) {
  const sq = Math.sqrt(Math.max(1 - w, 1e-6));
  const ca = 1;                       // 相位角 0
  const denom = 1 + g * g + 2 * g * ca;
  const P = (1 - g * g) / Math.pow(Math.max(denom, 1e-6), 1.5);
  const B = B0 / (1 + Math.tan(0) / Math.max(h, 1e-4));   // α=0 → B=B0
  let num = 0, den = 0;
  const N = 64;
  for (let i = 0; i < N; i++) {
    const mu = (i + 0.5) / N;
    const H = (1 + 2 * mu) / (1 + 2 * mu * sq);
    const shade = 0.25 * 0.5 * ((1 + B) * P + H * H - 1);
    num += shade * mu;
    den += mu;
  }
  return num / den;
}

export function createPlanetMaterial({
  map, nightMap = null, oceanSpec = false, ringShadow = null,
  detailMode = 0, radiusKm = 1, // detailMode: 0 无 / 1 岩质 / 2 气巨冰巨
  bodyId = null, cloudTex = null, // bodyId 驱动天体特定效果；cloudTex 用于地球云层投影
}) {
  // ringShadow: { tex|null, innerKm, outerKm } —— 环对行星本体的投影（卡西尼实拍标志性特征）
  // 无气天体走 Hapke 风化层 BRDF；表里没有的天体（有大气）保持 Lambert。
  const hp = HAPKE_PARAMS[bodyId] ?? null;
  const uniforms = {
    uMap: { value: map },
    uNight: { value: nightMap ?? DUMMY_TEX },
    uHasNight: { value: nightMap ? 1 : 0 },
    uOcean: { value: oceanSpec ? 1 : 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) }, // 世界系，指向太阳
    uSunI: { value: 1.0 },                          // 相对地球辐照度
    uHasRing: { value: ringShadow ? 1 : 0 },
    uHasRingTex: { value: ringShadow?.tex ? 1 : 0 },
    uRingTex: { value: ringShadow?.tex ?? DUMMY_TEX },
    uRingInner: { value: ringShadow?.innerKm ?? 1 },
    uRingOuter: { value: ringShadow?.outerKm ?? 2 },
    uRingNormal: { value: new THREE.Vector3(0, 1, 0) }, // 环面法向（世界，每帧更新）
    uRingShine: { value: 0 },                          // 环照强度（无环天体为 0）
    uCenter: { value: new THREE.Vector3() },            // 行星中心（相机相对，每帧更新）
    uDetailMode: { value: detailMode },                 // 可运行时降档置 0
    uRadius: { value: radiusKm },
    // === Issue #26/#27/#28/#29/#36：真实感着色器 uniforms ===
    uTime: { value: 0 },           // 秒（实时，驱动云层/条带/极光帘幕动画）
    uLs: { value: 0 },             // 火星太阳黄经（度，驱动尘暴季节性）
    uSubsolarLat: { value: 0 },    // 日下点纬度（度，驱动冰冠/季节变化）
    uBodyId: { value: BODY_ID_MAP[bodyId] ?? 0 }, // 天体 ID（着色器分支）
    uCloudTex: { value: cloudTex ?? DUMMY_TEX },  // 地球云层贴图（地表投影用）
    uHasClouds: { value: cloudTex ? 1 : 0 },
    // 逐天体色彩分级（BODY_GRADE 表；缺省 = 无修正）
    // 亮度来自实测反照率标定（DISPLAY_GRADE 已把它折进去）
    uGrade: { value: new THREE.Vector3(...(DISPLAY_GRADE[bodyId]?.grade ?? [1, 1, 1])) },
    uInvScaleY: { value: 1 },
    uDetailScaleN: { value: Math.min(1, radiusKm / 400) },
    // Hapke 盘面归一化：让 shade 的盘面平均等于兰伯特球的 2/3，
    // 从而 albedo(=实测几何反照率) × shade 的盘面平均 = A_geo × 2/3（定义基准）。
    uHapkeNorm: { value: (() => {
      if (!hp) return 1;
      const dm = hapkeDiskMean(hp.w, hp.B0, hp.h, hp.g);
      return dm > 1e-6 ? (2 / 3) / dm : 1;
    })() },
    uSat: { value: BODY_GRADE[bodyId]?.sat ?? 1.0 },
    uNaturalTint: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.tint ?? [1, 1, 1])) },
    uNaturalTintMix: { value: BODY_GRADE[bodyId]?.tintMix ?? 0 },
    uVeil: { value: BODY_GRADE[bodyId]?.veil ?? 0.0 },
    uVeilColor: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.veilColor ?? [0, 0, 0])) },
    // 日食：遮挡体位置与半径（世界系，相机相对），以及本体的日心距
    uEclOn: { value: 0 },
    uEclPos: { value: new THREE.Vector3() },
    uEclR: { value: 1 },
    uSunDistKm: { value: 1.496e8 },
    // 无气天体：Hapke 风化层 BRDF（见 src/astro/bodies.js HAPKE_PARAMS）
    uHapke: { value: hp ? 1 : 0 },
    uW: { value: hp?.w ?? 0.25 },
    uB0: { value: hp?.B0 ?? 1.0 },
    uHh: { value: hp?.h ?? 0.06 },
    uHg: { value: hp?.g ?? -0.3 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      uniform float uInvScaleY;   // 见片元：非均匀缩放的逆转置
      uniform float uDetailScaleN;
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vObjPos;
      void main() {
        vUv = uv;
        // 非均匀缩放（巨行星压扁）必须用**逆转置**：物体空间法线分量要除以缩放因子。
        // 直接乘 modelMatrix 会让土星中纬法线偏约 5.6°，晨昏线位置与临边昏暗随之错。
        vNormalW = normalize(mat3(modelMatrix) * vec3(normal.x, normal.y * uInvScaleY, normal.z));
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vObjPos = position; // 对象空间（随行星自转，细节特征固定在表面）
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform sampler2D uNight;
      uniform int uHasNight;
      uniform int uOcean;
      uniform int uHasRing;
      uniform int uHasRingTex;
      uniform sampler2D uRingTex;
      uniform float uRingInner, uRingOuter;
      uniform vec3 uRingNormal;
      uniform float uRingShine;
      uniform vec3 uCenter;
      uniform vec3 uSunDir;
      uniform float uSunI;
      uniform int uDetailMode;
      uniform float uRadius;
      // === Issue #26/#27/#28/#36 uniforms ===
      uniform float uTime;
      uniform float uLs;
      uniform float uSubsolarLat;
      uniform int uBodyId;
      uniform sampler2D uCloudTex;
      uniform int uHasClouds;
      uniform vec3 uGrade;
      uniform float uInvScaleY;
      uniform float uDetailScaleN;
      uniform float uHapkeNorm;
      uniform float uSat;
      uniform vec3 uNaturalTint;
      uniform float uNaturalTintMix;
      uniform float uVeil;
      uniform vec3 uVeilColor;
      uniform int uEclOn;
      uniform vec3 uEclPos;
      uniform float uEclR;
      uniform float uSunDistKm;
      const float SUN_RADIUS_KM = 695700.0;
      uniform int uHapke;
      uniform float uW, uB0, uHh, uHg;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vObjPos;

      ${HASH_GLSL}
      float phash(vec3 p) { return glslHash31(p); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
${CLOUD_GLSL}

      // 角度差归一化到 [-π, π]（用于大红斑经度比较，跨 0/2π 边界正确）
      float angleDiff(float a, float b) {
        float d = a - b;
        return mod(d + 3.14159265, 6.2831853) - 3.14159265;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        vec3 albedo = texture2D(uMap, vUv).rgb;
        float app = uRadius / max(length(vPosW), uRadius); // 视半径因子（相机恒在原点，浮动原点）
        // 程序化细节（按行星视半径淡入，远观恒等于原贴图）
        if (uDetailMode > 0) {
          float dist = length(vPosW); // 相机恒在原点（浮动原点）
          // 淡入范围从 0.01 起（#18：更远处开始出现程序细节，平滑球面→地形过渡）
          float fade = smoothstep(0.01, 0.18, app);
          if (fade > 0.001) {
            vec3 p = vObjPos / uRadius;
            if (uDetailMode == 2) {
              // 气巨/冰巨：纬向拉伸湍流（条带内流动结构）双尺度 + 风暴涡
              vec3 ps = vec3(p.x * 0.22, p.y, p.z * 0.22);
              float t1 = pnoise(ps * 48.0);
              float t2 = pnoise(ps * 190.0) * smoothstep(0.18, 0.7, app);
              float storm = smoothstep(0.74, 0.95, pnoise(p * 85.0 + 13.7));
              // 土星极区降噪：湍流/风暴涡在极盖（贴图蓝灰极区）上叠加出紫斑伪影，
              // 真实土星极区为平滑六边形急流结构——极区程序化细节衰减到 0
              float polarDamp = 1.0;
              if (uBodyId == 6) polarDamp = 1.0 - smoothstep(0.78, 0.92, abs(p.y));
              albedo *= 1.0 + fade * polarDamp * ((t1 - 0.5) * 0.16 + (t2 - 0.5) * 0.10);
              albedo = mix(albedo, albedo * vec3(1.10, 1.05, 0.97), fade * storm * 0.55 * polarDamp);
            } else {
              // 岩质/冰面：三尺度各向同性细节（#21：比原来多一层，地形接管前中距离更真实）
              float t1 = pnoise(p * 64.0);
              float t2 = pnoise(p * 340.0) * smoothstep(0.2, 0.75, app);
              float t3 = pnoise(p * 1200.0) * smoothstep(0.35, 0.9, app);
              albedo *= 1.0 + fade * ((t1 - 0.5) * 0.22 + (t2 - 0.5) * 0.14 + (t3 - 0.5) * 0.07);
              // === 细节同时扰动法线 ===
              // 此前程序化细节**只改反照率**，法线始终是光滑球面——近看就是
              // "画在球上的斑块"，没有起伏感（岩石/地形那边是扰动的，这里不是）。
              // 用与细节同一套噪声的中心差分求梯度，幅度随 fade 淡入。
              {
                vec3 pn = vObjPos / uRadius;
                float k = 64.0;
                float e = 0.05;                      // 噪声空间步长（约 1/20 格）
                float f0 = pnoise(pn * k);
                vec3 g = vec3(
                  pnoise(pn * k + vec3(e, 0, 0)) - f0,
                  pnoise(pn * k + vec3(0, e, 0)) - f0,
                  pnoise(pn * k + vec3(0, 0, e)) - f0);
                n = normalize(n + g * (1.6 * fade * uDetailScaleN));
              }
            }
          }
          // === Issue #28：木星动态云带 + 大红斑 ===
          // 纬向风剖面（交替东西向急流）+ System III 经度漂移的大红斑 + 对流胞。
          // 保持基础贴图可识别：所有调制为乘法/混合，不替换底色。
          // === 气巨纬向风与湍流（木星与土星）===
          // 真实气巨的条带不是静态色带：纬向急流交替（木星约 12 条），急流边界
          // （剪切最大处）才有明显的涡街与 festoon。此前只有一条正弦 + 各向同性
          // 噪声，画面上是"平滑色带"——卡西尼/朱诺实拍里那种卷曲结构完全没有。
          if (uBodyId == 5 || uBodyId == 6) {
            float lat = vObjPos.y / uRadius; // 归一化纬度 -1..1
            // 急流条数：木星约 12 对（24 个极值），土星更少更宽
            float jets = (uBodyId == 5) ? 24.0 : 16.0;
            float windSpeed = sin(lat * jets + 0.6) * 0.00022;
            float flow = uTime * windSpeed;
            vec3 jp = vObjPos / uRadius;
            // 剪切强度：急流边界处 |dwind/dlat| 最大，涡街只在那里出现
            float shear = abs(cos(lat * jets + 0.6));
            // 沿经度拉伸 ~6:1 的湍流（纬度方向频率远高于经度）
            float turb = pnoise(vec3(jp.x * 4.0 + flow, jp.y * 26.0, jp.z * 4.0 + flow * 0.5))
                       * (0.05 + 0.11 * shear) * smoothstep(0.015, 0.12, app);
            albedo *= 1.0 + turb;
            // 涡旋（eddy）：剪切带上的旋涡斑，方向随纬度交替（相邻带反向）
            float eddyN = pnoise(vec3(jp.x * 9.0 - flow * 0.7, jp.y * 42.0, jp.z * 9.0 - flow * 0.35));
            float eddy = smoothstep(0.60, 0.86, eddyN) * shear
                       * smoothstep(0.03, 0.18, app);
            albedo = mix(albedo, albedo * vec3(1.13, 1.06, 0.96), eddy * 0.40);
            // 对流胞（只木星）：近距才淡入，远观不可见避免摩尔纹
            if (uBodyId == 5) {
              float conv = pnoise(jp * 25.0 + vec3(uTime * 0.03)) * smoothstep(0.15, 0.5, app);
              albedo *= 1.0 + conv * 0.06;
            }
            // 大红斑：贴图（卡西尼拼接）自带 GRS 于 ~22°S——原位增强其红橙色饱和度。
            // 旧版在漂移经度叠加第二个程序化红斑，与贴图红斑分离后形成双斑/洗白圈。
            // 在 UV 空间定位（对球面 UV 约定稳健）：贴图 GRS 中心 u≈0.368, v≈0.628。
            if (uBodyId == 5) {
              vec2 grsD = vec2(angleDiff(vUv.x, 0.368), vUv.y - 0.628);
              float grs = (1.0 - smoothstep(0.008, 0.040, abs(grsD.x)))
                        * (1.0 - smoothstep(0.004, 0.022, abs(grsD.y)));
              vec3 grsCol = albedo * vec3(1.80, 0.74, 0.52) + vec3(0.05, 0.004, 0.0);
              albedo = mix(albedo, grsCol, grs * 0.85);
            }
          }
          // === Issue #36：季节性极地冰冠（仅地球保留） ===
          // 火星分支已移除：程序冰冠低至纬度 ~51° 且混入 70% 白色，远大于真实
          // 火星极冠（多在 80°+），把两极整块刷白、盖掉贴图 —— 还原为贴图原色。
          if (uBodyId == 3) { // 地球：轴倾角 23.5°，水冰极冠（微弱，叠加在贴图真实冰盖上）
            float lat = vObjPos.y / uRadius;
            float ss = uSubsolarLat / 23.5;
            float nCap = smoothstep(0.85 + ss * 0.04, 0.92 + ss * 0.04, lat);
            float sCap = smoothstep(0.85 - ss * 0.04, 0.92 - ss * 0.04, -lat);
            float cap = max(nCap, sCap);
            albedo = mix(albedo, vec3(0.95, 0.97, 1.0), cap * 0.5);
          }
          if (uBodyId == 4) { // 火星：季节极冠（CO₂ 霜冬季延伸 + 夏季残余水冰冠）
            float latS = vObjPos.y / uRadius; // sin(纬度)
            // 北半球冬季极盛于 Ls=270°；南半球冬季极盛于 Ls=90°
            float winterN = 0.5 + 0.5 * cos((uLs - 270.0) * 0.0174532925);
            float winterS = 0.5 + 0.5 * cos((uLs - 90.0) * 0.0174532925);
            // 残余冰冠边缘 sin(82°)≈0.990；季节霜缘最大 sin(55°)≈0.819
            float edgeN = mix(0.990, 0.819, winterN * winterN);
            float edgeS = mix(0.990, 0.819, winterS * winterS);
            float capN = smoothstep(edgeN - 0.015, edgeN + 0.02, latS);
            float capS = smoothstep(edgeS - 0.015, edgeS + 0.02, -latS);
            float cap = max(capN, capS);
            // CO₂ 霜偏蓝白、薄；残余水冰冠更亮
            albedo = mix(albedo, vec3(0.92, 0.94, 0.99), cap * 0.55);
          }
        }
        // 逐天体色彩分级（对标探测器实测影像；BODY_GRADE 表）
        // 逐天体分级（DISPLAY_GRADE）：亮度来自实测反照率标定，色相来自手调分级
        albedo *= uGrade;
        albedo = mix(albedo, dot(albedo, vec3(0.2126, 0.7152, 0.0722)) * uNaturalTint, uNaturalTintMix);
        albedo = mix(vec3(dot(albedo, vec3(0.3333))), albedo, uSat);
        // 地球深海蓝：开阔大洋水体反照率极低（~0.03-0.06，吸收红绿光），
        // 贴图海洋像素偏亮偏青；按蓝色掩码压暗并加深蓝移（Blue Marble/阿波罗实拍观感）
        if (uBodyId == 3) {
          float om = clamp((albedo.b - max(albedo.r, albedo.g * 0.9)) * 6.0, 0.0, 1.0);
          // 冰盖不是海：南极/格陵兰的贴图同样"偏蓝"（雪在阴影里偏蓝），会被上面的
          // 蓝色掩码判成开阔大洋，压暗并偏蓝约 24%。用亮度把"亮而偏蓝"的冰排除掉
          // ——真实冰盖反照率 0.7–0.9，开阔大洋只有 0.03–0.06，两者亮度差一个数量级。
          float lum3 = dot(albedo, vec3(0.3333));
          om *= 1.0 - smoothstep(0.42, 0.68, lum3);
          albedo *= mix(vec3(1.0), vec3(0.52, 0.60, 0.86), om * 0.8);
        }
        // 土星极区重着色：贴图极盖为蓝灰斑驳（2013 蓝极期数据），经临边昏暗+ACES 后
        // 呈紫斑伪影；真实（2017+ 卡西尼后期）极区为金色乳白。随后叠加北极六边形
        // （~77°N 波数 6 驻波急流，卡西尼实拍标志特征；体固系随波自转）。
        if (uBodyId == 6) {
          vec3 pp = vObjPos / uRadius;
          float poleF = smoothstep(0.84, 0.95, abs(pp.y));
          albedo = mix(albedo, vec3(0.79, 0.74, 0.60), poleF * 0.78);
          float hexBand = smoothstep(0.950, 0.968, pp.y) * (1.0 - smoothstep(0.978, 0.995, pp.y));
          albedo *= 1.0 + cos(6.0 * atan(pp.z, pp.x)) * hexBand * 0.06;
        }
        // 不透明霾罩（土卫六）：远观为无特征橙色盘（卡西尼可见光实拍）；
        // 下降穿越霾层（~200 km，app≈0.93 对应高度 < 7.5%R）时逐渐显露表面。
        float veilEff = uVeil;
        if (uDetailMode > 0) veilEff = uVeil * (1.0 - smoothstep(0.50, 0.93, app));
        albedo = mix(albedo, uVeilColor, veilEff);
        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.06, 0.12, ndl);
        // === Issue #26：地球云层在地表的软阴影 ===
        // 云层球壳略大于行星（1.0035×），UV 映射一致；此处用同一动画偏移采样云层贴图，
        // 在白昼面（day>0）按云层不透明度衰减直射光，产生软阴影。夜面无阴影（无直射光）。
        float cloudShadow = 1.0;
        if (uBodyId == 3 && uHasClouds == 1 && uDetailMode > 0) {
          // 与云层着色器同一 UV 动画（自转偏移 + 扰动），保证阴影与可见云对齐
          vec3 cloudCol = texture2D(uCloudTex, cloudUV(vUv, uTime)).rgb;
          // 与云层着色器同一映射（见 CLOUD_GLSL），否则阴影会与可见云错位
          cloudShadow = 1.0 - cloudAlpha(cloudCol) * 0.32 * day;
        }
        // 环投影：沿太阳方向与环平面求交，落在环半径内则按环光学深度遮挡直射光
        float ringSh = 1.0;
        if (uHasRing == 1) {
          vec3 rel = vPosW - uCenter;
          float denom = dot(uRingNormal, uSunDir);
          if (abs(denom) > 1e-4) {
            float t = -dot(uRingNormal, rel) / denom;
            if (t > 0.0) {
              float r = length(rel + uSunDir * t);
              float u = (r - uRingInner) / (uRingOuter - uRingInner);
              if (u > 0.0 && u < 1.0) {
                float a = uHasRingTex == 1 ? texture2D(uRingTex, vec2(u, 0.5)).a : 0.3;
                ringSh = 1.0 - a * 0.88;
              }
            }
          }
        }
        // === 无气天体：Hapke 风化层 BRDF 取代 Lambert ===
        // 真实月面在相位角趋近 0° 时亮度陡增（满月比线性外推亮 40%+），这是裸眼与
        // 实拍照片里最显著的月面特征，Lambert 完全给不出。采用 Hapke(1981/1986) 常用简化式：
        //   r = (w/4π)·[μ0/(μ0+μ)]·[(1+B(α))·P(α) + H(μ0)H(μ) − 1]
        //   B(α) = B0/(1+tan(α/2)/h)          冲日项
        //   P(α) = Henyey-Greenstein（负 g = 后向散射）
        //   H(x) = (1+2x)/(1+2x√(1−w))        Chandrasekhar 近似
        // r 里已含 cos(入射角)，故此处不再另乘 ndl；按 r·π/w 归一到同反照率的
        // Lambert，使既有亮度体系（uSunI / 曝光 / 逐天体分级）无需重标定。
        float shade = max(ndl, 0.0);
        if (uHapke == 1) {
          vec3 V = normalize(cameraPosition - vPosW);
          vec3 L = normalize(uSunDir);
          float mu0 = max(dot(n, L), 0.0);
          float mu  = max(dot(n, V), 0.0);
          float ca  = clamp(dot(L, V), -1.0, 1.0);
          float alpha = acos(ca);
          float B = uB0 / (1.0 + tan(alpha * 0.5) / max(uHh, 1e-4));
          float gg = uHg;
          float denom = 1.0 + gg * gg + 2.0 * gg * ca;
          float P = (1.0 - gg * gg) / pow(max(denom, 1e-4), 1.5);
          float sq = sqrt(max(1.0 - uW, 1e-4));
          float H0 = (1.0 + 2.0 * mu0) / (1.0 + 2.0 * mu0 * sq);
          float H1 = (1.0 + 2.0 * mu)  / (1.0 + 2.0 * mu  * sq);
          float r = (uW / 12.566370614) * (mu0 / max(mu0 + mu, 1e-4))
                  * ((1.0 + B) * P + H0 * H1 - 1.0);
          shade = clamp(r * 3.14159265 / max(uW, 1e-3), 0.0, 4.0);
        // 盘面归一化（见 hapkeDiskMean）：否则 Hapke 的盘面平均比兰伯特球低一半以上，
        // 亮冰卫星会被压成灰球、月球地面会偏暗。
        shade *= uHapkeNorm;
        }
        // === 日食遮蔽（逐片元）===
        // 原实现只在场景里插一个黑色锥体网格：接收体表面本身不变暗，
        // 于是"日全食时地面还是亮的"——这是与真实相差最远的一处。
        // 这里按真实的可见性判据算：从该片元看，遮挡体与太阳的**角半径**谁大、
        // 两者中心的**角分离**多少，决定遮蔽比例（贝利珠/日冕环等更细的效应仍未建模）。
        float eclSh = 1.0;
        if (uEclOn == 1) {
          vec3 toOcc = uEclPos - vPosW;
          float dOcc = max(length(toOcc), 1.0);
          float aOcc = asin(clamp(uEclR / dOcc, 0.0, 1.0));
          // === 贝利珠 ===
          // 遮挡体的边缘不是完美的圆：月面山谷让阳光从边缘漏过，全食开始/结束时
          // 会看到一串亮点（Baily's beads）。这里按"太阳方向绕遮挡体轴的方位角"
          // 给角半径加一点起伏——不是真实月面地形，但给出了正确的**现象**。
          {
            vec3 toOccN = toOcc / dOcc;
            vec3 helper = abs(toOccN.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 e1 = normalize(cross(toOccN, helper));
            vec3 e2 = cross(toOccN, e1);
            vec3 toSunN = -normalize(uSunDir);
            float az = atan(dot(toSunN, e2), dot(toSunN, e1));
            float edge = 1.0 + 0.0045 * (sin(az * 9.0) * 0.5
                        + sin(az * 17.0 + 1.3) * 0.3 + sin(az * 31.0 + 2.7) * 0.2);
            aOcc *= edge;
          }
          float aSun = asin(clamp(SUN_RADIUS_KM / max(uSunDistKm, 1.0), 0.0, 1.0));
          float sep = acos(clamp(dot(toOcc / dOcc, normalize(uSunDir)), -1.0, 1.0));
          // 两圆盘重叠比例。下界必须是 |aOcc−aSun| 而不是 aSun−aOcc：
          // 当遮挡体角半径远大于太阳时（木星遮木卫：9.6° vs 0.05°），
          // 正对时 sep=0 会落在 aSun−aOcc 与 aSun+aOcc 的正中，只给出 50% —— 
          // 而物理上此时太阳被完全挡住，应当是全遮。
          float lo = abs(aOcc - aSun), hi = aOcc + aSun;
          float cover = 1.0 - smoothstep(lo, hi, sep);
          eclSh = 1.0 - cover;
        }
        vec3 col = albedo * shade * uSunI * ringSh * cloudShadow * eclSh;
        // 气巨临边昏暗（厚大气斜视光程长 → 边缘变暗，旅行者/卡西尼实拍特征）
        if (uDetailMode == 2) {
          float muv = max(dot(n, normalize(-vPosW)), 0.0);
          col *= 0.55 + 0.45 * pow(muv, 0.55);
        }
        // === Issue #27：火星全球尘暴 ===
        // Ls 180-360 为风暴季（南半球春冬）；程序化噪声生成尘暴纹理，
        // 全球迷雾覆盖降低表面可见度，色调偏黄粉（悬浮 Fe₂O₃ 尘埃）。
        if (uBodyId == 4 && uDetailMode > 0) {
          // 风暴季强度：Ls 180-220 上升，220-330 全盛，330-360 衰退
          float stormSeason = smoothstep(180.0, 220.0, uLs) * (1.0 - smoothstep(330.0, 360.0, uLs));
          vec3 dp = vObjPos / uRadius;
          // 双尺度噪声：大尺度尘暴团 + 小尺度纹理
          float dust = 0.5 + 0.5 * pnoise(dp * 4.0 + vec3(uTime * 0.015));
          dust *= 0.6 + 0.4 * pnoise(dp * 10.0 + vec3(uTime * 0.03));
          // 黄粉色迷雾覆盖：混合尘色并降低表面可见度
          vec3 dustColor = vec3(0.82, 0.62, 0.45);
          float haze = stormSeason * dust * 0.55;
          col = mix(col, col * dustColor * 0.7 + dustColor * 0.12, haze);
        }
        // 极微弱环境光（星光/行星际散射），避免夜面纯黑
        // 夜面底光（地照/星光下的最低可见度）。**必须随太阳辐照缩放**：
        // 此前是个常数 0.0035，在土星处（sunI≈0.011）相当于白昼亮度的 31%，
        // 外太阳系行星的夜面因此异常亮；在地球处只有 0.35%，反而偏暗。
        col += albedo * 0.0035 * uSunI;
        // 环照（ringshine）：土星夜面被环系反射的阳光照亮，不是全黑。
        // 这是卡西尼最有辨识度的画面之一（夜面呈暗金色、近环侧更亮）。
        if (uHasRing == 1) {
          float ringSide = max(0.0, dot(n, uRingNormal));
          col += albedo * uRingShine * ringSide;
        }
        if (uHasNight == 1) {
          vec3 city = texture2D(uNight, vUv).rgb;
          // 城市灯光：3.0 倍增益 + 微暖色温（ISS 夜拍观感——金色灯网；ACES 低照度区压缩需补偿）
        vec3 cityGlow = city * vec3(1.12, 1.0, 0.82);
        col += cityGlow * (1.0 - day) * 3.0;
        }
        if (uOcean == 1) {
          float oceanMask = clamp((albedo.b - max(albedo.r, albedo.g * 0.9)) * 6.0, 0.0, 1.0);
          vec3 v = normalize(cameraPosition - vPosW);
          vec3 h = normalize(uSunDir + v);
          // 太阳耀斑：真实海面耀斑是紧凑亮斑（阵风粗糙海面 ~3° 散布），
          // 旧值 90 次幂过宽（整片白昼面中央巨大白晕），1.6 倍增益洗白海洋
          float spec = pow(max(dot(n, h), 0.0), 340.0);
          col += vec3(1.0, 0.97, 0.9) * spec * oceanMask * uSunI * max(ndl, 0.0) * 1.1;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}

/** 云层材质（半透明球壳，受同一太阳方向照明）
 *  Issue #26：程序化云层动画——缓慢旋转（与地球自转有微小差异）+ 噪声扰动 UV。
 *  网络失败时 builder 不创建云层网格（回退到静态无云地球），此函数仅在贴图可用时调用。 */
export function createCloudMaterial(cloudTex, opts = {}) {
  const R = opts.radiusKm ?? 6371;
  // 云层垂直范围：云底 1.5 km 到云顶 22 km（真实地球云顶约 12–16 km，深对流可到 20 km）。
  // 壳体网格放在外边界上，步进区间由着色器解析求交得到，与光栅化在哪个面无关。
  const baseR = R * (opts.baseRatio ?? 1.0002);
  const topR = R * (opts.topRatio ?? 1.0035);
  const uniforms = {
    uMap: { value: cloudTex },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uSunI: { value: 1.0 },
    uTime: { value: 0 }, // 秒，驱动云层旋转与扰动
    uCenter: { value: new THREE.Vector3() }, // 行星中心（相机相对，km），每帧更新
    uRBase: { value: baseR },
    uRTop: { value: topR },
    uThicknessKm: { value: topR - baseR },
    // 体积云只在 High 档开启（见着色器内的说明）
    uVolumetric: { value: (opts.volumetric ?? (QUALITY.tier === 'high' && QUALITY.detail)) ? 1 : 0 },
    uSteps: { value: QUALITY.cloudN },
    uLightSteps: { value: QUALITY.cloudNL },
    uCameraInside: { value: 0 },
    // 体固系逆旋转（世界 → 体固）。云层的经纬度必须在这个坐标系里算，理由见
    // latLonOf 的说明；由 builder 每帧从 mesh.quaternion 写入。
    uBodyInv: { value: new THREE.Matrix3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // 体积步进累加出来的是预乘颜色（每步都乘了自身 alpha 与已累积透射率），
    // 声明为预乘混合，否则会被再乘一次 alpha 而整体发暗。
    premultipliedAlpha: true,
    // DoubleSide + 着色器内按 uCameraInside 丢弃多余的那一面：
    // 从外部看保留正面，从内部看保留背面，两种视角都正确且不重复混合。
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      uniform float uInvScaleY;   // 见片元：非均匀缩放的逆转置
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vUv = uv;
        // 非均匀缩放（巨行星压扁）必须用**逆转置**：物体空间法线分量要除以缩放因子。
        // 直接乘 modelMatrix 会让土星中纬法线偏约 5.6°，晨昏线位置与临边昏暗随之错。
        vNormalW = normalize(mat3(modelMatrix) * vec3(normal.x, normal.y * uInvScaleY, normal.z));
        vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      uniform float uSunI;
      uniform float uTime;
      uniform vec3 uCenter;
      uniform float uRBase;
      uniform float uRTop;
      uniform float uThicknessKm;
      uniform int uVolumetric;   // 0 = 轻量单次采样（Low / 移动端）
      uniform int uSteps;        // 实际步进数，编译期上限之内按距离自适应
      uniform int uLightSteps;
      uniform float uCameraInside;  // 相机是否在云壳内部（决定保留哪一面）
      uniform mat3 uBodyInv;        // 世界 → 体固（云层经纬度的坐标系）
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      // 射线与球求交 → (近交点, 远交点)；未命中返回 (1,-1)
      vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
        vec3 oc = ro - c;
        float b = dot(oc, rd);
        float h = b * b - (dot(oc, oc) - r * r);
        if (h < 0.0) return vec2(1.0, -1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      // 世界坐标 → 该天体**体固系**的等距圆柱 UV
      //
      // 必须先转到体固系：云壳是球，绕球心旋转把球映到自身，片元的 vPosW 分布
      // 根本不随自转改变。直接用世界坐标求经纬度会有两个后果——
      //   ① 云挂在惯性系里不跟着地表转（时间加速跑一会儿就看出来）；
      //   ② atan 的分支割线落在世界系里一条固定的圈上，画面上是一条横穿盘面的缝，
      //      位置随相机变，且既不像轨道线也不像贴图缝，极难归因。
      // 转进体固系后割线正好落在反经线上，与地表贴图的接缝重合。
      //
      // 两个分量还必须与 Three.js SphereGeometry 的 uv 属性一致，否则云层相对
      // 地表贴图错位。SphereGeometry 的顶点是
      //     x = −r·cos(2πu)·sin(θ),  z = r·sin(2πu)·sin(θ)
      // 于是 atan2(z, x) = π − 2πu，即
      //     u_几何 = 0.5 − atan2(z,x)/2π        （**不是** + 0.5）
      // 写成 +0.5 会让云图相对地表东西**镜像**。u 轴差 1−u 这一条用
      // SphereGeometry 的 uv 属性逐顶点比对即可复现，见 tests/rendering.test.mjs。
      // v 轴：uv.y = 1 在北极，所以是 0.5 + asin(y)/π 而不是减。
      vec2 latLonOf(vec3 q) {
        vec3 rel = uBodyInv * (q - uCenter);
        float rl = max(length(rel), 0.001);
        return vec2(0.5 - atan(rel.z, rel.x) / 6.2831853,
                    0.5 + asin(clamp(rel.y / rl, -1.0, 1.0)) / 3.14159265);
      }

      // 与行星材质相同的 value-noise，保证云层扰动与地表阴影一致
      ${HASH_GLSL}
      float phash(vec3 p) { return glslHash31(p); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
${CLOUD_GLSL}

      /**
       * 云密度：贴图给出水平覆盖，垂直方向用经验廓线。
       * 廓线底部渐入、上部渐出、云顶最锐——掠射时才会看到"云顶"这条边，
       * 而不是原来那种上下一样厚的平板。
       */
      /**
       * 球面点的经/纬切向基。用于自己算云贴图的采样足迹。
       */
      void cloudBasis(vec3 rel, out vec3 east, out vec3 north, out float rl, out float cosLat) {
        rl = max(length(rel), 0.001);
        vec3 nn = rel / rl;
        cosLat = max(length(nn.xz), 0.02);      // 极点附近钳住，避免足迹发散
        vec2 h = nn.xz / cosLat;
        east = vec3(-h.y, 0.0, h.x);
        north = cross(nn, east);
      }

      /**
       * 云贴图的采样足迹（每像素的 uv 变化量）。
       *
       * 为什么不能靠隐式导数：latLonOf 用 atan(z, x)，在反经线上有分支割线，
       * uv.x 从 1 跳到 0。dFdx(uv.x) 因此在那一列像素上爆成巨值，GPU 取到最粗的
       * mip，反经线上就出现一条颜色突变的缝；又因为割线只穿过少数像素四边形，
       * 缝表现为**等距点阵**——地球近景一眼可见，且既不像轨道线也不像贴图缝，
       * 极难归因（实测：关云层即消失，但贴图本身 0 条异常列、反经线接缝与相邻列
       * 差异同量级；关掉 mipmap 也消失——三条线索合起来才指向 LOD 尖峰）。
       *
       * 改用球面上的连续量（相对球心的位置向量）算足迹：它跨反经线连续，
       * 导数不会爆。梯度一律在**均匀控制流**下算好再传进去——步进循环里有
       * continue/break，在非均匀控制流里调 dFdx 是未定义行为。
       */
      vec2 cloudFootprint(vec3 rel, vec3 east, vec3 north, float rl, float cosLat, bool dxAxis) {
        vec3 d = dxAxis ? dFdx(rel) : dFdy(rel);
        return vec2(dot(d, east) / (6.2831853 * rl * cosLat),
                    dot(d, north) / (3.14159265 * rl));
      }

      float cloudDensity(vec2 uv, float hFrac, vec2 gx, vec2 gy) {
        vec3 cl = textureGrad(uMap, cloudUV(uv, uTime), gx, gy).rgb;
        float prof = smoothstep(0.0, 0.18, hFrac) * (1.0 - smoothstep(0.55, 1.0, hFrac));
        return cloudTau(cl) * prof;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        vec3 rd = normalize(vPosW);
        vec3 ro = vec3(0.0);            // 浮动原点：相机恒在世界原点
        vec3 L = normalize(uSunDir);

        // 云贴图的采样足迹：两条路径共用，且必须在**任何 discard 之前**算。
        //
        // 两条硬约束，各踩过一次：
        //  · 不能放在步进循环里——循环里有 continue/break，非均匀控制流下 dFdx 未定义。
        //  · 不能放在 discard 之后——discard 会让同一像素四边形内**剩余**片元的导数
        //    变成未定义值；而且若用解析入射点，射线打空的片元会拿到哨兵值（1.0），
        //    与邻居差上千公里，四边形内的导数直接爆掉 → 取到最粗 mip → 云壳边缘
        //    出现一条亮带。改用**片元自身的世界位置**：它处处连续，片元又本就在壳面上。
        vec3 relE = uBodyInv * (vPosW - uCenter);
        vec3 cEast, cNorth; float cRl, cCos;
        cloudBasis(relE, cEast, cNorth, cRl, cCos);
        vec2 gX = cloudFootprint(relE, cEast, cNorth, cRl, cCos, true);
        vec2 gY = cloudFootprint(relE, cEast, cNorth, cRl, cCos, false);

        // 云壳的面剔除：相机在壳外要保留正面（近半球，在行星之前，深度测试能通过），
        // 在壳内（地表、低空）则要保留背面——壳外的正面此时朝后，会被整体剔除，
        // 那正是"从地面看不到云"的原因。只用 FrontSide 或只用 BackSide 都只能覆盖一半。
        // 步进区间一律由解析求交得到，与光栅化在哪个面无关。
        if (uCameraInside > 0.5) { if (gl_FrontFacing) discard; }
        else { if (!gl_FrontFacing) discard; }

        vec2 tRt = raySphere(ro, rd, uCenter, uRTop);
        float tEnter = max(tRt.x, 0.0);
        if (tRt.y <= tEnter) discard;

        float dayF = smoothstep(-0.06, 0.12, dot(n, L));
        vec3 nightTint = mix(vec3(0.010, 0.013, 0.020), vec3(0.004), dayF);

        // ── 轻量路径：单次采样 ───────────────────────────────────────
        // Low / 移动端。SwiftShader 软件渲染下实测（地球充满画面，p50）：
        //   云层关闭 92.4 ms ｜ 轻量 99.3 ms（+7%）｜ 体积 126.6 ms（+37%）
        // 体积路径相对轻量多 27 ms，集显会把 45 FPS 拖到 30 出头——
        // 所以默认只在 High 档（独显）开启。软件渲染的绝对值不能外推到真机，
        // 但两条路径之间的比例关系可用。
        // 两条路径都输出**预乘**颜色，与材质的 premultipliedAlpha 一致。
        if (uVolumetric == 0) {
          // 单次采样走的是整层垂直光程，所以这里要的是**整层不透明度**，
          // 而不是某一高度上的密度——用 cloudAlpha（Beer–Lambert）而非 cloudDensity。
          // 旧版把 hFrac=0.5 处的密度直接当 alpha 用，等于只看了半层，
          // 又叠加阈值截断，于是云要么全透要么全白，没有中间态。
          vec2 luv = cloudUV(latLonOf(ro + rd * tEnter), uTime);
          float alpha = cloudAlpha(textureGrad(uMap, luv, gX, gY).rgb) * mix(0.42, 1.0, dayF);
          vec3 col = vec3(max(dot(n, L), 0.0)) * uSunI + nightTint;
          gl_FragColor = vec4(col * alpha, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }

        // ── 体积路径：薄壳内有限步长光线步进 ─────────────────────────
        // 壳厚约 22 km（云底 1.5 km）。只有掠射时路径才显著变长——那正是
        // "云有厚度"最容易看出来的地方：临边的云顶轮廓与逆光银边。
        vec2 tRb = raySphere(ro, rd, uCenter, uRBase);
        float t1 = min(tRt.y, (tRb.x > 0.0 ? tRb.x : tRt.y));
        if (t1 <= tEnter) discard;
        float span = t1 - tEnter;

        const int N = ${QUALITY.cloudN};
        const int NL = ${QUALITY.cloudNL};
        float ds = span / float(N);
        vec3 acc = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < N; i++) {
          if (i >= uSteps) break;
          vec3 pp = ro + rd * (tEnter + (float(i) + 0.5) * ds);
          vec3 rel = pp - uCenter;
          float rl = length(rel);
          float hFrac = clamp((rl - uRBase) / max(uThicknessKm, 0.001), 0.0, 1.0);
          float d = cloudDensity(latLonOf(pp), hFrac, gX, gY);
          if (d <= 0.002) continue;
          // 自阴影：沿太阳方向短程步进累计云内光程（云被自身上方遮挡而变暗）
          float shadow = 0.0;
          for (int j = 1; j <= NL; j++) {
            if (j > uLightSteps) break;
            vec3 q = pp + L * (float(j) * ds);
            float ql = max(length(q - uCenter), 0.001);
            float qh = clamp((ql - uRBase) / max(uThicknessKm, 0.001), 0.0, 1.0);
            shadow += cloudDensity(latLonOf(q), qh, gX, gY);
          }
          float sunT = exp(-shadow * 1.7);
          // 前向散射银边：逆光时云缘发亮（真实云最标志性的特征之一）
          float silver = pow(clamp(dot(rd, L), 0.0, 1.0), 8.0) * 1.6;
          float ndl = dot(normalize(rel), L);
          vec3 lit = (vec3(max(ndl, 0.0)) * sunT + vec3(silver * sunT * 0.3)) * uSunI;
          float a = 1.0 - exp(-d * ds * 0.55);
          acc += lit * a * T;
          T *= 1.0 - a;
          if (T < 0.01) break;
        }
        acc += nightTint * (1.0 - T);
        gl_FragColor = vec4(acc, 1.0 - T);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}
