// 真实星表（耶鲁亮星星表 BSC5, CDS V/50）的运行时读取。
//
// 数据由 tools/fetch-stars.mjs 生成：public/data/stars.bin 是全表 9096 颗，
// src/astro/stars.generated.js 是其中有专名的子集（供标签）。
//
// 为什么走二进制而不是 JS 字面量：9096 颗 × 5 个 float 若写成 JS 数组会进主包，
// 而这个文件是可选的增强（拿不到时星空仍能显示）——放进独立文件让它与星历、
// 贴图一样按需加载，也便于按内容哈希做缓存版本。
import { asset } from '../config.js';

/** 记录结构：f32 raDeg, f32 decDeg, f32 vmag, f32 bv, f32 distLy */
export const STAR_RECORD_BYTES = 20;
const HEADER_BYTES = 12;
const MAGIC = 'SWST';

/**
 * 解析 stars.bin。纯函数，Node 里可直接测。
 * @returns {{ count:number, ra:Float32Array, dec:Float32Array, mag:Float32Array,
 *             bv:Float32Array, distLy:Float32Array }|null}
 */
export function parseStarCatalog(buffer) {
  const dv = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES) return null;
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== MAGIC) return null;
  const version = dv.getUint16(4, true);
  if (version !== 1) return null;                       // 版本不认识就放弃，别猜
  const count = dv.getUint32(8, true);
  if (buffer.byteLength < HEADER_BYTES + count * STAR_RECORD_BYTES) return null;
  const ra = new Float32Array(count), dec = new Float32Array(count);
  const mag = new Float32Array(count), bv = new Float32Array(count);
  const distLy = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * STAR_RECORD_BYTES;
    ra[i] = dv.getFloat32(o, true);
    dec[i] = dv.getFloat32(o + 4, true);
    mag[i] = dv.getFloat32(o + 8, true);
    bv[i] = dv.getFloat32(o + 12, true);
    distLy[i] = dv.getFloat32(o + 16, true);
  }
  return { count, ra, dec, mag, bv, distLy };
}

let _cache = null;

/** 加载星表；失败返回 null（调用方回退到程序化星空，不能因为星表挂了就没有星空） */
export async function loadStarCatalog() {
  if (_cache !== null) return _cache;
  try {
    const r = await fetch(asset('data/stars.bin'), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _cache = parseStarCatalog(await r.arrayBuffer());
    if (_cache) console.info(`[stars] 星表 ${_cache.count} 颗`);
  } catch (e) {
    console.info('[stars] 星表不可用，回退程序化星空', e?.message ?? e);
    _cache = null;
  }
  return _cache;
}

/** B−V 色指数 → 线性 RGB。用黑体色温的常用近似，而不是几个离散色档。
 *  B−V 与色温的经验关系（Ballesteros 2012）：T = 4600·(1/(0.92·BV+1.7) + 1/(0.92·BV+0.62)) */
export function bvToRgb(bv, out = [1, 1, 1]) {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  const T = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  // 色温 → RGB（Tanner Helland 的分段近似，归一化到 G=1）
  const t = T / 100;
  let r, g, bl;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) bl = 255;
  else if (t <= 19) bl = 0;
  else bl = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const cl = (x) => Math.max(0, Math.min(255, x)) / 255;
  r = cl(r); g = cl(g); bl = cl(bl);
  // 归一化到最大分量为 1：星等已经承担了亮度，颜色只负责色相，
  // 否则红星的 G/B 偏低会连带把总亮度也压下去，亮度关系就乱了。
  const m = Math.max(r, g, bl) || 1;
  out[0] = r / m; out[1] = g / m; out[2] = bl / m;
  return out;
}

/** 星等 → 相对**通量**。Pogson 定义：每差 5 等亮度差 100 倍，0 等 = 1。
 *  这是物理量，别拿它直接当显示亮度用（见 magToDisplayIntensity）。 */
export function magToIntensity(mag) {
  return Math.pow(10, -0.4 * mag);
}

/**
 * 星等 → **显示**强度。
 *
 * 直接拿 Pogson 通量当亮度是不行的：6 等星比 0 等暗 250 倍，在 8 位帧缓冲上
 * 直接掉到不可见——而真实夜空里 6 等星是肉眼能看见的（那正是 BSC5 收录到 6.5 等
 * 的原因）。实测：改用纯 Pogson 后，地面抬头只剩零星几个点。
 *
 * 所以这里先算物理通量比，再做一次幂律压缩。这不是"作弊"：人眼对点光源的响应
 * 本就是压缩的（Weber–Fechner 对数律），6 等星与 1 等星的**观感**差距远小于
 * 100 倍。压缩把物理量转成人眼看到的量，顺序与层次都保留。
 *
 * 指数 0.55 使 0 等 → 1、6.5 等 → 约 0.037（仍是清楚可见的暗点），
 * 天狼星（−1.46 等）→ 约 2.1 倍于 0 等星。
 */
export function magToDisplayIntensity(mag) {
  return Math.pow(magToIntensity(mag), 0.55);
}
