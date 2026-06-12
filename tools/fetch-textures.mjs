// 贴图资产下载：基于 NASA/USGS 实测数据的等距圆柱投影贴图。
// 来源1: solarsystemscope.com（CC-BY-4.0，基于 NASA/USGS/SDO 数据）
// 来源2: stevealbers.net（NASA Science On a Sphere 项目柱面图，公开数据合成）
// 每个目标提供候选链，逐一尝试；全部失败则运行时程序化兜底。

import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'textures');
mkdirSync(OUT, { recursive: true });

const SSS = 'https://www.solarsystemscope.com/textures/download/';
const SA = 'https://stevealbers.net/albers/sos/';
const MAX_BYTES = 80 * 1024 * 1024;

const TARGETS = {
  'sun.jpg': [SSS + '2k_sun.jpg'],
  'mercury.jpg': [SSS + '8k_mercury.jpg', SSS + '2k_mercury.jpg'],
  'venus_surface.jpg': [SSS + '2k_venus_surface.jpg'],
  'venus_atmosphere.jpg': [SSS + '2k_venus_atmosphere.jpg'],
  'earth_day.jpg': [SSS + '8k_earth_daymap.jpg', SSS + '2k_earth_daymap.jpg'],
  'earth_night.jpg': [SSS + '8k_earth_nightmap.jpg', SSS + '2k_earth_nightmap.jpg'],
  'earth_clouds.jpg': [SSS + '8k_earth_clouds.jpg', SSS + '2k_earth_clouds.jpg'],
  'moon.jpg': [SSS + '8k_moon.jpg', SSS + '2k_moon.jpg'],
  'mars.jpg': [SSS + '8k_mars.jpg', SSS + '2k_mars.jpg'],
  'jupiter.jpg': [SSS + '8k_jupiter.jpg', SSS + '2k_jupiter.jpg'],
  'saturn.jpg': [SSS + '8k_saturn.jpg', SSS + '2k_saturn.jpg'],
  'saturn_ring.png': [SSS + '8k_saturn_ring_alpha.png', SSS + '2k_saturn_ring_alpha.png'],
  'uranus.jpg': [SSS + '2k_uranus.jpg'],
  'neptune.jpg': [SSS + '2k_neptune.jpg'],
  'milkyway.jpg': [SSS + '8k_stars_milky_way.jpg', SSS + '4k_stars_milky_way.jpg', SSS + '2k_stars_milky_way.jpg'],
  'io.jpg': [SA + 'jupiter/io/io_rgb_cyl.jpg'],
  'europa.png': [SA + 'jupiter/europa/europa_rgb_cyl_juno.png', SA + 'jupiter/europa/europa_rgb_cyl.jpg'],
  'ganymede.jpg': [SA + 'jupiter/ganymede/ganymede_4k.jpg', SA + 'jupiter/ganymede/ganymede_rgb_cyl.jpg'],
  'callisto.jpg': [SA + 'jupiter/callisto/callisto_rgb_cyl.jpg'],
  'titan.jpg': [SA + 'saturn/titan/titan_rgb_cyl.jpg'],
  'triton.jpg': [SA + 'neptune/triton/triton_rgb_cyl_www.jpg'],
  'pluto.jpg': [SA + 'pluto/pluto_rgb_cyl.jpg', SA + 'pluto/pluto_rgb_cyl_www.jpg', SA + 'pluto/pluto_rgb_cyl_8k.png'],
  'charon.jpg': [SA + 'pluto/charon/charon_rgb_cyl.jpg'],
};

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'heliosphere-game/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = parseInt(res.headers.get('content-length') || '0', 10);
  if (len > MAX_BYTES) throw new Error(`过大 ${(len / 1e6).toFixed(0)}MB`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error(`疑似错误页 (${buf.length}B)`);
  const head = buf.subarray(0, 4).toString('hex');
  if (!head.startsWith('ffd8') && !head.startsWith('89504e47')) throw new Error('非 JPG/PNG');
  writeFileSync(dest, buf);
  return buf.length;
}

const manifest = {};
for (const [file, candidates] of Object.entries(TARGETS)) {
  const dest = join(OUT, file);
  if (existsSync(dest) && statSync(dest).size > 10000) {
    manifest[file] = true;
    console.log(`⏭  ${file} 已存在`);
    continue;
  }
  let ok = false;
  for (const url of candidates) {
    try {
      const size = await download(url, dest);
      console.log(`✅ ${file}  ${(size / 1e6).toFixed(1)}MB  ← ${url}`);
      ok = true;
      break;
    } catch (e) {
      console.log(`   ✗ ${url} — ${e.message}`);
    }
  }
  manifest[file] = ok;
  if (!ok) console.log(`⚠️  ${file} 全部失败 → 运行时程序化兜底`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const got = Object.values(manifest).filter(Boolean).length;
console.log(`\n完成: ${got}/${Object.keys(TARGETS).length} 个贴图就绪，manifest.json 已写入`);
