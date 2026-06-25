// DEM 瓦片流式 LOD 系统：为月球（LOLA）和火星（MOLA）提供真实高程数据流式加载。
//
// 为什么需要这个模块：
//   现有地形是程序化噪声 + 真实反照率融合，非真实 DEM。对于月球和火星这两个
//   最具情感冲击力的登陆目的地，用户希望识别出真实地貌（阿波罗着陆点撞击坑、
//   奥林帕斯山、水手谷等）。真实 DEM 数据是 GB 级，必须流式分块加载。
//
// 设计要点：
//   - 瓦片金字塔：层级 0-8（每层 2^level × 2^level 瓦片，等距圆柱投影）
//   - LRU 缓存：桌面 64 瓦片，移动端 32（内存预算，避免 OOM）
//   - 按相机距离优先级加载（近处高分辨率优先）
//   - 离线回退：首次网络失败后永久回退到程序化噪声地形（避免重试风暴）
//   - 同步采样接口：height() 从缓存同步读取，未命中时返回 null 由调用方回退
//
// 与现有地形的融合策略（谱融合，天然无缝）：
//   - DEM 提供大尺度地形形状（低频成分）
//   - 程序化噪声补充 DEM 分辨率以下的细节（高频成分）
//   - 近距离：高分辨率 DEM 驱动 + 高频噪声细节
//   - 中距离：低分辨率 DEM（粗形状）+ 高频噪声（等价于 DEM+噪声混合）
//   - 远距离/离线：纯程序化噪声（现有行为，完全不变）
//   - 裂缝预防：height() 总是使用可用的最高分辨率 DEM；瓦片到达后地形重建 +
//     现有 uFade 淡入动画（#18）过渡，无可见裂缝
//
// 数据源（可配置，URL 为占位符，连接真实服务时更新）：
//   - 月球 LOLA DEM：USGS Astrogeology / LROC 瓦片服务（~118 m/px）
//   - 火星 MOLA DEM：USGS Astrogeology 瓦片服务（~463 m/px）
//   离线或服务不可用时，自动回退到现有程序化噪声地形。

import { IS_MOBILE } from '../engine/quality.js';

/**
 * DEM 数据源配置（可配置，支持扩展）。
 * url 模板：{z}=层级, {x}=列, {y}=行（等距圆柱投影，与现有贴图一致）。
 * heightScale/heightOffset：将 16-bit 灰度值解码为 km 高程。
 *   高程 = heightOffset + (raw / 65535) * heightScale
 */
export const DEM_SOURCES = {
  moon: {
    name: 'LOLA',
    // LROC/USGS LOLA DEM 瓦片服务（118 m/px 全球）
    // 注：URL 为占位符，实际部署时替换为可用的 CORS-enabled 瓦片服务端点
    url: 'https://wms.lroc.asu.edu/lola/tiles/{z}/{x}/{y}.png',
    // LOLA 高程范围：-9 km（深坑底）到 +10 km（最高峰），共 19 km
    heightScale: 19,
    heightOffset: -9,
    tileSize: 256,
    maxLevel: 8,
  },
  mars: {
    name: 'MOLA',
    // USGS Astrogeology MOLA DEM 瓦片服务（463 m/px 全球）
    url: 'https://astrogeology.usgs.gov/cache/mola/{z}/{x}/{y}.png',
    // MOLA 高程范围：-8 km（赫拉斯盆地底）到 +21 km（奥林帕斯山顶），共 29 km
    heightScale: 29,
    heightOffset: -8,
    tileSize: 256,
    maxLevel: 8,
  },
};

/** 将方向向量（+Y=北极, +X=本初子午线）转换为经纬度（度） */
function dirToLatLon(dir) {
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI;
  const lon = Math.atan2(-dir.z, dir.x) * 180 / Math.PI; // 东经为正（与 terrain.js 一致）
  return { lat, lon };
}

/** 将经纬度（度）转换为瓦片坐标 + 瓦片内小数偏移（等距圆柱投影） */
function latLonToTile(lat, lon, level) {
  const n = 2 ** level;
  // 等距圆柱投影：lon [-180,180] → [0,n]，lat [90,-90] → [0,n]
  const x = ((lon + 180) / 360) * n;
  const y = ((90 - lat) / 180) * n;
  const ix = Math.floor(x), iy = Math.floor(y);
  return {
    x: ((ix % n) + n) % n, // 经度环绕（东西经拼接）
    y: Math.max(0, Math.min(n - 1, iy)), // 纬度钳制（极区不环绕）
    fx: x - ix,
    fy: y - iy,
  };
}

/**
 * LRU 瓦片缓存：Map 保持插入顺序，delete+set 实现 O(1) LRU 淘汰。
 * 为什么用 Map 而非数组：JS Map 的迭代顺序 = 插入顺序，首项即最久未用，
 * 无需额外链表结构。
 */
class LRUTileCache {
  constructor(max) {
    this.max = max;
    this.map = new Map(); // key "z/x/y" → { data, size, level }
  }

  get(level, x, y) {
    const key = `${level}/${x}/${y}`;
    const v = this.map.get(key);
    if (v) {
      // 移到末尾（最近使用）—— delete + set 重排插入顺序
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(level, x, y, tile) {
    const key = `${level}/${x}/${y}`;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      // 淘汰最久未用（首项）
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, tile);
  }

  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

/**
 * DEM 瓦片流式源：管理单个天体的 DEM 瓦片加载、缓存、采样。
 *
 * 使用模式：
 *   1. TerrainManager 为月球/火星创建 DEMTileSource
 *   2. 每帧 update() 调用 requestTiles() 按相机位置预加载瓦片
 *   3. HeightField.height() 调用 getHeightSync() 同步采样（缓存命中时）
 *   4. 未命中或离线时返回 null，HeightField 回退到程序化噪声
 */
export class DEMTileSource {
  constructor(bodyId, options = {}) {
    this.bodyId = bodyId;
    // 数据源配置：允许 options.sources 覆盖默认（便于测试/扩展）
    const sources = options.sources ?? DEM_SOURCES;
    this.config = sources[bodyId] ?? null;
    // 无配置的天体（地球、水星等）→ 始终回退到噪声
    this.cache = new LRUTileCache(options.maxCache ?? (IS_MOBILE ? 32 : 64));
    this.loading = new Map(); // key → Promise，去重进行中的请求
    this._priority = 0;
    this._offline = false; // 首次网络失败后置 true，永久回退（避免重试风暴）
    this._dirty = false; // 新瓦片到达标记，驱动地形重建
    this._disposed = false;
    // 移动端 lite 画质：降低 DEM 分辨率（省带宽/内存）
    const maxLvl = this.config?.maxLevel ?? 0;
    this.sampleLevel = IS_MOBILE ? Math.min(6, maxLvl) : maxLvl;
  }

  /** 该天体是否有 DEM 数据源配置 */
  static hasSource(bodyId, sources = DEM_SOURCES) {
    return !!sources[bodyId];
  }

  get hasSource() { return this.config !== null; }
  get isOffline() { return this._offline; }
  get priority() { return this._priority; }

  /** 设置加载优先级（由 TerrainManager 按相机距离设置，越大越优先） */
  setPriority(p) { this._priority = p; }

  /** 新瓦片是否到达（驱动地形重建） */
  get hasNewTiles() { return this._dirty; }
  clearDirty() { this._dirty = false; }

  /**
   * 异步获取瓦片高度数据（公开接口）。
   * @param {number} level 金字塔层级 0-8
   * @param {number} x 列（经度方向，自动环绕）
   * @param {number} y 行（纬度方向，钳制）
   * @returns {Promise<{level,x,y,data:Float32Array,size:number}|null>}
   */
  async getTile(level, x, y) {
    if (!this.config || this._offline || this._disposed) return null;
    level = Math.min(level, this.config.maxLevel);
    const n = 2 ** level;
    x = ((x % n) + n) % n; // 经度环绕
    y = Math.max(0, Math.min(n - 1, y));

    const cached = this.cache.get(level, x, y);
    if (cached) return cached;

    const key = `${level}/${x}/${y}`;
    // 去重：同一瓦片的并发请求合并为单个 fetch
    if (this.loading.has(key)) return this.loading.get(key);

    const promise = this._fetchTile(level, x, y);
    this.loading.set(key, promise);
    try {
      const tile = await promise;
      if (tile && !this._disposed) {
        this.cache.set(level, x, y, tile);
        this._dirty = true; // 标记地形需重建以拾取新数据
      }
      return tile;
    } finally {
      this.loading.delete(key);
    }
  }

  /** 实际发起网络请求并解码瓦片 */
  async _fetchTile(level, x, y) {
    const url = this.config.url
      .replace('{z}', level)
      .replace('{x}', x)
      .replace('{y}', y);
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const data = await this._decodeTile(blob);
      if (!data) throw new Error('解码失败');
      return { level, x, y, data, size: this.config.tileSize };
    } catch (e) {
      // 网络失败 → 永久标记离线，后续不再尝试（避免重试风暴拖累帧率）
      if (!this._offline) {
        console.warn(`[DEM] ${this.bodyId} 瓦片加载失败，回退到程序化地形: ${e.message}`);
        this._offline = true;
      }
      return null;
    }
  }

  /**
   * 解码瓦片图像为高度数组（Float32Array，km）。
   * 浏览器环境使用 createImageBitmap + Canvas 像素读取；
   * Node/测试环境无 createImageBitmap → 返回 null（触发离线回退）。
   * 编码：16-bit 高度值打包在 R(高8位)+G(低8位) 通道（Terrain RGB 变体）。
   */
  async _decodeTile(blob) {
    if (typeof createImageBitmap === 'undefined') return null;
    const bmp = await createImageBitmap(blob);
    const w = bmp.width, h = bmp.height;
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    bmp.close?.();
    const { heightScale, heightOffset } = this.config;
    const n = w * h;
    const heights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = img.data[i * 4];
      const g = img.data[i * 4 + 1];
      const raw = (r << 8) | g; // 16-bit 高度值
      heights[i] = heightOffset + (raw / 65535) * heightScale;
    }
    return heights;
  }

  /**
   * 异步获取指定经纬度的高程（km，相对于参考球面）。
   * @param {number} lat 纬度（度）
   * @param {number} lon 经度（度）
   * @param {number} [level] 金字塔层级，默认 sampleLevel
   * @returns {Promise<number|null>} 海拔 km，或 null（离线/未配置）
   */
  async getHeight(lat, lon, level) {
    if (!this.config || this._offline) return null;
    level = Math.min(level ?? this.sampleLevel, this.config.maxLevel);
    const t = latLonToTile(lat, lon, level);
    const tile = await this.getTile(level, t.x, t.y);
    if (!tile) return null;
    return this._sampleTile(tile, t.fx, t.fy);
  }

  /**
   * 同步获取高程（从缓存读取，不发起网络请求）。
   * 供 HeightField.height() 热路径调用——必须同步以避免地形构建阻塞。
   * @param {THREE.Vector3} dir 方向向量（+Y=北极, +X=本初子午线）
   * @returns {number|null} 海拔 km，或 null（缓存未命中/离线）
   */
  getHeightSync(dir) {
    if (!this.config || this._offline) return null;
    const { lat, lon } = dirToLatLon(dir);
    // 从高到低分辨率尝试：优先使用最精细的缓存瓦片
    for (let level = this.sampleLevel; level >= 0; level--) {
      const t = latLonToTile(lat, lon, level);
      const tile = this.cache.get(level, t.x, t.y);
      if (tile) return this._sampleTile(tile, t.fx, t.fy);
    }
    return null; // 无缓存瓦片 → 调用方回退到程序化噪声
  }

  /** 双线性插值采样瓦片高度 */
  _sampleTile(tile, fx, fy) {
    const s = tile.size;
    const px = fx * (s - 1);
    const py = fy * (s - 1);
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, s - 1), y1 = Math.min(y0 + 1, s - 1);
    const tx = px - x0, ty = py - y0;
    const h00 = tile.data[y0 * s + x0];
    const h10 = tile.data[y0 * s + x1];
    const h01 = tile.data[y1 * s + x0];
    const h11 = tile.data[y1 * s + x1];
    return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty)
         + h01 * (1 - tx) * ty + h11 * tx * ty;
  }

  /**
   * 按相机位置请求瓦片（后台预加载，填充缓存）。
   * 请求 3×3 邻域（中心优先），fire-and-forget。
   * @param {THREE.Vector3} dirLocal 相机在天体本地系的方向
   * @param {number} level 期望分辨率层级
   */
  requestTiles(dirLocal, level) {
    if (!this.config || this._offline || this._disposed) return;
    level = Math.min(level, this.config.maxLevel);
    const { lat, lon } = dirToLatLon(dirLocal);
    const t = latLonToTile(lat, lon, level);
    // 中心瓦片优先（最高优先级），然后邻域——异步 fetch 自动按调用顺序启动
    this.getTile(level, t.x, t.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        this.getTile(level, t.x + dx, t.y + dy);
      }
    }
  }

  /** 预加载基础层级（全球 1×1 瓦片），确保大尺度地形形状先就位 */
  async preloadBase() {
    if (!this.config || this._offline) return;
    await this.getTile(0, 0, 0);
  }

  dispose() {
    this._disposed = true;
    this.cache.clear();
    this.loading.clear();
  }
}
