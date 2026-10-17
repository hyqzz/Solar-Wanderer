// 从 PDS SBN 拉取 Thomas 卫星形状模型（实测 lat/lon/radius 网格）并转成紧凑二进制。
//
// 为什么需要：不规则小天体此前的形状是**程序化的三轴椭球 + 噪声形变**
// （builder.deformIrregular），而真实形状是有实测资料的——PDS 的
// ast-sat.thomas.shape-models 就是 Thomas 等人从飞掠影像反演出的半径网格
// （Phobos/Deimos/Janus/Epimetheus/Hyperion/Ida/Mathilde/Vesta/Gaspra）。
// 有实测就该用实测。
//
// 源文件是纯文本三列（纬度°, 经度°, 半径 km），2°×2° 网格 = 91×181 = 16471 行。
// 转成：magic 'SHP1' + nLat/nLon(u32) + scale/mn(f32) + uint16 半径，
// 每个天体 ~33KB（Phobos 半径 8–14km，uint16 量化到 0.1m，远超需要的精度）。
//
// 用法：node tools/fetch-shapes.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://sbnarchive.psi.edu/pds4/non_mission/ast-sat.thomas.shape-models_V1_0/data/';
// 本项目里真实存在的天体（其余是主带小行星，不在场景中）
const MODELS = [
  ['phobos', 'm1phobos.tab'],
  ['deimos', 'm2deimos.tab'],
  ['janus', 's10janus.tab'],
  ['epimetheus', 's11epimetheus.tab'],
  ['hyperion', 's7hyperion.tab'],
];
const OUT = new URL('../public/data/shapes/', import.meta.url);
mkdirSync(OUT, { recursive: true });

for (const [id, file] of MODELS) {
  const res = await fetch(BASE + file);
  if (!res.ok) { console.error(`${id}: HTTP ${res.status}`); continue; }
  const text = await res.text();
  const rows = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const p = t.split(/\s+/).map(Number);
    if (p.length < 3 || !p.every(Number.isFinite)) continue;
    rows.push(p);
  }
  if (!rows.length) { console.error(`${id}: 解析出 0 行`); continue; }
  // 网格形状：纬度 -90..90、经度 0..360，步长从数据推断
  const lats = [...new Set(rows.map((r) => r[0]))].sort((a, b) => a - b);
  const lons = [...new Set(rows.map((r) => r[1]))].sort((a, b) => a - b);
  const nLat = lats.length, nLon = lons.length;
  if (nLat * nLon !== rows.length) {
    console.error(`${id}: 网格不完整 ${nLat}×${nLon} ≠ ${rows.length}`); continue;
  }
  const latIdx = new Map(lats.map((v, i) => [v, i]));
  const lonIdx = new Map(lons.map((v, i) => [v, i]));
  const r = new Float32Array(nLat * nLon);
  for (const [la, lo, rr] of rows) r[latIdx.get(la) * nLon + lonIdx.get(lo)] = rr;
  let mn = Infinity, mx = -Infinity;
  for (const v of r) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const scale = (mx - mn) / 65535;
  // 头 20 字节：magic + nLat + nLon + scale + mn（**偏移必须一起存**，
  // 只存 scale 会把整个形状平移——第一版就漏了它）
  const buf = Buffer.alloc(20 + nLat * nLon * 2);
  buf.write('SHP1', 0, 'ascii');
  buf.writeUInt32LE(nLat, 4); buf.writeUInt32LE(nLon, 8);
  buf.writeFloatLE(scale, 12); buf.writeFloatLE(mn, 16);
  for (let i = 0; i < r.length; i++) {
    buf.writeUInt16LE(Math.round((r[i] - mn) / scale), 20 + i * 2);
  }
  const name = `${id}.bin`;
  writeFileSync(new URL(name, OUT), buf);
  console.log(`${id.padEnd(11)} ${nLat}×${nLon}  r ${mn.toFixed(3)}–${mx.toFixed(3)} km  ` +
    `量化 ${(scale * 1000).toFixed(2)} m  ${(buf.length / 1024).toFixed(0)} KB`);
}
console.log('\n注意：-90/90 两行在数据里是重复的极值（极点是退化环），读取端按纬度环处理。');
