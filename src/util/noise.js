// 确定性 3D 梯度噪声（improved Perlin）+ fBm / ridged 组合，CPU 端用于地形与程序化贴图。

export function makeNoise(seed = 1337) {
  // 以 LCG 洗牌置换表，保证同一天体地形每次进入一致
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0 || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  function grad(h, x, y, z) {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function noise3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z), u),
        lerp(grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(
        lerp(grad(perm[AA + 1] & 15, x, y, z - 1), grad(perm[BA + 1] & 15, x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1] & 15, x, y - 1, z - 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
  }

  /** 分形布朗运动，输出约 [-1,1] */
  function fbm(x, y, z, octaves = 5, lacunarity = 2.02, gain = 0.5) {
    let amp = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise3(x, y, z);
      norm += amp;
      amp *= gain;
      x *= lacunarity; y *= lacunarity; z *= lacunarity;
    }
    return sum / norm;
  }

  /** 山脊噪声，输出约 [0,1] */
  function ridged(x, y, z, octaves = 4) {
    let amp = 0.5, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * (1 - Math.abs(noise3(x, y, z)));
      norm += amp;
      amp *= 0.5;
      x *= 2.1; y *= 2.1; z *= 2.1;
    }
    return sum / norm;
  }

  return { noise3, fbm, ridged };
}

/** 由字符串得到稳定种子 */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
