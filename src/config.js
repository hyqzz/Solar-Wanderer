// 全局常量与坐标约定。
// 世界单位 = 千米(km)。世界轴 = 黄道 J2000 经 M:(x,y,z)→(x,z,−y) 映射（黄道北极为 +Y）。

import * as THREE from 'three';

export const KM_PER_AU = 149597870.7;
export const C_KM_S = 299792.458;

// 界面语言优先级：URL 路径或参数 > 浏览器语言 > Node 默认 'zh'。
// 支持 7 种语言：zh/en/es/ja/fr/de/ru（#3, #44, #45, #46）。
// ?lang=es 或 /es/ 强制西班牙语，以此类推。
const SUPPORTED_LANGS = ['zh', 'en', 'es', 'ja', 'fr', 'de', 'ru'];

function detectLang() {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const paramLang = params.get('lang');
    if (SUPPORTED_LANGS.includes(paramLang)) return paramLang;
    const pathLang = window.location.pathname.split('/')[1];
    if (SUPPORTED_LANGS.includes(pathLang)) return pathLang;
  }
  if (typeof navigator !== 'undefined') {
    // 取主语言代码（zh-CN → zh, en-US → en, ja-JP → ja 等），匹配已支持语言
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    const primary = nav.split('-')[0];
    if (SUPPORTED_LANGS.includes(primary)) return primary;
    return 'en'; // 未支持的语言回退英文
  }
  return 'zh';
}
export const LANG = detectLang();
const _u = (zh, en) => (LANG === 'zh' ? zh : en);

/** 黄道坐标 {x,y,z} → three 世界 Vector3 */
export function eclToWorld(p, out = new THREE.Vector3()) {
  return out.set(p.x, p.z, -p.y);
}

/** 黄道坐标 → 世界轴三元组（double 数组用） */
export function eclToWorldArr(p) {
  return [p.x, p.z, -p.y];
}

/** 赤道 J2000 (RA,Dec 弧度) → 世界方向 */
export function raDecToWorld(ra, dec, out = new THREE.Vector3()) {
  const OBL = (23.43928 * Math.PI) / 180;
  const xq = Math.cos(dec) * Math.cos(ra);
  const yq = Math.cos(dec) * Math.sin(ra);
  const zq = Math.sin(dec);
  // 赤道→黄道: Rx(−ε)
  const xe = xq;
  const ye = yq * Math.cos(OBL) + zq * Math.sin(OBL);
  const ze = -yq * Math.sin(OBL) + zq * Math.cos(OBL);
  return out.set(xe, ze, -ye);
}

/** 3x3 行优先矩阵（黄道系）→ three 世界系四元数（含 M 共轭变换） */
const M_ECL2WORLD = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const M_INV = M_ECL2WORLD.clone().transpose();
const tmpM = new THREE.Matrix4();
export function eclMatrixToWorldQuat(m9, out = new THREE.Quaternion()) {
  tmpM.set(m9[0], m9[1], m9[2], 0, m9[3], m9[4], m9[5], 0, m9[6], m9[7], m9[8], 0, 0, 0, 0, 1);
  tmpM.premultiply(M_ECL2WORLD).multiply(M_INV);
  return out.setFromRotationMatrix(tmpM);
}

/** 速度格式化 */
export function formatSpeed(kmS) {
  if (kmS >= KM_PER_AU) return (kmS / KM_PER_AU).toFixed(2) + ' AU/s';
  if (kmS >= 0.01 * C_KM_S) return (kmS / C_KM_S).toFixed(2) + ' c';
  if (kmS >= 1) return kmS >= 1000 ? (kmS / 1000).toFixed(1) + _u(' 千km/s', ' Mm/s') : kmS.toFixed(1) + ' km/s';
  return (kmS * 1000).toFixed(1) + ' m/s';
}

export const LY_KM = 9460730472580.8; // 1 光年（km）

/** 距离格式化 */
export function formatDist(km) {
  if (km >= LY_KM * 0.01) return (km / LY_KM).toFixed(4) + _u(' 光年', ' ly');
  if (km >= 0.05 * KM_PER_AU) return (km / KM_PER_AU).toFixed(3) + ' AU';
  if (km >= 1e6) return (km / 1e6).toFixed(2) + _u(' 百万km', ' Mkm');
  if (km >= 1) return Math.round(km).toLocaleString() + ' km';
  return Math.round(km * 1000) + ' m';
}
