// 实测小天体形状模型（PDS SBN / Thomas 等）。
//
// 为什么需要：不规则小天体此前的形状是**程序化三轴椭球 + 噪声形变**，而真实
// 形状有实测资料——Thomas 等人从飞掠影像反演出半径网格（Phobos/Deimos/Janus/
// Epimetheus/Hyperion…）。有实测就用实测：贴图上的坑（火卫一的 Stickney）在
// 实测形状里是真的凹下去，而程序化椭球上它是平的。
//
// 数据格式见 tools/fetch-shapes.mjs：magic 'SHP1' + nLat/nLon(u32) +
// scale/mn(f32) + uint16 半径。2°×2° 网格，planetocentric，经度是 IAU 的
// **西经**（Prime meridian W = …，与 bodies.js 的自转模型同一套约定）。
//
// 读取是同步的（地形/碰撞/网格形变都在热路径上），所以启动时先 load 一次。

const grids = new Map();   // id -> { nLat, nLon, scale, mn, data: Uint16Array }

/** 启动时调用一次。任何失败都静默回退到程序化形状（离线/未部署/格式不符）。 */
export async function loadShapeModels(ids, base = '') {
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`${base}data/shapes/${id}.bin`);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 20) return;
      const dv = new DataView(buf);
      if (dv.getUint32(0, false) !== 0x53485031) return;   // 'SHP1'
      const nLat = dv.getUint32(4, true), nLon = dv.getUint32(8, true);
      const scale = dv.getFloat32(12, true), mn = dv.getFloat32(16, true);
      if (!nLat || !nLon || !(scale > 0) || 20 + nLat * nLon * 2 > buf.byteLength) return;
      const data = new Uint16Array(nLat * nLon);
      for (let i = 0; i < data.length; i++) data[i] = dv.getUint16(20 + i * 2, true);
      grids.set(id, { nLat, nLon, scale, mn, data });
    } catch { /* 回退 */ }
  }));
  return grids.size;
}

export function hasShapeModel(id) { return grids.has(id); }

/**
 * 体固系单位方向 → 实测半径（km）。
 * 纬度用 planetocentric（= asin(y)），经度与 terrain.sampleMap 同一约定。
 * 双线性插值：2° 网格直接最近邻会在经纬线上出现导数不连续（轨道高度可见的
 * 一圈圈直线陡坎），与 _albedoReliefAt 踩过的是同一个坑。
 */
export function shapeRadiusKm(id, dir) {
  const g = grids.get(id);
  if (!g) return null;
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  const lon = Math.atan2(-dir.z, dir.x);
  // 纬度 → 行（-90..90 均匀），经度 → 列（0..360 均匀，lon∈[-π,π] 折到 [0,360)）
  let fy = (0.5 - lat / Math.PI) * (g.nLat - 1);
  let fx = ((lon / Math.PI + 1) * 0.5) * (g.nLon - 1);
  fy = Math.max(0, Math.min(g.nLat - 1.0001, fy));
  // 经度是环绕的：列 nLon-1 与列 0 是同一条子午线，用模运算而不是钳制
  const nLonWrap = g.nLon - 1;
  fx = ((fx % nLonWrap) + nLonWrap) % nLonWrap;
  const y0 = Math.floor(fy), x0 = Math.floor(fx);
  const ty = fy - y0, tx = fx - x0;
  const x1 = (x0 + 1) % nLonWrap;
  const y1 = Math.min(y0 + 1, g.nLat - 1);
  const at = (y, x) => g.mn + g.data[y * g.nLon + x] * g.scale;
  const a = at(y0, x0), b = at(y0, x1), c = at(y1, x0), d = at(y1, x1);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}
