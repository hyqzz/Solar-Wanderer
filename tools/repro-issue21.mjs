// Issue #21 repro+verify: 登陆视觉接近 SpaceEngine 级真实感。
// 逐项复现"改前缺失"并验证"改后生效"，仅覆盖可在 Node 无头执行的纯逻辑/数据：
//   1) 极冠霜冻：高纬度白化（FROST_PALETTES）——改前 color() 无极区处理
//   2) 坡度 PBR：build() 写入 slope 顶点属性 + 着色器读取 vSlope 驱动粗糙度
//   3) 近地面气溶胶 haze：火星/金星/泰坦 atmosphere.haze 已定义且 > 0
//   4) 大气步进数提升：QUALITY.atmoN/atmoNL 增大（黄昏色带更细）
//   5) 岸边泡沫 + 三向海浪 + 方向性眼睛适应：源码结构断言（GLSL 不可在 Node 执行）
// 着色器编译/渲染正确性由 tools/probe-r7.mjs（puppeteer 自动登陆火星，0 控制台错误）验证。

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { TerrainPatchSet, HeightField } from '../src/scene/terrain.js';
import { BODIES, MOON_PHYS } from '../src/astro/bodies.js';
import { QUALITY } from '../src/engine/quality.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} —— ${detail}`); }
};
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

console.log('[Issue-21] 登陆视觉 SpaceEngine 级真实感');

// ---- 1) 极冠霜冻：火星高纬度比赤道明显更白（蓝/绿/红均被霜色拉高） ----
{
  const field = new HeightField('mars', BODIES.mars, null);
  const c = new THREE.Color();
  // 赤道点（dir.y≈0）
  const eqDir = new THREE.Vector3(1, 0, 0).normalize();
  field.color(eqDir, field.height(eqDir), 0, c);
  const eqLum = (c.r + c.g + c.b) / 3;
  // 极点附近（dir.y≈1，|y|>0.90 → polar=1 完全霜冻）
  const poleDir = new THREE.Vector3(0.05, 1, 0).normalize();
  field.color(poleDir, field.height(poleDir), 0, c);
  const poleLum = (c.r + c.g + c.b) / 3;
  const poleBlue = c.b;
  check('复现/验证：火星极区亮度显著高于赤道（霜冻白化）',
    poleLum > eqLum + 0.15, `极=${poleLum.toFixed(3)} 赤道=${eqLum.toFixed(3)}`);
  check('火星极区蓝通道被抬高（接近霜色 0.78，而非火星红的低蓝）',
    poleBlue > 0.55, `极区 b=${poleBlue.toFixed(3)}`);
}

// ---- 1b) 不影响 issue 外：地球 palette 不在 FROST_PALETTES，极区不被人为白化 ----
{
  const field = new HeightField('earth', BODIES.earth, null);
  const c = new THREE.Color();
  const eqDir = new THREE.Vector3(1, 0, 0).normalize();
  field.color(eqDir, field.height(eqDir), 0, c);
  const eqLum = (c.r + c.g + c.b) / 3;
  const poleDir = new THREE.Vector3(0.05, 1, 0).normalize();
  field.color(poleDir, field.height(poleDir), 0, c);
  const poleLum = (c.r + c.g + c.b) / 3;
  // 地球极区颜色应主要由真实贴图/调色板决定，不应出现霜冻强制白化（差异远小于火星）
  check('不影响 issue 外：地球（earth palette）极区无强制霜冻白化',
    Math.abs(poleLum - eqLum) < 0.15, `Δlum=${(poleLum - eqLum).toFixed(3)}`);
}

// ---- 2) 坡度 PBR：build() 必须写入 slope 顶点属性，几何含该 attribute ----
{
  const field = new HeightField('moon', MOON_PHYS.moon, null);
  const patches = new TerrainPatchSet(field);
  const lv = patches.levels[0];
  check('每级几何含 slope 顶点属性（驱动粗糙度 PBR）',
    !!lv.geo.attributes.slope, 'slope attribute 缺失');
  // 触发一次构建，slope 数组应被写入非全零值（存在陡坡/缓坡差异）
  patches.update(new THREE.Vector3(0, 1, 0), 0);
  const builtLv = patches.levels.find((l) => l.fadeStart >= 0);
  const slp = builtLv.geo.attributes.slope.array;
  let maxSlope = 0;
  for (let i = 0; i < slp.length; i++) maxSlope = Math.max(maxSlope, slp[i]);
  check('构建后 slope 含非零坡度（地形起伏被量化为粗糙度输入）',
    maxSlope > 0, `maxSlope=${maxSlope.toFixed(4)}`);
  patches.dispose();
}

// ---- 3) 近地面气溶胶 haze：火星/金星/泰坦已定义 > 0；其余天体无（默认 0，零回归） ----
{
  check('火星大气含 haze（沙尘）', (BODIES.mars.atmosphere.haze ?? 0) > 0,
    `haze=${BODIES.mars.atmosphere.haze}`);
  check('金星大气含 haze（硫酸云）', (BODIES.venus.atmosphere.haze ?? 0) > 0,
    `haze=${BODIES.venus.atmosphere.haze}`);
  check('泰坦大气含 haze（烃类烟霾）', (MOON_PHYS.titan.atmosphere.haze ?? 0) > 0,
    `haze=${MOON_PHYS.titan.atmosphere.haze}`);
  // 地球不应被加 haze（保持洁净蓝天，零回归）
  check('不影响 issue 外：地球大气无 haze（蓝天不被污染）',
    (BODIES.earth.atmosphere.haze ?? 0) === 0, `haze=${BODIES.earth.atmosphere.haze}`);
  // 木星/海王星等气巨无 haze 字段，默认 0
  check('不影响 issue 外：木星无 haze 字段（默认 0）',
    (BODIES.jupiter.atmosphere.haze ?? 0) === 0, `haze=${BODIES.jupiter.atmosphere.haze}`);
}

// ---- 4) 大气步进数提升（黄昏色带更细腻） ----
{
  // QUALITY 默认 high 档
  check('high 档大气视线步进 atmoN ≥ 20（原 16）',
    QUALITY.atmoN >= 20, `atmoN=${QUALITY.atmoN}`);
  check('high 档太阳步进 atmoNL ≥ 8（原 6）',
    QUALITY.atmoNL >= 8, `atmoNL=${QUALITY.atmoNL}`);
}

// ---- 5) GLSL/JS 结构断言（运行时正确性由 probe-r7 验证，此处确保改动确已落地） ----
{
  const terrain = src('scene/terrain.js');
  check('地形着色器：坡度驱动粗糙度（vSlope）已注入',
    /vSlope/.test(terrain) && /roughnessFactor = mix\(0\.82/.test(terrain),
    'vSlope/粗糙度 mix 未找到');
  check('地形着色器：岸边泡沫（foam）已注入',
    /foam/.test(terrain) && /0\.88, 0\.91, 0\.96/.test(terrain), 'foam 未找到');
  check('地形着色器：三向海浪（三个 tnoise 波叠加）已注入',
    (terrain.match(/tnoise\(vObjPos \* \d+\.0\s*[+-] vec3\(uTime/g) ?? []).length >= 3,
    '三向波数量不足');
  check('地形着色器：uFade 透明淡入已注入',
    /gl_FragColor\.a \*= uFade/.test(terrain), 'uFade alpha 未找到');

  const atmo = src('scene/atmosphere.js');
  check('大气着色器：uHaze 近地面气溶胶项已注入',
    /uHaze \* exp\(-h/.test(atmo), 'uHaze 散射项未找到');

  const planetMat = src('scene/planetMaterial.js');
  check('行星材质：程序细节淡入范围已拓宽至 smoothstep(0.01, 0.18)',
    /smoothstep\(0\.01, 0\.18, app\)/.test(planetMat), '淡入范围未拓宽');

  const main = src('main.js');
  check('主循环：方向性眼睛适应（亮快暗慢）已注入',
    /adaptSpeed/.test(main) && /exposureTarget < renderer\.toneMappingExposure/.test(main),
    'adaptSpeed 未找到');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
