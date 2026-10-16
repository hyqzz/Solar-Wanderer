// 度量台专用：Node 端读取 DEM 瓦片。不依赖浏览器，也不引入第三方依赖。
//
// 为什么要自己解 PNG：DEM 瓦片是 256×256 的 8 位 RGBA PNG，高度打包在
// R(高 8 位)+G(低 8 位)。要在 CI 与离线脚本里核对地形，就必须能在 Node 里
// 拿到像素；为此引入一个 PNG 库不值当，而 PNG 的非隔行 RGBA 子集只有
// 「inflate + 逐行反滤波」两步。
//
// 解码约定与运行时逐字对齐（src/scene/demTiles.js:_decodeTile）：
//   高程(km) = heightOffset + ((R<<8)|G) / 65535 * heightScale
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DEM_ROOT = new URL('../../public/dem/', import.meta.url);

/** 解码非隔行 PNG → { width, height, channels, data(Uint8Array), palette?, alphaTable? }
 *
 * 支持灰度/真彩/灰度+alpha/真彩+alpha，以及**调色板（颜色类型 3）**。
 * 调色板是后加的：GIBS 的云量产品就是以调色板 PNG 发布的，把它当成"不支持"
 * 会挡住整个真实云图数据源。返回的 palette 是 256×3 的 RGB 表、alphaTable 是
 * 每索引的 alpha，供调用方**反查索引**（索引往往就等于数据值本身）。
 */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null, alphaTable = null;
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'PLTE') palette = Uint8Array.from(body);
    else if (type === 'tRNS') alphaTable = Uint8Array.from(body);
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  if (colorType === 3) {
    if (bitDepth !== 8) throw new Error('调色板 PNG 只支持 8 位索引，实际 ' + bitDepth);
    if (!palette) throw new Error('调色板 PNG 缺 PLTE');
    const idx = inflateSync(Buffer.concat(idat));
    const out = new Uint8Array(height * width);
    let prev = new Uint8Array(width);
    for (let y = 0; y < height; y++) {
      const filter = idx[y * (width + 1)];
      const line = idx.subarray(y * (width + 1) + 1, y * (width + 1) + 1 + width);
      const cur = out.subarray(y * width, (y + 1) * width);
      for (let i = 0; i < width; i++) {
        const a = i >= 1 ? cur[i - 1] : 0, b = prev[i], c = i >= 1 ? prev[i - 1] : 0;
        let v = line[i];
        if (filter === 1) v += a;
        else if (filter === 2) v += b;
        else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        }
        cur[i] = v & 0xff;
      }
      prev = cur;
    }
    return { width, height, channels: 1, data: out, palette, alphaTable, indexed: true };
  }
  if (bitDepth !== 8) throw new Error('只支持 8 位深度，实际 ' + bitDepth);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持的颜色类型 ' + colorType);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { width, height, channels, data: out };
}

const configCache = new Map();
export function demConfig(body) {
  if (configCache.has(body)) return configCache.get(body);
  const p = fileURLToPath(new URL(`${body}/index.json`, DEM_ROOT));
  if (!existsSync(p)) { configCache.set(body, null); return null; }
  const cfg = { ...JSON.parse(readFileSync(p, 'utf8')), body };
  configCache.set(body, cfg);
  return cfg;
}

export function hasDem(body) { return demConfig(body) !== null; }

const tileCache = new Map();
/** 读取一层瓦片 → Float32Array(km)，或 null（越界/缺失） */
export function demTile(body, level, x, y) {
  const cfg = demConfig(body);
  if (!cfg || level > cfg.maxLevel) return null;
  const key = `${body}/${level}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const p = fileURLToPath(new URL(`${body}/${level}/${x}/${y}.png`, DEM_ROOT));
  let heights = null;
  if (existsSync(p)) {
    const img = decodePng(readFileSync(p));
    const { heightScale, heightOffset } = cfg;
    heights = new Float32Array(img.width * img.height);
    for (let i = 0; i < heights.length; i++) {
      const raw = (img.data[i * 4] << 8) | img.data[i * 4 + 1];
      heights[i] = heightOffset + (raw / 65535) * heightScale;
    }
    heights.width = img.width; heights.height = img.height;
  }
  tileCache.set(key, heights);
  return heights;
}

/** 经纬度 → 瓦片坐标 + 瓦片内偏移（与 src/scene/demTiles.js 的 latLonToTile 一致） */
export function latLonToTile(lat, lon, level) {
  const n = 2 ** level;
  const x = ((lon + 180) / 360) * n;
  const y = ((90 - lat) / 180) * n;
  const ix = Math.floor(x), iy = Math.floor(y);
  return { x: ((ix % n) + n) % n, y: Math.max(0, Math.min(n - 1, iy)), fx: x - ix, fy: y - iy };
}

/**
 * 采样高程（km）。与运行时同样使用「跨瓦片全局连续像素双线性」——
 * 瓦片边界上的不连续会让地形出现台阶，这是必须被断言的行为。
 */
export function heightAt(body, lat, lon, level) {
  const cfg = demConfig(body);
  if (!cfg) return null;
  level = Math.min(level ?? cfg.maxLevel, cfg.maxLevel);
  const px = latLonToTile(lat, lon, level);
  const size = cfg.tileSize;
  const gx = px.x * size + px.fx * size;      // 全局连续像素坐标
  const gy = px.y * size + px.fy * size;
  const sample = (ix, iy) => {
    const n = 2 ** level;
    const tx = ((Math.floor(ix / size) % n) + n) % n;
    const ty = Math.max(0, Math.min(n - 1, Math.floor(iy / size)));
    const t = demTile(body, level, tx, ty);
    if (!t) return null;
    const lx = ((ix % size) + size) % size, ly = Math.max(0, Math.min(size - 1, ((iy % size) + size) % size));
    return t[ly * size + lx];
  };
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const a = sample(x0, y0), b = sample(x0 + 1, y0), c = sample(x0, y0 + 1), d = sample(x0 + 1, y0 + 1);
  if (a === null || b === null || c === null || d === null) return null;
  const fx = gx - x0, fy = gy - y0;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** 该层全球像素宽度（= 2^level × tileSize） */
export function globalPixelWidth(body, level) {
  const cfg = demConfig(body);
  return cfg ? 2 ** level * cfg.tileSize : 0;
}
