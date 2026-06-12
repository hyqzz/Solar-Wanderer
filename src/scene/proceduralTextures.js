// 程序化兜底贴图：真实贴图缺失（如完全离线）时按天体类型生成等距圆柱投影贴图。

import * as THREE from 'three';
import { makeNoise, hashSeed } from '../util/noise.js';

const PRESETS = {
  gray:     { base: [120, 118, 116], varr: [60, 60, 60], craters: 1.0 },
  dark:     { base: [60, 56, 54], varr: [40, 38, 36], craters: 1.0 },
  ice:      { base: [205, 215, 225], varr: [40, 35, 30], craters: 0.3 },
  mars:     { base: [165, 95, 55], varr: [70, 45, 30], craters: 0.5 },
  venus:    { base: [185, 150, 100], varr: [50, 45, 35], craters: 0.1 },
  io:       { base: [215, 185, 95], varr: [70, 70, 80], craters: 0.0 },
  titan:    { base: [180, 130, 60], varr: [50, 40, 25], craters: 0.0 },
  triton:   { base: [205, 198, 190], varr: [35, 32, 30], craters: 0.2 },
  pluto:    { base: [185, 155, 120], varr: [80, 70, 60], craters: 0.4 },
  callisto: { base: [110, 100, 90], varr: [70, 65, 55], craters: 1.2 },
  iapetus:  { base: [120, 115, 105], varr: [110, 110, 105], craters: 0.8 },
  earth:    { base: [70, 90, 120], varr: [60, 50, 30], craters: 0 },
};

/** 生成等距圆柱投影贴图（CanvasTexture） */
export function proceduralMap(bodyId, palette = 'gray', w = 1024, h = 512) {
  const preset = PRESETS[palette] ?? PRESETS.gray;
  const n = makeNoise(hashSeed(bodyId + ':tex'));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    const cy = Math.cos(lat), sy = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * 2 * Math.PI;
      const px = cy * Math.cos(lon), pz = -cy * Math.sin(lon), py = sy;
      let t = 0.5 + 0.5 * n.fbm(px * 3, py * 3, pz * 3, 5);
      t = t * 0.7 + 0.3 * n.ridged(px * 8, py * 8, pz * 8, 4);
      let shade = 1;
      if (preset.craters > 0) {
        const c = n.fbm(px * 18, py * 18, pz * 18, 3);
        const rim = Math.max(0, 1 - Math.abs(c - 0.18) * 14);
        const pit = Math.max(0, 1 - Math.abs(c - 0.3) * 9);
        shade += preset.craters * (rim * 0.18 - pit * 0.3);
      }
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, (preset.base[0] + (t - 0.5) * preset.varr[0]) * shade));
      d[i + 1] = Math.max(0, Math.min(255, (preset.base[1] + (t - 0.5) * preset.varr[1]) * shade));
      d[i + 2] = Math.max(0, Math.min(255, (preset.base[2] + (t - 0.5) * preset.varr[2]) * shade));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 气巨条带贴图（仅在真实贴图缺失时使用） */
export function proceduralBands(bodyId, colors, w = 1024, h = 512) {
  const n = makeNoise(hashSeed(bodyId + ':bands'));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warp = 0.04 * n.fbm(u * 6, v * 18, 0.5, 4);
      const band = 0.5 + 0.5 * Math.sin((v + warp) * Math.PI * 14 + 2 * n.noise3(u * 2, v * 5, 7));
      const k = Math.min(colors.length - 2, Math.floor(band * (colors.length - 1)));
      const f = band * (colors.length - 1) - k;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        d[i + ch] = colors[k][ch] * (1 - f) + colors[k + 1][ch] * f;
      }
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
