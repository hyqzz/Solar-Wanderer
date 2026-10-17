// 登陆地表系统（无人深空级）：相机接近固体天体时在脚下生成同心环形 LOD 地形。
// - 高度场：大尺度构造 + 山地掩码 + 双尺度撞击坑 + 三层细节频率（米级起伏）
// - 颜色：真实全球贴图反照率 × 坡度岩壁化 × 高度调制
// - 片元级三尺度细节噪声（近看不糊，NMS 质感）
// - 世界锚定确定性岩石散布（InstancedMesh，重建不漂移）
// heightFn 同时供行走碰撞使用（几何与碰撞同源，无穿模）。

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';
import { shapeRadiusKm, hasShapeModel } from './shapeModels.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, hashSeed } from '../util/noise.js';
import { QUALITY } from '../engine/quality.js';
import { DEMTileSource } from './demTiles.js';
import { TERRAIN_GRADE } from './planetMaterial.js';

/** sRGB 字节 → 线性反照率（与 GPU 对 SRGBColorSpace 贴图的解码一致）。
 * 地形顶点色读的是 canvas 的 sRGB 字节，而行星材质采样的是 GPU 解码后的线性值；
 * 旧实现把字节直接当线性用，地形反照率中灰处偏亮约 2.2×——地表发白，且与盘面
 * 同色处形成接缝（高空看是"地形从球面里冒出的米色斑块"）。 */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// 极冠霜冻覆盖颜色（palette → [r,g,b]，仅无贴图天体使用；有贴图时极冠由贴图承载）
const FROST_PALETTES = {
  mars:   [0.86, 0.82, 0.78], // CO₂干冰，略带玫瑰粉
  ice:    [0.94, 0.96, 1.00], // 水冰，纯白带蓝
  pluto:  [0.90, 0.88, 0.84], // 氮冰，米白
  triton: [0.88, 0.86, 0.92], // 氮冰+甲烷，微蓝紫
  gray:   [0.80, 0.80, 0.82], // 月面极区轻微高反照率
};

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
/** 整数哈希 → [0,1)。用于按格号确定性地决定"这一格有没有坑、坑心在哪、多大"。 */
function ihash(x, y, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
        ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 坑深（km）。观测到的形态转变，不是可调参数：
 *  简单坑（D<15km）是碗形，深径比 ~0.2（线性）；
 *  过了 15km 进入复杂坑，深度-直径关系**不再是线性的**——平底、中央峰、阶地
 *  出现，深径比迅速下降。用幂律拟合实测：Orientale（930km）约 6km 深、
 *  Caloris（1550km）约 8km，都远浅于线性外推（那会得到 190/310km，直接穿模）。 */
function craterDepth(D) {
  return D < 15 ? 0.20 * D : 2.4 * Math.pow(D / 15, 0.28);
}

/** 归一化剖面（x = r/R，返回值为 depth 的倍数）。 */
function craterProfile(x, complex) {
  if (x >= 2.4) return 0;
  if (x >= 1.0) {
    // 溅射毯：外侧缓坡抬升，幂律衰减（真实坑的溅射毯可延伸约一个坑半径）
    const t = (2.4 - x) / 1.4;
    return 0.18 * t * t * t;
  }
  // 坑缘环（抬升）
  const rim = 0.24 * Math.exp(-((x - 0.94) ** 2) / 0.012);
  let bowl;
  if (complex) {
    // 复杂坑：平底 + 中央峰 + 阶地
    bowl = x < 0.62 ? -1 : -(1 - ((x - 0.62) / 0.38) ** 2);
    bowl += 0.35 * Math.exp(-(x * x) / 0.012);
    if (x > 0.62) bowl += 0.09 * Math.cos(x * 22);
  } else {
    bowl = -(1 - x * x);   // 碗形
  }
  return bowl + rim;
}

/**
 * 撞击坑场：按**尺寸-频率分布**分层放置具有真实形态的坑。
 *
 * 为什么不能用噪声等值线（原实现 `crater()` 的做法）：真实撞击坑有确定的形态学——
 * 碗形/平底、抬升的坑缘、中央峰、外侧溅射毯，以及随直径变化的形态转变。噪声等值线
 * 给不出这些，落到地面一眼就假。
 *
 * 分布用经典的主带观测律 **N(>D) ∝ D⁻²**：单位面积上直径 ≥D 的坑数与 D² 成反比。
 * 它等价于"每一档的平均间距 ∝ D"，所以这条律同时约束了坑的**数量**与**尺寸**，
 * 不是随手调的——间距比例常数取 3.2（坑心间距约为直径的 3.2 倍，互相不重叠）。
 */
class CraterField {
  constructor(seed, radiusKm, maxD, minDOverride = null) {
    this.R = radiusKm;
    this.salt = seed >>> 0;
    this.classes = [];
    // 最小档取 8m 与 R/40000 中较大者：再小的坑在顶点分辨率下只会变成噪声
    // （行走尺度的起伏由 8–50m 这几档承担——真实月面在**所有**尺度上都有坑，
    //  只到 50m 的话落到地面仍然是一片平坡）。
    // minDOverride：细尺度场要的是**绝对**下限（8m，行走尺度），不能按半径缩放——
    // 按 R/40000 算的话月球上是 43m，恰恰把行走尺度的那几档砍掉了。
    const minD = minDOverride ?? Math.max(0.008, radiusKm / 40000);
    let i = 0;
    for (let D = maxD; D > minD; D /= 2.2, i++) {
      this.classes.push({ D, cell: D * 2.6, depth: craterDepth(D), complex: D >= 15, k: i });
    }
  }

  /** dir: 体固系单位向量。返回该处的高程贡献（km）。 */
  at(dir) {
    const R = this.R;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(-dir.z, dir.x);
    const cosLat = Math.max(Math.cos(lat), 1e-3);
    let h = 0;
    // 坑场是**叠加**的（不做"新坑抹掉老坑"的迭代替换），密集区域会无界累积：
    // 实测水星有地方到 −17km，而最大单坑只有 8km。这里按最大单坑深度限幅，
    // 既保留真实的成坑起伏，又不让坑底穿到基底球以下。
    // 小天体上还要按半径设上限：火卫一半径只有 11km，一个 1.8km 深的坑就占 16%，
    // 多个叠加会把它挖穿。真实小天体的起伏相对半径确实更小。
    const maxD = Math.min(this.classes.length ? this.classes[0].depth : 0, this.R * 0.06);
    let bowl = 0, rim = 0;
    for (const c of this.classes) {
      // 该档的格网：纬度方向 cell/R 弧度，经度方向按 cosLat 展宽（近似等面积）
      const dLat = c.cell / R;
      const dLon = c.cell / (R * cosLat);
      const iLat = Math.floor(lat / dLat), iLon = Math.floor(lon / dLon);
      const seed = this.salt + c.k * 7919;
      for (let a = -1; a <= 1; a++) {
        const gi = iLat + a;
        for (let b = -1; b <= 1; b++) {
          const gj = iLon + b;
          if (ihash(gi, gj, c.k, seed) > 0.62) continue;   // 该格没有坑
          const u = ihash(gi, gj, c.k + 101, seed);
          const v = ihash(gi, gj, c.k + 202, seed);
          const rr = ihash(gi, gj, c.k + 303, seed);
          // 坑心落在格内（留出边距，避免坑心贴着格边导致剖面被切断）
          const cLat = (gi + 0.15 + u * 0.7) * dLat;
          const cLon = (gj + 0.15 + v * 0.7) * dLon;
          // 坑半径在 [0.55, 1.0]·D/2 内变化
          const cr = c.D * (0.275 + rr * 0.225);
          // 与坑心的角距 → 弧长（km）
          const dLatA = lat - cLat;
          const dLonA = lon - cLon;
          const cosD = Math.sin(lat) * Math.sin(cLat)
                     + Math.cos(lat) * Math.cos(cLat) * Math.cos(dLonA);
          const ang = Math.acos(Math.max(-1, Math.min(1, cosD)));
          const rKm = ang * R;
          if (rKm > cr * 2.4) continue;
          const contrib = c.depth * craterProfile(rKm / cr, c.complex);
          if (contrib < 0) bowl += contrib; else rim += contrib;
        }
      }
    }
    // 碗部限幅到 −1.2×最大坑深；坑缘/溅射毯限幅到 +0.6×。
    h = Math.max(-1.2 * maxD, Math.min(0.6 * maxD, bowl)) + Math.min(0.6 * maxD, rim);
    return h;
  }
}

/** 无 DEM 天体的基底球下移量。
 *
 *  盘面球不是完美球：它带着地形的**大尺度分量**（见 _lowRelief），所以下移量
 *  只需要覆盖大尺度之外的残差——中频构造（freq 30）、行走尺度细节三层、
 *  反照率高通，以及典型大小的撞击坑。
 *
 *  早先这里按"最大坑深 ×1.7"取，量级达 5–10 km：整个近场被抬在一根看不见的
 *  柱子上，地形补丁外缘要降回球面，形成一圈极显眼的台地边（审计 C-2）。
 *  现在改成典型量级，深坑由 _heightNoise 末端的钳制兜住——把个别坑底压平，
 *  比给整个近场垫一根柱子划算得多。
 *
 *  渲染（builder 的盘面网格）与地形边缘融合都用这一个函数，保证同源。 */
export function terrainReliefOffset(phys) {
  // 不可登陆的天体没有地形补丁，不需要下移（气巨/太阳走盘面材质）
  if (!phys?.landable) return 0;
  const amp = Math.min(phys.surface?.ampKm ?? 2, phys.radiusKm * 0.05);
  // 中高频残差的无量纲幅度（各项系数与 _heightNoise 一一对应）
  const mid = 0.16 + 0.05 + 0.022 + 0.009 + 0.45 * 0.12;
  // 典型撞击坑（直径 ≈ 0.1R）而非最大坑（0.45R，全身只有几个）
  const typD = craterDepth(phys.radiusKm * 0.1) * (phys.surface?.craters ?? 0);
  return amp * 0.5 * mid + Math.max(0, typD) * 1.2;
}

export class HeightField {
  constructor(bodyId, phys, mapImageData = null) {
    this.bodyId = bodyId;
    this.phys = phys;
    this.sp = phys.surface ?? { ampKm: 2, roughness: 0.5, craters: 0.5, palette: 'gray' };
    this.noise = makeNoise(hashSeed(bodyId));
    // 撞击坑场：有 craters 权重的天体才建。直径上限取半径的 45%——真实的巨型
    // 盆地确实有这么大（土卫一的 Herschel 139km = 0.7R、水星的 Caloris 1550km
    // = 0.64R），而它们的深度由上面的幂律压得很浅，不会把星球挖穿。
    // 基底球下移量：程序化地形原本整体抬高 0.62·ampKm（保证不缺进基底球），
    // 于是落点高度比基准半径高 3–6km、方块外缘还要再降回球面形成一圈"台地边"。
    // 改为：地形围绕 R 对称（±0.5·ampKm），基底球下移 0.5·ampKm 兜住低处。
    // DEM 天体不走程序化地形，偏移为 0。
    // 形变天体（火卫一等不规则小天体）的盘面网格由 height() 直接塑形
    // （builder.deformIrregular 把每个顶点半径**替换**成 height()），
    // 根本没有独立的基底球——此时既不下移、也不能把地形钳到球面上，
    // 否则会把真实的深盆地压平。边缘融合同样要跳过（见 _buildLevel）。
    // 形变 = 盘面网格由 height() 塑形。实测形状模型也算（同样没有独立基底球）
    this.deformed = !!phys.shape?.dims || hasShapeModel(bodyId);
    // 盘面网格是否由 baseSphereRadius 塑形（无 DEM 的可登陆天体）
    this.reliefSphere = !!phys.landable && !this.deformed;
    this.baseOffset = this.deformed ? 0 : terrainReliefOffset(phys);
    // 基底球的有效幅度：与 _heightNoise 的 effAmp 同源
    this.effAmp = Math.min(this.sp.ampKm ?? 2, phys.radiusKm * 0.05);
    this.craterField = (this.sp.craters ?? 0) > 0
      ? new CraterField(hashSeed(bodyId + ':crater'), phys.radiusKm, phys.radiusKm * 0.45)
      : null;
    // 细尺度坑场：DEM 只覆盖到它的源分辨率（月球 2.67km/px、火星 2.60、地球 9.77），
    // **以下就什么都没有了**——而真实地表在所有尺度上都有坑。这一层专门补 DEM
    // 分辨率之下的坑，与真实高程不打架（它只活在 DEM 看不见的那一段）。
    this.craterFine = (this.sp.craters ?? 0) > 0
      ? new CraterField(hashSeed(bodyId + ':crater-fine'), phys.radiusKm,
          { moon: 2.6, mars: 2.5, earth: 9.5 }[bodyId] ?? 2.5, 0.008)
      : null;
    this.map = mapImageData; // {data,width,height} 用于颜色与海洋掩码
    this.demSource = null;   // DEM 瓦片源（月球 LOLA / 火星 MOLA），由 setDEMSource 注入
    this._alb = null;        // 贴图亮度的高通场，见 _albedoReliefAt
  }

  /**
   * 由**贴图亮度**导出的局部起伏（高通场）。
   *
   * 为什么需要它：没有 DEM 的天体，颜色来自真实贴图、起伏来自程序噪声，两者**互不
   * 相关**——贴图上的坑、月海、山脊落在无关的随机起伏上，落到地面一眼就假。
   * 这里把亮度场的高通分量（局部亮 − 低频亮）作为局部起伏：撞击坑壁、山脊、断崖
   * 在影像上本就是亮的，凹地被阴影压暗，所以"局部亮 ≈ 局部凸起"这个对应在无气
   * 天体影像上普遍成立。
   *
   * 这不是"真实高程"——没有 DEM 就是没有。它是把**已有的可见地貌与起伏关联起来**，
   * 按现有资料合理生成，而不是凭空另起一套随机地形。
   * 场按 256×128 预计算（贴图全分辨率存两份浮点太重），只用于中低频起伏。
   */
  _buildAlbedoField() {
    const m = this.map;
    if (!m) return null;
    const W = 256, H = 128;
    const lum = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = Math.min(m.height - 1, ((y + 0.5) / H * m.height) | 0);
      for (let x = 0; x < W; x++) {
        const sx = Math.min(m.width - 1, ((x + 0.5) / W * m.width) | 0);
        const i = (sy * m.width + sx) * 4;
        lum[y * W + x] = (m.data[i] * 0.299 + m.data[i + 1] * 0.587 + m.data[i + 2] * 0.114) / 255;
      }
    }
    // 可分离盒式模糊得到低频（半径 4，环向按经度环绕，否则反经线上出现一条缝）
    const R = 4;
    const tmp = new Float32Array(W * H), low = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += lum[y * W + ((x + k + W) % W)];
        tmp[y * W + x] = s / (2 * R + 1);
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x];
        low[y * W + x] = s / (2 * R + 1);
      }
    }
    // 归一化到 ×2 标准差：让不同天体的对比度可比，免得有的天体毫无关联、有的过冲
    let mean = 0;
    for (let i = 0; i < lum.length; i++) mean += lum[i];
    mean /= lum.length;
    let varr = 0;
    for (let i = 0; i < lum.length; i++) { const d = lum[i] - mean; varr += d * d; }
    const sd = Math.max(Math.sqrt(varr / lum.length), 1e-3);
    const hi = new Float32Array(W * H);
    for (let i = 0; i < hi.length; i++) {
      hi[i] = Math.max(-1.5, Math.min(1.5, (lum[i] - low[i]) / (2 * sd)));
    }
    return { W, H, hi };
  }

  /** 该方向的贴图高通值（-1.5..1.5）；无贴图返回 0 */
  _albedoReliefAt(dir) {
    if (!this._alb) {
      this._alb = this._buildAlbedoField() ?? { none: true };
    }
    if (this._alb.none) return 0;
    const { W, H, hi } = this._alb;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(-dir.z, dir.x);
    // **双线性**而不是最近邻。场是 256×128（格距 1.4°），最近邻会把高度场
    // 变成分段常数——在固定经纬网格线上导数不连续，轨道高度看是一道道沿经纬线
    // 的直线陡坎。双线性后过渡连续。
    const fx = Math.min(W - 1.001, Math.max(0, ((lon / Math.PI + 1) * 0.5) * W - 0.5));
    const fy = Math.min(H - 1.001, Math.max(0, (0.5 - lat / Math.PI) * H - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const a = hi[y0 * W + x0], b = hi[y0 * W + x1];
    const c = hi[y1 * W + x0], d = hi[y1 * W + x1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }

  /** 注入 DEM 瓦片源：启用后 height() 优先查询真实高程，未命中时回退到程序化噪声 */
  setDEMSource(source) {
    this.demSource = source;
    // 有 DEM 的天体走真实高程，不需要基底球下移，也不做塑形
    if (source) { this.baseOffset = 0; this.reliefSphere = false; }
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
  /** 基底球（盘面网格）在该方向上的半径 = 基准半径 − 地形下探量 + 大尺度地形。
   *
   *  **为什么带大尺度地形**：盘面球如果是完美球，地形补丁的外缘就必须从几公里的
   *  起伏硬降回球面，形成一圈方正的"台地边"——这是审计 C-2 的可见症状，也是
   *  从轨道看"星球光滑得像塑料球"的原因。让盘面球自己走一遍地形的大尺度分量，
   *  外缘残差就只剩中高频（几百米），同时远场也有了真实的大陆/山脉轮廓。
   *  盘面网格的分辨率（见 builder 的 reliefSphereGeo）刚好能表达这一频段。 */
  reliefRadius(dir) {
    if (!this.reliefSphere) return this.baseRadius(dir);
    return this.baseRadius(dir) - (this.baseOffset ?? 0) + this.effAmp * 0.5 * this._lowRelief(dir);
  }

  baseSphereRadius(dir) {
    const r = this.reliefRadius(dir);
    // 盘面网格是**分片线性**的：弦比弧低一个矢高（~R·4e-4，木卫一上约 0.7km）。
    // 地形补丁外缘必须落到网格之下，否则两者之间会漏出一条能看见背面的缝。
    return this.reliefSphere ? r * (1 - 4e-4) : r;
  }

  /** 盘面网格是否由 height() 塑形（形变天体），此时没有"基底球"这一层。 */
  get hasBaseSphere() { return !this.deformed; }

  baseRadius(dir) {
    // 实测形状模型优先（PDS 的 Thomas 半径网格）：有实测就不该用椭球近似。
    // 贴图上的坑在实测形状里是真的凹下去，程序化椭球上它是平的。
    const sm = shapeRadiusKm(this.bodyId, dir);
    if (sm != null) return sm;
    const s = this.phys.shape?.dims;
    if (!s) return this.phys.radiusKm;
    const a = s[0] / 2, b = s[1] / 2, c = s[2] / 2;
    const q = (dir.x * dir.x) / (a * a) + (dir.y * dir.y) / (b * b) + (dir.z * dir.z) / (c * c);
    return 1 / Math.sqrt(Math.max(q, 1e-12));
  }

  /** 海床半径（海面之下 0.7–4 km 起伏的大陆架/深海盆，R9-2b 水下地形） */
  oceanFloor(dir) {
    const demH = this.demSource?.getHeightSync(dir);
    if (demH != null && demH < 0) return this.baseRadius(dir) + demH;
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

  /** dir: 网格本地系单位向量（+Y=北极, +X=本初子午线）。返回该方向的表面半径 km
   * 优先查询 DEM（真实高程），缓存未命中或离线时回退到程序化噪声（现有行为）。
   * 融合策略为谱融合：DEM 提供大尺度形状（低频），噪声补充亚分辨率细节（高频），
   * 两者各负责不同频段，天然无缝——近距离用高分辨率 DEM，远距离用低分辨率 DEM
   * 或纯噪声，过渡时地形重建 + uFade 淡入（#18）隐藏任何跳变。 */
  height(dir) {
    const sp = this.sp;
    // DEM 优先：已配置源且缓存命中时，使用真实高程 + 高频噪声细节。
    // 地球：DEM 高程为负 = 海底 → 返回水面（真实海陆判定，替代"偏蓝"启发式）
    if (this.demSource) {
      const demH = this.demSource.getHeightSync(dir);
      if (demH !== null) {
        if (sp.ocean && demH < 0) return this.phys.radiusKm + 0.001;
        return this._heightWithDEM(dir, demH);
      }
    }
    // 海洋处返回水面（DEM 未命中时的旧启发式回退）
    if (sp.ocean && this.isOcean(dir)) return this.phys.radiusKm + 0.001;
    // 回退：程序化噪声地形（离线/未配置/缓存未命中）
    return this._heightNoise(dir);
  }

  /** DEM + 高频噪声细节融合：DEM 提供大尺度高程，噪声补充 DEM 分辨率以下的米级起伏 */
  _heightWithDEM(dir, demH) {
    const R = this.baseRadius(dir);
    const n = this.noise;
    // Synthetic sub-resolution relief is bounded to 1.6 m, independent of the
    // body's kilometre-scale mountain amplitude. This is detail, not measured DEM.
    const detail = 0.001 * n.fbm(dir.x * 8000, dir.y * 8000, dir.z * 8000, 2)
      + 0.0006 * n.fbm(dir.x * 42000, dir.y * 42000, dir.z * 42000, 2);
    // DEM 分辨率以下的撞击坑（见 craterFine 的说明）。量级是物理的（km），单独相加。
    const fine = this.craterFine
      ? Math.max(-0.5, Math.min(0.5, this.craterFine.at(dir) * (this.sp.craters ?? 0)))
      : 0;
    return R + demH + detail + fine;
  }

  /** 地形的**大尺度分量**（无量纲，量级 ±1）。盘面球与地形补丁共用。
   *
   *  频段上限刻意压到 ~6 cycles/rad：盘面网格在 192×128 下每波长约 6 个采样点，
   *  再高就开始走样（球面上会出现摩尔纹）。更高频的部分由地形补丁负责，
   *  而地形补丁的可见范围本来就是近场——远场看不出少了那一层。 */
  _lowRelief(dir) {
    const n = this.noise;
    const mMask = sstep(-0.05, 0.5, n.fbm(dir.x * 2.7 + 31.7, dir.y * 2.7, dir.z * 2.7, 3));
    return 0.42 * n.fbm(dir.x * 1.6, dir.y * 1.6, dir.z * 1.6, 3)
      + mMask * 0.6 * this.sp.roughness * (n.ridged(dir.x * 4, dir.y * 4, dir.z * 4, 2) * 2 - 1);
  }

  /** 地形的中高频分量（无量纲）：盘面球表达不了的那一层。
   *  地形补丁外缘要收到「解析地形减去坑场」的高度，这一项就是它。 */
  _midRelief(dir) {
    const n = this.noise;
    const bodyR = this.phys.radiusKm;
    const detailScale = Math.min(1, bodyR / 400);
    let h = 0.16 * n.fbm(dir.x * 30, dir.y * 30, dir.z * 30, 4);
    h += 0.05 * detailScale * n.fbm(dir.x * 900, dir.y * 900, dir.z * 900, 3);
    h += 0.022 * detailScale * n.fbm(dir.x * 8000, dir.y * 8000, dir.z * 8000, 2);
    h += 0.009 * detailScale * n.fbm(dir.x * 42000, dir.y * 42000, dir.z * 42000, 2);
    h += 0.45 * this._albedoReliefAt(dir);
    return h;
  }

  /** 纯程序化噪声地形（现有行为，DEM 不可用时回退到此） */
  _heightNoise(dir) {
    const R = this.baseRadius(dir);
    const sp = this.sp;
    const n = this.noise;
    let hCrater = 0;   // 撞击坑贡献（km，物理量级）
    // 大尺度构造（高原/盆地/山脉链）——与盘面球共用，见 _lowRelief
    let h = this._lowRelief(dir);
    // 中高频构造（freq-30 构造 + 行走尺度细节三层 + 反照率高通）
    h += this._midRelief(dir);
    // 撞击坑：由 CraterField 按尺寸-频率分布给出**真实形态**的高程（km），
    // 不再用噪声等值线。它的量级是物理的（深度由直径决定），所以不乘 ampKm；
    // 只按 craters 权重缩放，并给一个"总起伏不超过半径 8%"的安全上限。
    if (this.craterField) {
      const cap = this.phys.radiusKm * 0.08;
      hCrater = Math.max(-cap, Math.min(cap, this.craterField.at(dir) * sp.craters));
    }
    // 安全上限：噪声幅度不超过天体平均半径的 5%，防止小天体（Phobos 等）山脉过高
    const effAmp = this.effAmp;
    // 围绕 R **对称**（±0.5·effAmp）：基底球由 baseOffset 下移兜住低处。
    let hh = R + effAmp * h * 0.5 + hCrater;
    // 非形变天体：盘面球是可见表面，低于它的地形会被挡住 → 钳到球面。
    // 这一步让 baseOffset 的估算不必是严格上界：估小了只是压平个别坑底。
    if (!this.deformed) hh = Math.max(this.baseSphereRadius(dir), hh);
    return hh;
  }

  isOcean(dir) {
    const demH = this.demSource?.getHeightSync(dir);
    if (demH != null) return demH < 0;
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
    // 海面：与盘面海洋同源——走同一份贴图分级链（grade/sat）并施加
    // planetMaterial 里同款的"开阔大洋压暗蓝移"掩码（uBodyId==3）。
    // 旧实现是硬编码的线性深海色，与盘面海洋色不一致：地形瓦片海面与瓦片外
    // 盘面海洋在太空/高空形成硬边色块（地球 400km 是一块方片、20–100km 是
    // 地平线深蓝带）。不含细节噪声调制（贴图海洋分辨率低，逐像素调制出大理石纹）。
    if (this.sp.ocean && this.isOcean(dir)) {
      const m = this.sampleMap(dir);
      if (m) {
        const tg = TERRAIN_GRADE[this.bodyId];
        const gr = tg?.grade ?? [1, 1, 1];
        let r = srgbToLinear(m[0] / 255) * gr[0];
        let g = srgbToLinear(m[1] / 255) * gr[1];
        let b = srgbToLinear(m[2] / 255) * gr[2];
        const ts = tg?.sat ?? 1;
        if (ts !== 1) {
          const lum = (r + g + b) / 3;
          r = lum + (r - lum) * ts; g = lum + (g - lum) * ts; b = lum + (b - lum) * ts;
        }
        if (this.bodyId === 'earth') {
          const om = Math.min(1, Math.max(0, (b - Math.max(r, g * 0.9)) * 6));
          const k = om * 0.8;
          r *= 1 - 0.48 * k; g *= 1 - 0.40 * k; b *= 1 - 0.14 * k;
        }
        out.setRGB(
          Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))
        );
        return out;
      }
      // 无贴图回退：原硬编码深海蓝（避免浅蓝 × 细节噪声产生大理石纹）
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
      // 与行星材质同源的逐天体反照率分级（水星地表白水泥地修复：贴图 0.5 灰 × 分级 0.40）
      const tg = TERRAIN_GRADE[this.bodyId];
      const gr = tg?.grade ?? [1, 1, 1];
      r = srgbToLinear(m[0] / 255) * gr[0];
      g = srgbToLinear(m[1] / 255) * gr[1];
      b = srgbToLinear(m[2] / 255) * gr[2];
      // 同款饱和度补偿（ACES 去饱和）：地球陆地否则发灰（盘面有 uSat，地形没有）
      const ts = tg?.sat ?? 1;
      if (ts !== 1) {
        const lum = (r + g + b) / 3;
        r = lum + (r - lum) * ts; g = lum + (g - lum) * ts; b = lum + (b - lum) * ts;
      }
      // 有真实贴图时不叠调色板：调色板是给无贴图天体补色的，叠上去会让地形反照率
      // 偏离盘面同色处，两者在高空/太空的交界形成可见接缝
    } else {
      r = pal[0][0] + (pal[1][0] - pal[0][0]) * t;
      g = pal[0][1] + (pal[1][1] - pal[0][1]) * t;
      b = pal[0][2] + (pal[1][2] - pal[0][2]) * t;
    }
    // 以下程序化色调项只用于"无真实贴图"的天体（补色/补变化）。
    // 有贴图时反照率必须与盘面完全同源：盘面材质只做 map×grade×sat(+深海掩码)，
    // 若地形再叠 hue/rock/shade/frost，同一处地表在高空与盘面同色区会差 20%±
    // （火星 200km 实测 mean|Δ|=18/255），地形瓦片边界因此显形。真实地貌变化
    // 由贴图本身承载，立体感由 DEM 几何 + 真实光照提供。
    if (!m) {
      // 大尺度地块色调变化（地质单元差异，SpaceEngine 式地貌分区观感）
      const hue = n.fbm(dir.x * 12 + 7.3, dir.y * 12, dir.z * 12, 3);
      r *= 1 + hue * 0.07;
      b *= 1 - hue * 0.06;
      g *= 1 + hue * 0.02;
      // 陡坡 → 裸岩（更暗、去饱和）
      const rock = sstep(0.3, 0.62, slope);
      const lum2 = (r + g + b) / 3;
      r = r * (1 - rock) + (lum2 * 0.5 + r * 0.12) * rock;
      g = g * (1 - rock) + (lum2 * 0.5 + g * 0.12) * rock;
      b = b * (1 - rock) + (lum2 * 0.52 + b * 0.12) * rock;
      // 极冠霜冻：高纬度向 ±y 极点过渡区白化（仅对有 FROST_PALETTES 定义的星体生效）
      const frost = FROST_PALETTES[this.sp.palette];
      if (frost) {
        const polar = sstep(0.76, 0.90, Math.abs(dir.y));
        if (polar > 0) {
          r = r * (1 - polar) + frost[0] * polar;
          g = g * (1 - polar) + frost[1] * polar;
          b = b * (1 - polar) + frost[2] * polar;
        }
      }
    }
    // 高度调制（无贴图时的地貌明暗梯度）
    const shade = m ? 1 : 0.85 + 0.3 * ((hKm - this.phys.radiusKm) / Math.max(this.sp.ampKm, 0.01) - 0.5);
    out.setRGB(
      Math.min(1, Math.max(0, r * shade)),
      Math.min(1, Math.max(0, g * shade)),
      Math.min(1, Math.max(0, b * shade))
    );
    return out;
  }
}


/** 地形材质（每 LOD 级一份）：StandardMaterial + 片元级三尺度细节噪声注入（近看不糊）。
 * uFade: 0→1 淡入 uniform，LOD 级重建时从 0 淡起，800ms 后归 1（避免突然弹出感）。
 * vSlope: 顶点坡度属性，驱动粗糙度 PBR（陡岩面更粗糙，水面最光滑）。
 * radiusKm: 用于缩放高频细节/凹凸幅度，避免小天体（Phobos 等）表面出现尖锐片元噪声。
 * 岸边泡沫：land/water 过渡区（vWater∈(0,1)）叠加动态白沫噪声。
 * 水面波纹：三向行进波叠加（SpaceEngine 式海面）。 */
export function makeTerrainMaterial(uPatchRel, uTime, uFade, polyUnits, radiusKm = 6371, uWaterFade = null, uSunDir = null, uUnderwater = null) {
  const detailScale = Math.min(1, radiusKm / 400); // 与 HeightField.height() 一致
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, fog: true,
    side: THREE.DoubleSide, // 水下仰望可见海面（R9-2b）
    transparent: true, depthWrite: true, // 支持 uFade 淡入（#18）
    // 见 rings.js 同名注释：three 默认把 transparent+DoubleSide 渲染两遍。
    // 地形是全场景最重的片元着色器（多次 tnoise2 + 解析梯度），被光栅化两遍
    // 既浪费一半算力，又让淡入期的 alpha 变成 a(2-a)、readyCover 判据随之失真。
    forceSinglePass: true,
    polygonOffset: polyUnits > 0, polygonOffsetFactor: polyUnits > 0 ? 2 : 0,
    polygonOffsetUnits: polyUnits, // 粗级后推，消除 LOD 环带重叠区 z-fight（R9-2a）
  });
  const uDetailScale = { value: detailScale };
  mat.defines = { SW_LOW: QUALITY.detail ? 0 : 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPatchRel = uPatchRel;
    shader.uniforms.uTime = uTime;
    shader.uniforms.uFade = uFade;
    shader.uniforms.uDetailScale = uDetailScale;
    if (uWaterFade) shader.uniforms.uWaterFade = uWaterFade;
    if (uUnderwater) shader.uniforms.uUnderwater = uUnderwater;
    shader.uniforms.uSunDir = uSunDir ?? { value: new THREE.Vector3(1, 0, 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uPatchRel;
        attribute float water;
        attribute float slope;
        varying float vWater;
        varying float vSlope;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = position + uPatchRel;
        vWater = water;
        vSlope = slope;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vObjPos;
        varying float vWater;
        varying float vSlope;
        uniform float uTime;
        uniform float uFade;
        uniform float uDetailScale;
        uniform vec3 uSunDir;        // 体固系下的太阳方向（水面环境反射用）
        uniform float uWaterFade;
        // 相机是否在水面之下。**不能靠 dot(V, normal) 判断**：three 对背面会把
        // normal 翻向观察者（DOUBLE_SIDED），从水下抬头看水面时法线被翻成朝下，
        // 点积恒为正，"从下方看"的分支永远进不去（斯涅尔窗因此完全不出现）。
        uniform float uUnderwater;
        uniform mat3 normalMatrix;
        ${HASH_GLSL}
        float thash(vec3 p) { return glslHash31(p); }
        float tnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(thash(i), thash(i + vec3(1,0,0)), f.x), mix(thash(i + vec3(0,1,0)), thash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(thash(i + vec3(0,0,1)), thash(i + vec3(1,0,1)), f.x), mix(thash(i + vec3(0,1,1)), thash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }
        // 双八度去网格化：单八度值噪声的等值线呈轴对齐圆角方块（地表"迷宫/砖块"假象），
        // 叠加一个坐标循环置换（zxy ≈ 绕(1,1,1)旋转120°）的倍频八度打破格点排列。
        float tnoise2(vec3 p) {
          #if SW_LOW
          return tnoise(p);
          #else
          return tnoise(p) * 0.667 + tnoise(p.zxy * 2.13 + vec3(17.31, 9.17, 5.23)) * 0.333;
          #endif
        }
        // Analytic object-space gradient avoids screen-derivative discontinuities
        // along triangle boundaries and remains stable during camera movement.
        vec3 tnoiseGrad(vec3 p) {
          vec3 i = floor(p), f = fract(p), df = 6.0 * f * (1.0 - f);
          f = f * f * (3.0 - 2.0 * f);
          float a=thash(i), b=thash(i+vec3(1,0,0)), c=thash(i+vec3(0,1,0)), d=thash(i+vec3(1,1,0));
          float e=thash(i+vec3(0,0,1)), h=thash(i+vec3(1,0,1)), j=thash(i+vec3(0,1,1)), k=thash(i+vec3(1,1,1));
          return df * vec3(mix(mix(b-a,d-c,f.y),mix(h-e,k-j,f.y),f.z),
            mix(mix(c-a,d-b,f.x),mix(j-e,k-h,f.x),f.z),
            mix(mix(e-a,h-b,f.x),mix(j-c,k-d,f.x),f.y));
        }
        vec3 tnoise2Grad(vec3 p) {
          #if SW_LOW
          return tnoiseGrad(p);
          #else
          vec3 q=tnoiseGrad(p.zxy*2.13+vec3(17.31,9.17,5.23));
          return tnoiseGrad(p)*0.667+q.yzx*(2.13*0.333);
          #endif
        }
        `)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          // 多尺度表土细节：~29m / ~11m / ~2.4m / ~19cm / ~4cm。
          //
          // vObjPos 已经是**相机相对坐标**（uPatchRel 里减掉了 noiseOriginU，而它每 2km
          // 跟随玩家重新吸附），所以 |vObjPos| 是"离相机的距离"量级、不是天体半径量级，
          // fp32 精度充裕。下面那段"哈希自变量失效"的历史注释描述的现象是真的，但归因
          // 是错的：实测把权重压到坐标安全的 ×35/×90 并没有解决问题，落地仍是一块平板。
          //
          // 真正的限制是**足迹抗混叠**，而且原来有两道重复的闸门：距离淡出（f2/f3/f4）
          // 与足迹门限（aa*）在差不多的距离上各自衰减同一种东西，距离淡出还更早一步
          // （20cm 档 f3 在 90m 归零，而它的足迹门限要到 180m 才归零）。两道叠在一起把
          // 近景压没了：实测落地平视的纹理能量只有 0.09–0.29，而同一套指标下轨道视角
          // 是 1.8。现改为**只按足迹**衰减——这是物理上正确的那一种（Nyquist：一个噪声格
          // 至少覆盖两个像素才可分辨），距离淡出整条删掉。
          //
          // 门限从 (0.35, 0.9) 放宽到 (0.7, 1.6) 格/像素：原阈值在 0.35 格就开始衰减，
          // 过于保守。分带实测（tools/audit-bands.mjs，火星落地平视）：
          //   近景带 0.357 → 0.699（+96%）、中景带 0.250 → 0.424（+70%）、
          //   而**近地平线带 0.053 → 0.053（完全不变）**。
          // 地平线带不变是关键——那里足迹最大、最容易混叠；把门限全部打开会得到 0.29
          // （闪烁），说明多出来的部分是**可分辨的真细节**而不是混叠。
          float fp = length(fwidth(vObjPos));
          float aa1 = 1.0 - smoothstep(0.7, 1.6, fp * 35.0);
          float aa2 = 1.0 - smoothstep(0.7, 1.6, fp * 420.0);
          float aa3 = 1.0 - smoothstep(0.7, 1.6, fp * 5200.0);
          // d1（28m 尺度）此前没有足迹钳制：轨道高度下 28m 细节远低于一个像素，
          // 混叠成随机噪声，使地形与盘面同色区差 ~11/255（火星 200km 实测），
          // 瓦片边界因此显形。按与 aa2/aa3 相同的足迹准则钳制，亮度用均值补偿。
          float g1 = aa1;
          float g2 = aa2, g3 = aa3;
          // 4cm 表土颗粒（风化层米粒感）：真实月壤/火星尘土在脚下呈现毫米-厘米级
          // 团聚颗粒，单噪声亮度调制缺少这层"砂砾"质感。按足迹它自然只活在 ~7m 内。
          float aa4 = 1.0 - smoothstep(0.7, 1.6, fp * 26000.0);
          float g4 = aa4 * uDetailScale;
          float d1 = tnoise2(vObjPos * 35.0) * g1;
          float d2 = tnoise2(vObjPos * 420.0) * g2 * uDetailScale;
          #if SW_LOW
          float d3 = 0.5 * g3 * uDetailScale;
          float d4 = 0.5 * g4;
          #else
          float d3 = g3 > 0.01 ? tnoise2(vObjPos * 5200.0) * g3 * uDetailScale : 0.0;
          float d4 = g4 > 0.01 ? tnoise(vObjPos * 26000.0) * g4 : 0.0;
          #endif
          // ── 中尺度补一档：×90（约 11 m）────────────────────────────────
          // 11m 这一档在视觉上承上启下：28m 太粗、2.4m 一远就被足迹门限吃掉，
          // 中间空一段会让地面在几十米处显得"糊成一片"。补一档把这段填上。
          float d1b = tnoise2(vObjPos * 90.0 + vec3(7.3, 2.1, 5.7)) * g1;
          // 显式增益：值噪声的方差很小（单八度 σ≈0.12，两八度混合后仍 ≈0.12），
          // 直接把加权和当亮度用只有 ±7% 的起伏——实测近地亮度只跨 8 级，
          // 看上去就是"一片干净的平板"。这里改成围绕均值做带增益的调制，
          // 限幅在 [0.62, 1.38]，既有明显的地面质感又不会出现死黑/过曝的斑块。
          float nsum = d1 * 0.30 + d1b * 0.24 + d2 * 0.24 + d3 * 0.15 + d4 * 0.07;
          float dm = clamp(1.0 + 2.2 * (nsum - 0.5), 0.62, 1.38)
                   + (1.0 - g1) * 0.21
                   + (1.0 - g2) * 0.075 + (1.0 - g3) * 0.05 + (1.0 - g4) * 0.02;
          // 细微色偏：真实表土不是单一色。矿物、冰、尘的混合在**米级尺度**上就有
          // 冷暖深浅的差异，而贴图在这个尺度上只有一两个像素（整片区域一个色），
          // 所以落地后地面看着像一块色卡。这里用同一套噪声做一次轻微的色彩调制：
          // 一档噪声在"冷调/暖调"两极之间插值，成本只多一次采样。
          // 幅度刻意压得很小（±6%），是"同一种土的不同地方"，不是另换一种材质。
          float c1 = tnoise2(vObjPos * 90.0 + vec3(3.1, 9.4, 1.7)) * g1;
          vec3 tintVar = mix(vec3(1.06, 1.00, 0.94), vec3(0.94, 0.99, 1.05), c1);
          // 第二档更细（约 2 m），只在近处生效，避免行走时地面像同一张贴图在平移
          float c2 = tnoise2(vObjPos * 420.0 + vec3(21.7, 4.9, 13.3)) * g2 * uDetailScale;
          tintVar *= mix(vec3(0.97), vec3(1.03, 1.0, 0.97), c2);
          diffuseColor.rgb *= mix(dm, 1.0, vWater) * tintVar;
          // 岸边泡沫：land→water 过渡区（vWater 0..1 内插）叠加白色浪沫（#21）
          float foam = smoothstep(0.05, 0.38, vWater) * (1.0 - smoothstep(0.62, 0.95, vWater));
          if (foam > 0.01) {
            float fw = tnoise(vObjPos * 1500.0 + vec3(uTime * 0.15, -uTime * 0.08, 0.0));
            fw *= fw;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.96), foam * fw * 0.72);
          }
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        // 坡度驱动 PBR 粗糙度：平坦=0.82，陡岩=1.0，水面=0.12（#21）
        roughnessFactor = mix(0.82 + clamp(vSlope, 0.0, 1.0) * 0.18, 0.12, vWater);`)
      .replace('#include <normal_fragment_begin>', /* glsl */ `#include <normal_fragment_begin>
        {
          float vd = length(vViewPosition), fp = length(fwidth(vObjPos));
          float fade = 1.0 - smoothstep(0.1, 1.2, vd);
          float aa2 = 1.0 - smoothstep(0.35, 0.9, fp * 420.0);
          vec3 grad = tnoise2Grad(vObjPos * 420.0) * (420.0 * 0.00015 * aa2 * fade * uDetailScale);
          #if !SW_LOW
          float aa3 = 1.0 - smoothstep(0.35, 0.9, fp * 5200.0);
          if (aa3 > 0.01) grad += tnoise2Grad(vObjPos * 5200.0) * (5200.0 * 0.00002 * aa3 * fade * uDetailScale);
          #endif
          if (vWater > 0.001) {
            // 海面波纹的足迹门限。原先 (0.25, 0.65) 在**水面**上过于保守：
            // 站在水面时眼高只有 ~0.3m，掠射角让足迹迅速超过波格，于是连
            // 十几米外的水面都只剩一块平色。放宽到 (0.7, 1.6)（与表土细节同一
            // 标定），近场波纹因此可见。
            float w1 = 1.0 - smoothstep(0.7, 1.6, fp * 820.0);
            float w2 = 1.0 - smoothstep(0.7, 1.6, fp * 2800.0);
            float w3 = 1.0 - smoothstep(0.7, 1.6, fp * 7200.0);
            vec3 waterGrad = tnoiseGrad(vObjPos * 820.0 + vec3(uTime * 0.07, 0.0, uTime * 0.05)) * (820.0 * 0.50 * w1);
            if (w2 > 0.01) waterGrad += tnoiseGrad(vObjPos * 2800.0 - vec3(uTime * 0.12, uTime * 0.04, 0.0)) * (2800.0 * 0.35 * w2);
            if (w3 > 0.01) waterGrad += tnoiseGrad(vObjPos * 7200.0 + vec3(uTime * 0.19, -uTime * 0.09, uTime * 0.11)) * (7200.0 * 0.15 * w3);
            // 振幅：0.00025 时波峰坡度只有 ~0.15，掠射下几乎看不出起伏；
            // 0.0012 对应约 0.7 的坡度（≈35°），才像有风的海面。
            // 距离延到 30km 淡出——真实海面的波纹到地平线都还在（只是趋于平坦）。
            grad = mix(grad, waterGrad * 0.0012 * (1.0 - smoothstep(0.3, 30.0, vd)), vWater);
          }
          vec3 gradView = normalMatrix * grad;
          normal = normalize(normal - gradView + normal * dot(normal, gradView));
        }`)
      .replace('#include <colorspace_fragment>',
        `#include <colorspace_fragment>
        // LOD 级淡入（#18）+ 高空海面淡出：地形海面用 PBR（roughness 0.12）在
        // 掠射角产生菲涅尔白翳，而盘面海洋是紧凑耀斑模型——高空俯视同一片海
        // 两者亮度/饱和度不同，地形瓦片边界会显出一块方片。海面在 0.6→2.5km
        // 高度间淡出，交回盘面海洋；陆地不受影响（vWater=0）。
        gl_FragColor.a *= uFade * mix(1.0, uWaterFade, vWater);`) // LOD 级淡入（#18）
      .replace('#include <opaque_fragment>',
        `// === 水面：菲涅尔环境反射 + 逆光暖色 ===
        // 水若没有任何可反射的环境，PBR 只会给出"哑光蓝"；真实海面在掠射角
        // 近乎镜面（Schlick 菲涅尔，水的 F0 = 0.02），远处海面因此反射天空而
        // 发白，近处仍透出水的本色——这个随视角的剧烈变化是"像不像水"的关键。
        if (vWater > 0.001) {
          vec3 V = normalize(vViewPosition);          // 片元 → 相机
          float ndv = dot(V, normal);
          float cosT = clamp(ndv, 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec3 refl = reflect(-V, normal);
          // 解析天空：天顶深蓝 → 地平灰白（同一个 Rayleigh 直觉，不必像大气步进那样精确）
          float upR = clamp(dot(refl, normal), 0.0, 1.0);
          vec3 skyCol = mix(vec3(0.72, 0.82, 0.92), vec3(0.16, 0.36, 0.80), pow(upR, 0.55));
          // 太阳低垂时，反射方向朝向太阳的那片海面发橙红（日落海面）
          float sunUp = dot(uSunDir, normal);
          float lowSun = 1.0 - clamp(sunUp * 1.6, 0.0, 1.0);
          skyCol = mix(skyCol, vec3(1.0, 0.55, 0.30),
                       pow(clamp(dot(refl, uSunDir), 0.0, 1.0), 3.0) * lowSun * 0.85);
          float wmask = smoothstep(0.0, 0.35, vWater) * uWaterFade;
          if (uUnderwater < 0.5) {
            // 相机在水面之上：菲涅尔反射天空
            outgoingLight += skyCol * fres * wmask;
          } else {
            // === 相机在水面之下：斯涅尔窗 + 全内反射 ===
            // 水的折射率 1.333 → 临界角 48.6°（cos = 0.661）。锥**内**看到的是
            // 折射后的天空——整个上半球被压进这个 97° 的锥里，所以窗内几乎是
            // 均匀亮的天光，边缘还因压缩而更亮；锥**外**发生全内反射，看到的是
            // 水下的倒影，而水下没有可反射的亮源，所以锥外是暗的。
            // 没有这一项时，水下抬头是一片均匀发亮的镜面；而"亮锥 + 锥外暗镜面"
            // 恰恰是真实水下最标志性的视觉特征（也是判断"这是水下"最快的线索）。
            // 用 |ndv|：这里的 normal 已被 three 翻向观察者，符号不可依赖。
            float ca = clamp(abs(ndv), 0.0, 1.0);
            float win = smoothstep(0.58, 0.70, ca);
            vec3 through = mix(vec3(0.55, 0.75, 0.90), skyCol, 0.65);
            // 窗边缘的亮环（掠射时路径压缩，真实照片里很明显）
            through *= 1.0 + 0.7 * smoothstep(0.70, 0.62, ca) * step(0.58, ca);
            // 锥外：全内反射的倒影。用该处水体的暗色近似。
            vec3 below = mix(vec3(0.010, 0.030, 0.045), through, win);
            // 窗内的焦散：真实水面的折射把阳光聚成网状亮斑（波浪法线已在 normal 里）
            float caus = tnoise2(vObjPos * 260.0 + vec3(uTime * 0.12, 0.0, uTime * 0.07));
            below += through * win * pow(caus, 3.0) * 0.6;
            outgoingLight = mix(outgoingLight, below, wmask);
          }
        }
        #include <opaque_fragment>`);
  };
  return mat;
}

/** 世界锚定确定性岩石散布：以体固系空间网格哈希决定每块岩石，重建不漂移。
 * 真实感要点（地表审查）：
 * - 实例色采样本地地表反照率（火星红地上不再是灰石头），亮度随机变化模拟风化差异
 * - 尺寸分布偏向小砾石（幂律：真实地表碎石以小砾为主，巨砾稀少）
 * - 散布半径边缘按距离渐缩至 0（旧版硬边界：行走时岩石在 330m 处整批跳入/跳出）
 * - 半埋更深（0.15×尺寸）：风化层中的岩石本就部分掩埋，消除"漂浮感"
 * - 重建节奏与最内级地形解耦（60m 或 DEM 更新才重建）：旧版每 7.5m 随内级重建，
 *   DEM 瓦片异步到达时高度变化使岩石整批垂直跳动（"石头跳"根因之一） */
class RockField {
  constructor(field) {
    this.field = field;
    const sp = field.sp;
    this.density = sp.craters > 0.8 ? 0.42 : sp.palette === 'ice' ? 0.16 : 0.3;
    if (sp.ocean) this.density = 0.12;
    this.CELL = 0.018;  // 18 m 格（加密，小砾石需要更高空间频率）
    this.RANGE = 0.34;  // 340 m 散布半径
    const N = Math.floor(this.RANGE / this.CELL);
    this.MAX = Math.min(QUALITY.rockCount, Math.ceil((2 * N + 1) * (2 * N + 1) * this.density * 1.1));
    // 岩石网格：detail 2 二十面体确定性变形（detail 1 棱角感太强，
    // 近看是"低多边形游戏道具"而非风化岩石）
    const raw = new THREE.IcosahedronGeometry(1, QUALITY.detail ? 4 : 2);
    // PolyhedronGeometry is non-indexed. Weld before calculating normals;
    // otherwise every triangle has its own normal and rocks look faceted.
    raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
    const geo = mergeVertices(raw); raw.dispose();
    const n = makeNoise(hashSeed(field.bodyId + ':rock'));
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = 1 + 0.42 * n.fbm(v.x * 1.7, v.y * 1.7, v.z * 1.7, 3)
              + 0.14 * n.fbm(v.x * 5.1, v.y * 5.1, v.z * 5.1, 2);
      pos.setXYZ(i, v.x * k, v.y * k * 0.72, v.z * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // 实例色承载反照率（setColorAt）
      roughness: 0.93, metalness: 0, fog: true,
    });
    // 岩石表面细节：几何是"变形二十面体 + 三档 fbm"，近距离看仍是光滑的团块。
    // 真实月壤/火星砾石表面有坑洼、棱角与颗粒。这里在片元里按**对象空间**位置
    // 加一层法线扰动（对象空间稳定，实例旋转/缩放不会让纹理滑动）。
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
          varying vec3 vRockPos;
          uniform mat3 normalMatrix;   // three 只在顶点着色器里声明它
          ${HASH_GLSL}
          float rhash(vec3 p){ return glslHash31(p); }
          float rnoise(vec3 p){
            vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(mix(rhash(i),rhash(i+vec3(1,0,0)),f.x),mix(rhash(i+vec3(0,1,0)),rhash(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(rhash(i+vec3(0,0,1)),rhash(i+vec3(1,0,1)),f.x),mix(rhash(i+vec3(0,1,1)),rhash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          vec3 rgrad(vec3 p){
            vec3 i = floor(p), f = fract(p), df = 6.0*f*(1.0-f); f = f*f*(3.0-2.0*f);
            float a=rhash(i), b=rhash(i+vec3(1,0,0)), c=rhash(i+vec3(0,1,0)), d=rhash(i+vec3(1,1,0));
            float e=rhash(i+vec3(0,0,1)), h=rhash(i+vec3(1,0,1)), j=rhash(i+vec3(0,1,1)), k=rhash(i+vec3(1,1,1));
            return df * vec3(mix(mix(b-a,d-c,f.y),mix(h-e,k-j,f.y),f.z),
                             mix(mix(c-a,d-b,f.x),mix(j-e,k-h,f.x),f.z),
                             mix(mix(e-a,h-b,f.x),mix(j-c,k-d,f.x),f.y));
          }`)
        .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
          {
            // 三档：粗棱角（~30cm 等效）、中颗粒、细砂。对象空间单位是 km。
            vec3 g = rgrad(vRockPos * 900.0) * 0.0014
                   + rgrad(vRockPos * 3200.0) * 0.0005
                   + rgrad(vRockPos * 9000.0) * 0.00022;
            normal = normalize(normal + (normalMatrix * g));
          }`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAX);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;    // 近场太阳阴影（builder 阴影装置）
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this._anchor = null; // 上次重建锚点（重建节奏控制）
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /** 简易确定性哈希（整数格 → [0,1)） */
  static hash(ix, iy, iz, salt) {
    let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + salt * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** origin: 最细级地形原点（实例坐标存原点相对值，与地形同源消 fp32 量化闪烁，R9-2a）。
   * force: DEM 新瓦片到达时强制重建（高程变化，岩石须随之落地）；
   * 否则锚点移动 <60m 时跳过（岩石集合不变，避免无效重排） */
  rebuild(anchorDir, origin, force = false) {
    const R = this.field.phys.radiusKm;
    if (!force && this._anchor && this._anchor.distanceTo(anchorDir) * R < 0.06) return;
    this._anchor = (this._anchor ?? new THREE.Vector3()).copy(anchorDir);
    const CELL = this.CELL, RANGE = this.RANGE;
    this.mesh.position.copy(origin);
    const u = anchorDir.clone().normalize();
    const lat0 = Math.asin(u.y), lon0 = Math.atan2(-u.z, u.x);
    const latStep = CELL / R, latIndex = Math.floor(lat0 / latStep);
    const N = Math.ceil(RANGE / CELL), candidates = [];
    const dir = new THREE.Vector3();
    // Fixed latitude rows and fixed rings: candidate positions do not depend on
    // the camera anchor. Moving/rebuilding changes visibility, not rock locations.
    for (let row = latIndex - N; row <= latIndex + N; row++) {
      const lat = (row + 0.5) * latStep;
      if (Math.abs(lat) >= Math.PI / 2) continue;
      const rings = Math.max(1, Math.round(2 * Math.PI * R * Math.cos(lat) / CELL));
      const step = 2 * Math.PI / rings, center = Math.floor((lon0 + Math.PI) / step);
      for (let offset = -Math.min(N, Math.floor(rings / 2)); offset <= Math.min(N, Math.floor(rings / 2)); offset++) {
        const cell = ((center + offset) % rings + rings) % rings;
        if (RockField.hash(cell, row, 0, 1) > this.density) continue;
        const r1 = RockField.hash(cell, row, 0, 2), r2 = RockField.hash(cell, row, 0, 3);
        const r3 = RockField.hash(cell, row, 0, 4), r4 = RockField.hash(cell, row, 0, 5);
        const lon = (cell + 0.5 + (r1 - 0.5) * 0.7) * step - Math.PI;
        const jitterLat = lat + (r2 - 0.5) * latStep * 0.7;
        dir.set(Math.cos(jitterLat) * Math.cos(lon), Math.sin(jitterLat), -Math.cos(jitterLat) * Math.sin(lon));
        const distance = dir.distanceTo(u) * R;
        if (distance >= RANGE || (this.field.sp.ocean && this.field.isOcean(dir))) continue;
        candidates.push({ dir: dir.clone(), distance, r1, r2, r3, r4 });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    let count = 0;
    const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion();
    for (const candidate of candidates.slice(0, this.MAX)) {
        const { distance: dAnchor, r1, r2, r3, r4 } = candidate;
        dir.copy(candidate.dir);
        const edge = 1 - sstep(RANGE * 0.74, RANGE * 0.97, dAnchor);
        if (edge <= 0.01) continue;
        const h = this.field.height(dir);
        // 幂律尺寸：0.12m 砾石为主，~2.8m 巨砾稀少（r1³ 压缩大端）
        const scale = (0.00012 + r1 * r1 * r1 * 0.0026) * edge;
        this._p.copy(dir).multiplyScalar(h + scale * 0.15).sub(origin);
        this._q.setFromUnitVectors(up, dir).multiply(yaw.setFromAxisAngle(up, r2 * Math.PI * 2));
        this._s.set(scale * (0.7 + r3 * 0.7), scale, scale * (0.7 + r2 * 0.7));
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(count, this._m);
        // 实例色 = 本地地表反照率 × 风化亮度差异（0.62–1.02）：
        // 岩石就地取材（原位风化/撞击溅射），颜色应与脚下地表同源
        this.field.color(dir, h, 0.35, this._c);
        const v = 0.62 + r4 * 0.4;
        this.mesh.setColorAt(count, this._c.multiplyScalar(v));
        count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

/** 环形 LOD 地形（挂在天体网格之下，本地坐标系） */
export class TerrainPatchSet {
  constructor(field) {
    this.field = field;
    this.grid = QUALITY.terrainGrid; // 画质分档（R7 #8）
    const GRID = this.grid;
    const R = field.phys.radiusKm;
    // 各级半边长（km）：最内 0.012km → 格距 ~0.4m（脚掌尺度，行走时地面与碰撞
    // 高度场偏差 <2cm）；次内 0.03km 覆盖中景过渡（R9-2a 行走尺度再加密）
    // 最外两级（600/1500km 半边长）是为了覆盖**视地平**：300km 高度上地平线在
    // ~1000km 外，只到 280km 时地形方块边缘会明晃晃地浮在光滑基底球上。
    // 最外级的边缘高度会被平滑收回基准球（见 _buildLevel），交界因此无缝。
    this.extents = [0.012, 0.03, 0.12, 0.5, 2.5, 12, 60, 280, 600, 1500]
      .filter((e) => e < R * 0.7);
    if (this.extents.length === 0) this.extents = [R * 0.3];
    this.group = new THREE.Group();
    this.levels = [];
    this.anchorDir = new THREE.Vector3(0, 1, 0);
    this.uTime = { value: 0 };
    this.uSunDir = { value: new THREE.Vector3(1, 0, 0) };   // 体固系太阳方向
    // 海面高空淡出（0=隐去地形海面，交回盘面海洋材质；陆地不受影响）
    this.uWaterFade = { value: 1 };
    this.uUnderwater = { value: 0 };
    // 噪声原点：跟随玩家、每 2km 重新吸附（保证片元噪声参数始终小数精度充足）
    this.noiseOriginU = { value: new THREE.Vector3(1e9, 0, 0) };
    this._initialized = false; // 首次激活后标记：指导首帧由外向内构建各级
    this.demDirty = false;     // DEM 新瓦片到达标记：驱动最内级重建拾取真实高程
    for (let li = 0; li < this.extents.length; li++) {
      const geo = new THREE.BufferGeometry();
      const verts = (GRID + 1) * (GRID + 1);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('water', new THREE.BufferAttribute(new Float32Array(verts), 1));
      geo.setAttribute('slope', new THREE.BufferAttribute(new Float32Array(verts), 1)); // 坡度 PBR
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
      const uFade = { value: 0 }; // 新建级从 0 淡入，避免 LOD 突然弹出（#18）
      // 粗级后推量：原值 li*2 在重叠区仍有 z-fight——表现为沿环带边界的一条
      // **虚线状的暗点行**（月面地面图可见）。加密到 li*6 + 系数 2。
      const mat = makeTerrainMaterial(uPatchRel, this.uTime, uFade, li * 6, R, this.uWaterFade, this.uSunDir, this.uUnderwater);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true; // 近场太阳阴影（岩石/地形自我投影）
      mesh.castShadow = li < (QUALITY.detail ? 4 : 2);
      this.group.add(mesh);
      this.levels.push({
        mesh, geo, mat, uPatchRel, uFade, extent: this.extents[li],
        origin: new THREE.Vector3(), builtAnchor: new THREE.Vector3(1e9, 0, 0),
        built: false,   // 首次构建标记（初次/ DEM 更新才淡入，移动重建不闪）
        fadeStart: -1, // -1 = 尚未构建
      });
    }
    // 岩石散布层
    this.rocks = new RockField(field);
    this.group.add(this.rocks.mesh);
  }

  /** 地形激活距离（距表面 km）：与 manager.update 的 wantId 判定同源，
   * 最外级范围按此处的视地平推算，保证激活区间内可见表面全被地形覆盖 */
  static actDist(R) {
    return R < 100 ? Math.max(10, R * 0.8) : Math.max(500, R * 0.18);
  }

  /** DEM 新瓦片到达后标记脏：防抖合并——瓦片流式分批到达时旧逻辑每批都触发
   * 全级重建淡入（地面反复半透明闪烁，透过半透明外圈看到地平线下黑天空
   * 形成"黑色地平带"伪影）；现在仅登记 pending，由 update 间隔 ≥1.5s 启扫 */
  markDirty() {
    this.demPending = true;
  }

  /** dirLocal: 相机在天体本地系中的方向（单位）。timeSec: 水面波纹时基。
   * 每帧最多重建 1 级。首次激活由外向内（最大覆盖先出现）；后续正常内向外优先。
   * 每级重建后触发 0.8s 淡入，避免 LOD 突然弹出（#18）。 */
  update(dirLocal, timeSec = 0, sunDirLocal = null) {
    const R = this.field.phys.radiusKm;
    this.uTime.value = timeSec;
    if (sunDirLocal) this.uSunDir.value.copy(sunDirLocal);
    // 噪声原点吸附（>2km 偏移时跟随，细节噪声仅 90m 内可见，重排不可察觉）
    const px = dirLocal.x * R, py = dirLocal.y * R, pz = dirLocal.z * R;
    const o = this.noiseOriginU.value;
    if (Math.hypot(px - o.x, py - o.y, pz - o.z) > 2) {
      o.set(Math.round(px), Math.round(py), Math.round(pz));
      for (const lv of this.levels) lv.uPatchRel.value.copy(lv.origin).sub(o);
    }
    // 淡入动画：每帧推进所有正在淡入的级
    const now = performance.now();
    for (const lv of this.levels) {
      if (lv.fadeStart >= 0 && lv.uFade.value < 1) {
        const p = Math.min(1, (now - lv.fadeStart) / (lv.fadeDur ?? 800));
        lv.uFade.value = (lv.fadeFrom ?? 0) + (1 - (lv.fadeFrom ?? 0)) * p;
      }
    }
    // DEM 防抖提升：瓦片分批到达合并为一轮全级扫（间隔 ≥1.5s）
    if (this.demPending && !this.demDirty && now - (this._lastDemSweep ?? -1e9) > 1500) {
      this.demDirty = true;
      this.demPending = false;
      this._lastDemSweep = now;
      for (const lv of this.levels) lv.demClean = false;
    }
    // 首次激活：由外向内逐帧构建（大覆盖先出现，远处进入时感知更自然）
    const initMode = !this._initialized;
    if (this._buildTask) {
      const task = this._buildTask, start = performance.now();
      let result;
      do { result = task.steps.next(); } while (!result.done && performance.now() - start < 3);
      if (result.done) {
        task.lv.builtAnchor.copy(task.anchor);
        task.lv.demClean = true;
        if (task.li === 0) this.rocks.rebuild(task.anchor, task.lv.origin, task.demRebuild);
        this._buildTask = null;
        if (this.levels.every(l => l.demClean)) this.demDirty = false;
      }
    }
    for (let i = 0; i < this.levels.length; i++) {
      const li = initMode ? this.levels.length - 1 - i : i;
      const lv = this.levels[li];
      const moveKm = lv.builtAnchor.distanceTo(dirLocal) * R;
      // DEM 新瓦片到达 → 全部级都需要重建（旧逻辑仅最内级：中远地形永久停留在
      // 程序化噪声高程上，与近处 DEM 地形错位出断崖/平台，30m 外的岩石也因
      // 坐在陈旧噪声地形上而悬浮空中）。每帧扫一级（最内优先），扫完清脏。
      const demRebuild = !initMode && this.demDirty && !lv.demClean;
      if (!this._buildTask && (moveKm > lv.extent * 0.25 || demRebuild)) {
        // 淡入仅用于"新几何出现"：首次构建全淡入；DEM 高程更新半淡入
        // （0.35→1, 500ms，避免透过半透地面看到地平线下黑天空）；
        // 随移动的常规重建不淡入（顶点仍在同一连续高度场上，重置淡入
        // 会让地面每走几步闪一次——行走/奔跑时地面闪烁的根因，#18 回归修正）
        const anchor = dirLocal.clone();
        this._buildTask = { lv, li, anchor, demRebuild,
          steps: this._buildSteps(lv, anchor, !lv.built ? 'full' : 'none') };
        break; // 分帧：其余级下一帧再建
      }
    }
    // 全部级至少构建一次后标记已初始化
    if (initMode && this.levels.every(lv => lv.built)) {
      this._initialized = true;
    }
    // 覆盖就绪：全部级构建完毕且淡入到不透明
    this.readyCover = this._initialized && this.levels.every(lv => lv.uFade.value > 0.999);
  }

  build(lv, anchor, fadeMode = 'full') {
    for (const unused of this._buildSteps(lv, anchor, fadeMode)) { /* synchronous utility */ }
  }

  *_buildSteps(lv, anchor, fadeMode = 'full') {
    const geo = lv.geo.clone();
    this._stagingGeometry = geo;
    const GRID = this.grid;
    const R = this.field.phys.radiusKm;
    const u = anchor.clone().normalize();
    const east = Math.abs(u.y) > 0.999
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0).cross(u).normalize();
    const north = new THREE.Vector3().crossVectors(u, east);
    // 级原点：锚点地表（fround 取 fp32 精确可表示值 → mesh.position 无量化误差），
    // 顶点存原点相对坐标（模 ≤ 2×extent，亚毫米精度，R9-2a 修闪烁根因）
    const origin = new THREE.Vector3(
      Math.fround(u.x * R), Math.fround(u.y * R), Math.fround(u.z * R)
    );
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const wat = geo.attributes.water.array;
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    const dirs = lv.dirs ??= new Float32Array((GRID + 1) * (GRID + 1) * 3);
    const hs = lv.heights ??= new Float64Array((GRID + 1) * (GRID + 1));
    const isO = this.field.sp.ocean;
    let k = 0;
    for (let y = 0; y <= GRID; y++) {
      for (let x = 0; x <= GRID; x++, k++) {
        const fx = ((x / GRID) * 2 - 1) * lv.extent;
        const fy = ((y / GRID) * 2 - 1) * lv.extent;
        dir.copy(u).addScaledVector(east, fx / R).addScaledVector(north, fy / R).normalize();
        let h = this.field.height(dir);
        // 最外级：边缘高度平滑收回到**盘面球**，与远场无缝衔接。
        // 收口目标是盘面球而不是解析地形：落到解析地形上等于把落差从"缓坡"变成
        // "断崖"（地形比球面高 baseOffset，见 terrainReliefOffset）。
        // 不这样做的话，地形方块的外缘是一条硬直边——300km 高度上非常显眼
        // （方块内有大尺度起伏、方块外是完美光滑的球）。
        if (lv.extent >= R * 0.2 && !this.field.deformed) {
          const edge = Math.max(Math.abs(fx), Math.abs(fy)) / lv.extent;
          // 过渡带取外缘 30%（原 14%）：收口落差是 |地形 − 盘面球|，可能有几公里，
          // 14% 的宽度会让它变成一道明显的陡坎；30% 把它摊成缓坡。
          const blend = sstep(0.7, 1.0, edge);
          if (blend > 0) h = h * (1 - blend) + this.field.baseSphereRadius(dir) * blend;
        }
        hs[k] = h;
        dirs[k * 3] = dir.x; dirs[k * 3 + 1] = dir.y; dirs[k * 3 + 2] = dir.z;
        pos[k * 3] = dir.x * h - origin.x;
        pos[k * 3 + 1] = dir.y * h - origin.y;
        pos[k * 3 + 2] = dir.z * h - origin.z;
        wat[k] = isO && this.field.isOcean(dir) ? 1 : 0;
      }
      yield;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.water.needsUpdate = true;
    geo.computeVertexNormals();
    geo.attributes.normal.needsUpdate = true;
    // 第二遍：用法线坡度上色（陡坡岩壁化）并写入坡度属性（PBR 粗糙度驱动）
    const nrm = geo.attributes.normal.array;
    const slp = geo.attributes.slope.array;
    k = 0;
    for (let y = 0; y <= GRID; y++) {
      for (let x = 0; x <= GRID; x++, k++) {
        dir.set(dirs[k * 3], dirs[k * 3 + 1], dirs[k * 3 + 2]);
        const ndotu = nrm[k * 3] * dir.x + nrm[k * 3 + 1] * dir.y + nrm[k * 3 + 2] * dir.z;
        const slope = 1 - Math.min(1, Math.max(0, ndotu));
        this.field.color(dir, hs[k], slope, c);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        slp[k] = slope;
      }
      yield;
    }
    geo.attributes.color.needsUpdate = true;
    geo.attributes.slope.needsUpdate = true;
    if (fadeMode === 'none' || fadeMode === 'dem') {
      lv.uFade.value = 1; // 移动重建：保持不透明，不重启淡入
    } else {
      lv.fadeFrom = fadeMode === 'dem' ? 0.35 : 0;
      lv.fadeDur = fadeMode === 'dem' ? 500 : 800;
      lv.uFade.value = lv.fadeFrom;
      lv.fadeStart = performance.now();
    }
    const previous = lv.geo;
    lv.geo = geo; lv.mesh.geometry = geo;
    lv.origin.copy(origin); lv.mesh.position.copy(origin);
    lv.uPatchRel.value.copy(origin).sub(this.noiseOriginU.value);
    previous.dispose();
    this._stagingGeometry = null;
    lv.built = true;
  }

  dispose() {
    this._buildTask = null;
    this._stagingGeometry?.dispose();
    this._stagingGeometry = null;
    for (const lv of this.levels) { lv.geo.dispose(); lv.mesh.material.dispose(); }
    this.rocks.dispose();
  }
}

/** 地形管理器：跟踪最近可登陆天体，激活/释放 TerrainPatchSet，管理 DEM 瓦片流式加载 */
export class TerrainManager {
  constructor() {
    this.fields = new Map();     // bodyId -> HeightField
    this.demSources = new Map(); // bodyId -> DEMTileSource（月球 LOLA / 火星 MOLA）
    this.active = null;          // { bodyId, patches }
    this.getMapData = null;      // 由 builder 注入：bodyId -> ImageData|null
    this.physOf = null;          // bodyId -> phys
    this.meshOf = null;          // bodyId -> 天体网格（地形作为其子节点）
  }

  /** 为有天体创建 DEM 源（月球/火星），无配置的天体返回 null（使用纯程序化噪声） */
  _createDEMFor(bodyId) {
    if (!DEMTileSource.hasSource(bodyId)) return null;
    const src = new DEMTileSource(bodyId);
    this.demSources.set(bodyId, src);
    return src;
  }

  field(bodyId) {
    let f = this.fields.get(bodyId);
    if (!f) {
      f = new HeightField(bodyId, this.physOf(bodyId), this.getMapData?.(bodyId) ?? null);
      // 挂载 DEM 源（月球 LOLA / 火星 MOLA）；无配置的天体跳过，使用纯程序化噪声
      const dem = this.demSources.get(bodyId) ?? this._createDEMFor(bodyId);
      if (dem) f.setDEMSource(dem);
      this.fields.set(bodyId, f);
      if (this.fields.size > 4) {
        const oldest = [...this.fields.keys()].find(id => id !== bodyId && id !== this.active?.bodyId);
        if (oldest) this.fields.delete(oldest);
      }
    }
    const map = this.getMapData?.(bodyId);
    if (map && map !== f.map) {
      f.map = map;
      if (this.active?.bodyId === bodyId) this.active.patches.markDirty();
    }
    return f;
  }

  /** 行走碰撞/相机下限/自动登陆用：表面高度（海洋 = 水面，默认登陆水面，R10） */
  heightAt(bodyId, dirLocal) {
    return this.field(bodyId).height(dirLocal);
  }

  /** 固体表面（海洋处为海床）——下潜中的行走碰撞用（R10） */
  heightSolidAt(bodyId, dirLocal) {
    return this.field(bodyId).heightSolid(dirLocal);
  }

  /** 水面判定（行走浮力/水下环境用） */
  isWater(bodyId, dirLocal) {
    const f = this.field(bodyId);
    return !!(f.sp.ocean && f.isOcean(dirLocal));
  }

  /** DEM 基础层（全球 1×1 瓦片）是否就绪：就绪前 height() 返回噪声地形，
   * 就绪后切换为真实高程——两者可差数公里。登陆/行走必须等基础层就绪，
   * 否则会在噪声地表落地后看着真实地面"塌陷"到数公里之下。 */
  baseReady(bodyId) {
    if (!DEMTileSource.hasSource(bodyId)) return true;
    const dem = this.demSources.get(bodyId);
    if (!dem) return false; // 尚未创建（地形未激活）
    return dem.isOffline || dem.cache.size > 0;
  }

  /**
   * 按相机距表面距离选择 DEM 分辨率层级（近=高分辨率，远=低分辨率）。
   *
   * 必须按上游数据的实际上限钳制：本函数想要 L8，但月球 LOLA 的全球源
   * （5760×2880）只支撑到 L4，火星到 L5，地球到 L6（见 demTiles.js 的 maxLevel 说明）。
   * 不做钳制的话，近地表时会持续去预取**根本不存在**的瓦片——既白费请求，
   * 也让 LOD 逻辑误以为拿到了比实际更高的分辨率。
   *
   * @param {number} distKm 距表面距离
   * @param {number} ceiling 该天体 DEM 的实际上限层级
   */
  _demLevelForDistance(distKm, ceiling = 8) {
    let want;
    if (distKm < 1) want = 8;        // 地表行走：最高分辨率
    else if (distKm < 5) want = 7;
    else if (distKm < 20) want = 6;
    else if (distKm < 80) want = 5;
    else if (distKm < 200) want = 4;
    else if (distKm < 500) want = 3;
    else want = 2;                   // 远距离：粗分辨率（大尺度地形形状）
    return Math.min(want, ceiling);
  }

  /** 基底球可见性恢复（撤销可能的隐藏） */
  _showBase(bodyId) {
    const mesh = this.meshOf?.(bodyId);
    if (mesh) mesh.material.visible = true;
  }

  update(nearest, camLocalDir, timeSec = 0) {
    // 激活半径（#18 提前激活：确保外圈 LOD 在远处建好，接近时无弹出感）
    // 大天体：地球 1147km、火星 610km、月球 500km；小天体比例缩放
    let wantId = null;
    if (nearest && nearest.landable) {
      const actDist = TerrainPatchSet.actDist(this.physOf(nearest.id).radiusKm);
      if (nearest.distSurface < actDist) wantId = nearest.id;
    }

    if (this.active && this.active.bodyId !== wantId) {
      this._showBase(this.active.bodyId); // 恢复基底球
      this.active.patches.group.removeFromParent();
      this.active.patches.dispose();
      this.active = null;
    }
    if (wantId && !this.active) {
      const patches = new TerrainPatchSet(this.field(wantId));
      this.meshOf(wantId).add(patches.group);
      this.active = { bodyId: wantId, patches };
      // 预加载 DEM 基础层级（全球 1×1 瓦片），确保大尺度地形形状先就位
      const dem = this.demSources.get(wantId);
      if (dem) dem.preloadBase();
    }
    if (this.active && camLocalDir) {
      this.active.patches.update(camLocalDir, timeSec);
      // 海面高空淡出：0.6km 以下地形海面全权（波纹/泡沫/耀斑），2.5km 以上
      // 完全交回盘面海洋，避免掠射菲涅尔白翳与盘面耀斑模型不一致显出瓦片方片
      if (nearest) {
        const wf = 1 - THREE.MathUtils.smoothstep(nearest.distSurface, 0.6, 2.5);
        this.active.patches.uWaterFade.value = wf;
        // 水下判定：该处是海且相机低于水面（水面 = R + 1m）
        const fld = this.field(this.active.bodyId);
        this.active.patches.uUnderwater.value =
          (fld.sp.ocean && nearest.distSurface < 0.0005 && fld.isOcean(camLocalDir)) ? 1 : 0;
      }
      // DEM 瓦片流式：按相机位置请求瓦片 + 检查新瓦片到达
      const dem = this.demSources.get(this.active.bodyId);
      if (dem) {
        dem.preloadBase(); // retries are throttled in the tile source
        const dist = nearest ? nearest.distSurface : 100;
        dem.setPriority(1 / Math.max(0.1, dist)); // 近=高优先级
        dem.requestTiles(camLocalDir, this._demLevelForDistance(dist, dem.config?.maxLevel ?? 0));
        // 新瓦片到达 → 标记地形重建（下帧 update 拾取真实高程）
        if (dem.hasNewTiles) {
          this.active.patches.markDirty();
          dem.clearDirty();
        }
      }
    }
  }
}
