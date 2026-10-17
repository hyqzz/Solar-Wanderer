// 渲染真实度回归：DEM 层级上限、太阳临边昏暗、大气臭氧层。
//
// 这三项都属于"静默出错"的类型——画面照样出来，只是物理不对，
// 所以既要锁定数值行为，也要检查着色器源码里确实有这些项。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SphereGeometry } from 'three';
import { DEM_SOURCES, levelExceedsSource } from '../src/scene/demTiles.js';
import { parseStarCatalog, bvToRgb, magToIntensity } from '../src/astro/starCatalog.js';
import { CATALOG_COUNT } from '../src/astro/stars.generated.js';
import { MOON_PHYS, HAPKE_PARAMS } from '../src/astro/bodies.js';
import { PRESETS } from '../src/scene/proceduralTextureData.js';
import { BODIES } from '../src/astro/bodies.js';
import { TNO_DATA } from '../src/astro/tno.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── 批次 4：DEM 层级上限必须由源数据分辨率决定 ──────────────────────────────

test('DEM 上限层级与上游源分辨率一致（不是随手取的常数）', () => {
  for (const [id, cfg] of Object.entries(DEM_SOURCES)) {
    assert.ok(cfg.sourcePx > 0, `${id} 缺少 sourcePx`);
    // 本方案瓦片网格是 2^z×2^z 方块覆盖 360°×180°，所以第 z 层经度分辨率 = 360/(256·2^z)
    const lonDegPerPx = 360 / (cfg.tileSize * 2 ** cfg.maxLevel);
    const srcLonDegPerPx = 360 / cfg.sourcePx;
    assert.ok(lonDegPerPx >= srcLonDegPerPx * 0.74,
      `${id}: L${cfg.maxLevel} 的经度分辨率 ${lonDegPerPx.toFixed(5)}°/px 明显细于源 ${srcLonDegPerPx.toFixed(5)}°/px，等于在上采样`);
    assert.ok(!levelExceedsSource(cfg, cfg.maxLevel), `${id}: maxLevel 已经超出源分辨率`);
  }
});

test('levelExceedsSource 能识别越界层级', () => {
  const cfg = DEM_SOURCES.moon;
  assert.equal(levelExceedsSource(cfg, cfg.maxLevel), false);
  assert.equal(levelExceedsSource(cfg, cfg.maxLevel + 2), true);
  assert.equal(levelExceedsSource({ tileSize: 256 }, 9), false, '无 sourcePx 时不应误报');
});

test('火星已用到源允许的上限，地球/月球没有无谓上采样', () => {
  assert.equal(DEM_SOURCES.mars.maxLevel, 5, '火星源 11520px 支撑到 L5');
  assert.equal(DEM_SOURCES.moon.maxLevel, 4, '月球源 5760px 只到 L4');
  assert.equal(DEM_SOURCES.earth.maxLevel, 4);
});

test('地形按数据上限钳制 DEM 层级（不再去预取不存在的瓦片）', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/_demLevelForDistance\(distKm, ceiling = 8\)/.test(src), '缺少 ceiling 形参');
  assert.ok(/Math\.min\(want, ceiling\)/.test(src), '缺少钳制');
  assert.ok(/_demLevelForDistance\(dist, dem\.config\?\.maxLevel/.test(src),
    '调用点未传入该天体的实际上限');
});

// ── 批次 6：太阳临边昏暗 ────────────────────────────────────────────────────

/** Neckel & Labs (1994) 五阶临边昏暗多项式的镜像实现 */
const limbPoly = (mu) => 0.30 + 0.93 * mu - 0.23 * mu ** 2 + 0.14 * mu ** 3
  - 0.16 * mu ** 4 + 0.02 * mu ** 5;

test('太阳临边昏暗为五阶多项式：中心归一、边缘趋暗且单调', () => {
  assert.ok(Math.abs(limbPoly(1) - 1) < 1e-9, '日面中心必须归一为 1');
  assert.ok(limbPoly(0) > 0.25 && limbPoly(0) < 0.35, `边缘 ${limbPoly(0).toFixed(3)} 应在 0.3 附近`);
  let prev = limbPoly(1.0);
  for (let mu = 0.95; mu >= 0; mu -= 0.05) {
    const v = limbPoly(mu);
    assert.ok(v < prev, `μ=${mu.toFixed(2)} 处不单调`);
    prev = v;
  }
});

test('临边红化：蓝通道衰减快于红通道（边缘有效温度低约 1000 K）', () => {
  const mu = 0.25;
  const ld = limbPoly(mu);
  const r = ld, g = ld ** 1.10, b = ld ** 1.30;
  assert.ok(g < r && b < g, '逐通道幂次应使蓝端更暗');
  assert.ok(b / r < 0.88, `边缘 B/R = ${(b / r).toFixed(3)}，红化不足`);
});

test('着色器源码确实使用五阶多项式与分光临边昏暗', () => {
  const src = read('src/scene/sun.js');
  assert.ok(src.includes('0.30 + 0.93 * mu - 0.23 * mu * mu'), '缺少 Neckel & Labs 多项式');
  assert.ok(/vec3\(ld, pow\(ld, 1\.10\), pow\(ld, 1\.30\)\)/.test(src), '缺少分光临边昏暗');
  assert.ok(!/0\.35 \+ 0\.65 \* mu/.test(src), '一阶线性近似应已被替换');
});

test('日冕在非日食时也有基准可见度（人眼可见，相机不可见）', () => {
  const src = read('src/scene/sun.js');
  const m = /uVisibility\.value = occulted \? 1 : ([0-9.e-]+);/.exec(src);
  assert.ok(m, '未找到日冕可见度设置');
  const base = Number(m[1]);
  assert.ok(base > 0 && base < 0.2, `基准可见度 ${base} 应在 (0, 0.2) 之间`);
});

// ── 批次 6：臭氧层 ──────────────────────────────────────────────────────────

test('大气着色器含臭氧吸收，且是 Chappuis 带的分光系数', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(src.includes('uniform float uOzone;'), '缺少 uOzone 声明');
  assert.ok(/exp\(-pow\(\(h - 25\.0\) \/ 8\.0, 2\.0\)\)/.test(src), '缺少 25 km 高斯臭氧层剖面');
  const m = /vec3 betaO = vec3\(([^)]+)\) \* uOzone;/.exec(src);
  assert.ok(m, '缺少臭氧消光系数');
  const [r, g, b] = m[1].split(',').map((x) => Number(x));
  assert.ok(r > g && g > b, `Chappuis 带应红端吸收最强，实际 ${r}/${g}/${b}`);
  assert.ok(b < r * 0.05, '蓝端几乎不吸收（这正是暮光蓝色带的成因）');
  assert.ok(/betaO \* \(odO \+ olO\)/.test(src), '臭氧未进入透射率积分');
});

test('臭氧只给确有臭氧层的天体开启', () => {
  assert.ok((BODIES.earth.atmosphere.ozone ?? 0) > 0.5, '地球应有完整臭氧层');
  assert.ok((BODIES.mars.atmosphere.ozone ?? 0) > 0 && BODIES.mars.atmosphere.ozone < 0.3,
    '火星臭氧层极薄');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune', 'titan']) {
    const o = BODIES[id]?.atmosphere?.ozone ?? 0;
    assert.ok(o === 0, `${id} 不应有臭氧层（实际 ${o}）`);
  }
});

// ── 批次 6：云层（体积步进 + 面剔除） ────────────────────────────────────────

test('云层体积步进：解析求壳区间 + 自阴影 + 银边', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/vec2 raySphere\(vec3 ro/.test(src), '缺少射线-球求交');
  assert.ok(/float t1 = min\(tRt\.y, \(tRb\.x > 0\.0 \? tRb\.x : tRt\.y\)\)/.test(src),
    '缺少壳体区间解析求解');
  assert.ok(/for \(int j = 1; j <= NL; j\+\+\)/.test(src), '缺少自阴影步进');
  assert.ok(/silver/.test(src), '缺少前向散射银边项');
  assert.ok(/smoothstep\(0\.0, 0\.18, hFrac\)/.test(src), '缺少云层垂直廓线（云顶才会锐）');
});

test('云壳面剔除：按相机在壳内/壳外保留正确的一面', () => {
  const src = read('src/scene/planetMaterial.js');
  // 只用 FrontSide 或只用 BackSide 都只能覆盖一半视角：球外要看正面（近半球在行星之前，
  // 深度测试能过），球内要看背面（正面朝后会被整体剔除——那正是"从地面看不到云"）。
  assert.ok(/if \(uCameraInside > 0\.5\) \{ if \(gl_FrontFacing\) discard; \}/.test(src),
    '缺少按相机内外切换保留面');
  assert.ok(/side: THREE\.DoubleSide/.test(src), '云材质应为 DoubleSide');
  assert.ok(!/side: THREE\.BackSide/.test(src), '不应退回单面渲染');
  assert.ok(/premultipliedAlpha: true/.test(src), '体积累加是预乘颜色，必须声明');
});

test('云层 UV 与 Three.js 球面 uv 一致（v 轴不得写反）', () => {
  const src = read('src/scene/planetMaterial.js');
  // SphereGeometry 的 uv.y = 1 在北极；写成 0.5 - asin(...)/π 会把云图上下翻转采样
  assert.ok(/0\.5 \+ asin\(clamp\(rel\.y \/ rl, -1\.0, 1\.0\)\) \/ 3\.14159265/.test(src),
    'latLonOf 的 v 轴方向不对');
  assert.ok(!/0\.5 - asin\(clamp\(rel\.y \/ rl/.test(src), 'v 轴仍为翻转写法');
});

test('latLonOf 的 u 轴与 SphereGeometry 的 uv 属性逐顶点一致（不是镜像）', () => {
  // 这条是照着 SphereGeometry 的顶点公式验的，不靠注释自证：
  //   x = −r·cos(2πu)·sin θ,  z = r·sin(2πu)·sin θ  ⇒  u_几何 = 0.5 − atan2(z,x)/2π
  // 曾经写成 +0.5，于是云图相对地表东西镜像、云影又与可见云镜像错位。
  const g = new SphereGeometry(1, 12, 8);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const latLonU = (x, y, z) => 0.5 - Math.atan2(z, x) / (2 * Math.PI);
  const latLonV = (x, y, z) => 0.5 + Math.asin(y / Math.hypot(x, y, z)) / Math.PI;
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/0\.5 - atan\(rel\.z, rel\.x\) \/ 6\.2831853/.test(src), 'latLonOf 的 u 轴不是几何口径');
  assert.ok(!/atan\(rel\.z, rel\.x\) \/ 6\.2831853 \+ 0\.5/.test(src), 'u 轴仍为镜像写法');
  let maxDU = 0, maxDV = 0, poles = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-6) { poles++; continue; }   // 极点处经度退化，跳过
    maxDU = Math.max(maxDU, Math.abs(latLonU(x, y, z) - uv.getX(i)));
    maxDV = Math.max(maxDV, Math.abs(latLonV(x, y, z) - uv.getY(i)));
  }
  assert.ok(poles > 0, '取样里应当包含极点，否则这个测试没覆盖到退化情形');
  // 容差取 1e-6：顶点位置是 Float32，反三角再算回来有 ~1e-8 的舍入；
  // 而这里要抓的错误（镜像）是 0.5 量级，两者差着七个数量级，不会混淆。
  assert.ok(maxDU < 1e-6, `u 轴最大偏差 ${maxDU}（0.5 量级即镜像）`);
  assert.ok(maxDV < 1e-6, `v 轴最大偏差 ${maxDV}`);
});

test('云层与地表云影共用同一套 UV 与不透明度映射', () => {
  const src = read('src/scene/planetMaterial.js');
  // 阴影若用几何 uv、可见云用另一套，云影就会落在没有云的地方
  assert.ok(/texture2D\(uCloudTex, cloudUV\(vUv, uTime\)\)/.test(src), '地表云影未走 cloudUV');
  assert.ok(/cloudUV\(latLonOf\(ro \+ rd \* tEnter\), uTime\)/.test(src), '云层未走 cloudUV');
  assert.ok(!/pnoise\(vec3\(vUv \* 8\.0/.test(src), '云影仍在用自己的一套扰动');
  // 自转偏移方向：u 轴是反的，云要东移必须减 u
  assert.ok(/\-t \* 0\.00002/.test(src), '云的自转偏移方向未随 u 轴翻转，云会向西倒着飘');
});

test('云密度是连续幂律而非阈值截断（阈值化会压出硬边白斑）', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/float cloudTau\(vec3 cl\)/.test(src), '缺少共享的云光学厚度映射');
  // 断言的是**性质**而不是某组具体数字：云量 → 光学厚度必须是一条连续幂律
  // （pow(lum, k) * c，k ≥ 1），不能是 smoothstep/截断那样的阈值型映射——
  // 阈值化会在高云量处饱和成硬边不透明白斑。
  const m = src.match(/float cloudTau\(vec3 cl\)\s*\{([\s\S]*?)\}/);
  assert.ok(m, '未找到 cloudTau 实现');
  const body = m[1];
  const p = body.match(/pow\(lum,\s*([\d.]+)\)\s*\*\s*([\d.]+)/);
  assert.ok(p, 'cloudTau 应为连续幂律 pow(lum, k) * c');
  assert.ok(Number(p[1]) >= 1, `幂指数应 ≥1，实际 ${p[1]}`);
  assert.ok(!/smoothstep/.test(body), 'cloudTau 不应含阈值化映射');
  assert.ok(!/step\(/.test(body), 'cloudTau 不应含阈值化映射');
  // 旧写法在 lum>0.65 处饱和到 1，把贴图的大片中间调压成硬边不透明白斑
  assert.ok(!/dot\(cl, vec3\(0\.34\)\) - 0\.10\) \* 1\.8/.test(src), '阈值化映射仍在');
  assert.ok(!/dot\(cloudCol, vec3\(0\.34\)\) - 0\.10\) \* 1\.8/.test(src), '云影仍用阈值化映射');
  // Beer–Lambert 形式：永不饱和，薄云保持半透明
  assert.ok(/1\.0 - exp\(-cloudTau\(cl\)\)/.test(src), '缺少 Beer–Lambert 不透明度');
});

test('云的平均不透明度落在"能看见海陆"的区间（不是白球也不是没有云）', () => {
  const src = read('src/scene/planetMaterial.js');
  const body = src.match(/float cloudTau\(vec3 cl\)\s*\{([\s\S]*?)\}/)[1];
  const p = body.match(/pow\(lum,\s*([\d.]+)\)\s*\*\s*([\d.]+)/);
  const k = Number(p[1]), c = Number(p[2]);
  // GIBS 云量的全球均值实测 0.71（public/textures/clouds_real.json 有记录）
  const meanLum = 0.71;
  const tau = meanLum ** k * c;
  const alpha = 1 - Math.exp(-tau);
  assert.ok(alpha > 0.15 && alpha < 0.45,
    `全球平均云不透明度 ${alpha.toFixed(2)} 不在 [0.15, 0.45]：` +
    `过低云会看不见，过高地球会糊成白球（实测 0.775 时 63.8% 盘面像元过曝）`);
});

// ── 批次 9：GIBS 真实日期云图 ────────────────────────────────────────────────

test('真实云图资产与清单存在且自洽，并已在贴图清单里登记', () => {
  const meta = JSON.parse(readFileSync(
    new URL('../public/textures/clouds_real.json', import.meta.url), 'utf8'));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(meta.date), `资产日期格式不对：${meta.date}`);
  assert.equal(meta.layer, 'MODIS_Terra_Cloud_Fraction_Day');
  assert.ok(meta.coverage > 0.9, `有效覆盖仅 ${(meta.coverage * 100).toFixed(1)}%，缺口没补齐`);
  // 全球平均云量：实测约 0.67。这是"颜色→数值映射没错"的关键证据——
  // 映射错了这个数会明显偏离（生成脚本里也有同一道自检）。
  assert.ok(meta.meanFraction > 0.5 && meta.meanFraction < 0.85,
    `全球平均云量 ${meta.meanFraction} 偏离实测范围`);
  // 必须登记进 textures/manifest.json：加载器对未登记的文件是**直接跳过**的，
  // 漏登记会让云层静默回落到合成图（实测踩过：画面照出，只是云不是当天的）
  const manifest = JSON.parse(readFileSync(
    new URL('../public/textures/manifest.json', import.meta.url), 'utf8').replace(/^﻿/, ''));
  assert.equal(manifest['clouds_real.png'], true, 'clouds_real.png 未登记进贴图清单');
  const png = readFileSync(new URL('../public/textures/clouds_real.png', import.meta.url));
  assert.equal(png.readUInt32BE(0), 0x89504e47, 'clouds_real.png 不是 PNG');
});

test('云层优先用真实日期云图，缺文件时回落合成图', () => {
  assert.ok(BODIES.earth.textures.cloudsReal, '地球贴图未声明真实云图');
  const src = read('src/scene/builder.js');
  assert.ok(/phys\.textures\?\.cloudsReal && cache\.has\(phys\.textures\.cloudsReal\)/.test(src),
    '未优先选真实云图');
  // 回落分支必须保留——真实云图是可选的增强，缺了不能让地球没有云
  assert.ok(/phys\.textures\?\.clouds && !phys\.textures\.cloudsOpaque/.test(src),
    '缺少回落合成云图的分支');
});

test('云层经纬度在体固系里算（否则云挂在惯性系不随自转）', () => {
  const src = read('src/scene/planetMaterial.js');
  const builder = read('src/scene/builder.js');
  // 云壳是球，绕球心旋转把球映到自身，片元的 vPosW 分布不随自转改变——
  // 直接用世界坐标求经纬度，云就挂在惯性系里，而且 atan 的分支割线落在
  // 世界系一条固定的圈上，表现为横穿盘面的缝（位置随相机变，极难归因）。
  assert.ok(/uniform mat3 uBodyInv;/.test(src), '缺少体固系逆旋转 uniform');
  assert.ok(/vec3 rel = uBodyInv \* \(q - uCenter\);/.test(src), 'latLonOf 未转到体固系');
  assert.ok(/uBodyInv: \{ value: new THREE\.Matrix3\(\) \}/.test(src), 'uniform 未初始化');
  assert.ok(/u\.uBodyInv\.value\.setFromMatrix4\(/.test(builder), 'builder 未写入 uBodyInv');
  assert.ok(/makeRotationFromQuaternion\(_bodyQ\.copy\(e\.mesh\.quaternion\)\.invert\(\)\)/.test(builder),
    'uBodyInv 不是 mesh.quaternion 的逆');
  // 足迹用的方向向量也必须在同一坐标系里，否则 east/north 会算错
  assert.ok(/vec3 relE = uBodyInv \* \(vPosW - uCenter\);/.test(src), '足迹未用体固系方向');
});

test('云贴图采样用自算足迹（反经线处的隐式导数会爆掉，取到最粗 mip）', () => {
  const src = read('src/scene/planetMaterial.js');
  // latLonOf 的 atan 在反经线有分支割线，uv.x 从 1 跳到 0，
  // 隐式 dFdx(uv.x) 在那一列像素上爆成巨值 → 最粗 mip → 一条点状缝（近景可见）
  assert.ok(/textureGrad\(uMap, cloudUV\(uv, uTime\), gx, gy\)/.test(src), '云层未用自算足迹');
  assert.ok(/textureGrad\(uMap, luv, gX, gY\)/.test(src), '轻量路径未用自算足迹');
  assert.ok(/vec2 cloudFootprint\(/.test(src), '缺少足迹函数');
  // 足迹必须由球面连续量（相对球心的位置）算，且只在均匀控制流里算一次——
  // 步进循环里有 continue/break，非均匀控制流下调 dFdx 是未定义行为
  assert.ok(/dFdx\(rel\)/.test(src) && /dFdy\(rel\)/.test(src), '足迹未基于球面连续量');
  const beforeLoop = src.slice(src.indexOf('vec2 gX = cloudFootprint'), src.indexOf('if (uVolumetric == 0)'));
  assert.ok(beforeLoop.length > 0 && !/for \(/.test(beforeLoop), '足迹应在步进循环之前算好');
});

test('体积云只在 High 档开启（代价实测 +27%，集显会被拖垮）', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/uVolumetric: \{ value: \(opts\.volumetric \?\? \(QUALITY\.tier === 'high' && QUALITY\.detail\)\)/.test(src),
    '档位门控缺失');
  assert.ok(/if \(uVolumetric == 0\)/.test(src), '缺少轻量回退路径');
  assert.ok(/cloudN: 10, cloudNL: 4/.test(read('src/engine/quality.js')), 'High 档云步进数不对');
});

// ── 批次 6：水面菲涅尔反射 ──────────────────────────────────────────────────

test('地形水面含菲涅尔环境反射（水的 F0 = 0.02）', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/float fres = 0\.02 \+ 0\.98 \* pow\(1\.0 - cosT, 5\.0\)/.test(src),
    '缺少 Schlick 菲涅尔（水的 F0 应为 0.02）');
  assert.ok(/vec3 refl = reflect\(-V, normal\)/.test(src), '缺少反射方向');
  assert.ok(/outgoingLight \+= skyCol \* fres/.test(src), '反射未叠加到出射光');
  assert.ok(/uniform vec3 uSunDir;/.test(src), '缺少体固系太阳方向 uniform');
});

test('水面的太阳方向以体固系传入（否则日落反射会错位）', () => {
  const terrain = read('src/scene/terrain.js');
  const main = read('src/main.js');
  assert.ok(/update\(dirLocal, timeSec = 0, sunDirLocal = null\)/.test(terrain), 'update 未接收太阳方向');
  assert.ok(/if \(sunDirLocal\) this\.uSunDir\.value\.copy\(sunDirLocal\)/.test(terrain), '未写入 uniform');
  assert.ok(/_sunLocal\.copy\(e\.mat\.userData\.uniforms\.uSunDir\.value\)\.applyQuaternion\(_q\)/.test(main),
    'main.js 未把世界太阳方向转到体固系');
});

// ── 批次 6：大气地面反照率反弹 ──────────────────────────────────────────────

test('大气含地面反照率反弹项（低空天光提亮的主因）', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(/uniform float uGroundAlbedo;/.test(src), '缺少 uGroundAlbedo 声明');
  assert.ok(/uGroundAlbedo: \{ value: a\.groundAlbedo \?\? 0\.0 \}/.test(src), 'uniform 未接线');
  assert.ok(/vec3 twoWay = exp\(-\(uBetaR \* odR \+ uBetaM \* 1\.1 \* odM\) \* 1\.5\)/.test(src),
    '缺少双程（下行+上行）光学深度近似');
  assert.ok(/\(0\.35 \+ 0\.65 \* below\)/.test(src), '缺少朝向地表以下的加权');
  assert.ok(/if \(uGroundAlbedo > 0\.0\)/.test(src), '缺少零值短路（气巨没有地面）');
});

test('极光只在夜面、卵带窄、气巨强度低（否则土星北极是一大块紫斑）', () => {
  const src = read('src/scene/atmosphere.js');
  // 白昼面必须完全归零。旧实现留 4% 残余——单看很弱，但它是沿视线逐采样点累加的，
  // 十几个采样点叠起来就是土星北极那块显眼的紫斑。
  assert.ok(/if \(!shadowed\) auroraInt = 0\.0;/.test(src), '白昼面极光未归零');
  assert.ok(!/if \(!shadowed\) auroraInt \*= 0\.04;/.test(src), '4% 白昼泄漏仍在');
  // 卵带要窄：真实极光卵 3–6° 宽（地球），气巨更窄；旧版是 26° 宽的极冠
  assert.ok(/float ovalC, ovalW, aGain;/.test(src), '缺少逐天体卵带参数');
  assert.ok(/smoothstep\(ovalC - ovalW, ovalC, poleProx\)/.test(src), '卵带未按参数收窄');
  assert.ok(!/smoothstep\(0\.80, 0\.90, poleProx\)/.test(src), '旧的 26° 宽极冠仍在');
  // 气巨强度：土星 H3+ 是紫外/红外，可见光下几乎不该有
  const gain = (mode) => {
    const m = new RegExp(`uAuroraMode == ${mode}\\)[^}]*aGain = ([0-9.]+)`).exec(src);
    return m ? Number(m[1]) : NaN;
  };
  assert.ok(gain(1) > 0.8, '地球极光是真实可见现象，不该被压低');
  assert.ok(gain(3) < 0.1, `土星极光强度 ${gain(3)} 过高（可见光下几乎不该有）`);
  assert.ok(gain(2) < gain(1), '木星极光应弱于地球');
});

test('地面反照率反弹按"地面是否受照"加权（否则夜空被照亮）', () => {
  const src = read('src/scene/atmosphere.js');
  // 这一项原本完全没有昼夜判定，于是反日点上空仍被 uSunI × groundAlbedo 照亮。
  // 实测：夜空均值 RGB 24/42/53，关掉大气后只有 0.2/0.3/0.9——夜空的亮度
  // 几乎全部来自这一项；真实夜空没有直射光可反，应当接近全黑。
  assert.ok(/float odRlit = 0\.0;/.test(src), '缺少受照地面的累积量');
  assert.ok(/odRlit \+= smoothstep\(-0\.10, 0\.10, dot\(uSunDir, normalize\(p - uCenter\)\)\) \* dR \* ds;/.test(src),
    '未按采样点自身的本地垂线判定是否受照');
  assert.ok(/float groundLit = odR > 1e-6 \? odRlit \/ odR : 0\.0;/.test(src), '缺少受照占比');
  assert.ok(/\* \(1\.0 \/ PI\) \* groundLit;/.test(src), '受照占比未进入最终着色');
  // 用采样点自身而非相机的本地垂线：这样地表视角与轨道视角都自然成立
  assert.ok(!/uGroundAlbedo \* twoWay \* \(0\.35 \+ 0\.65 \* below\) \* msFrac \* \(1\.0 \/ PI\);\n/.test(src),
    '地面反弹仍是无条件的');
});

test('地面反照率只给有固体表面或云顶的天体', () => {
  assert.ok(BODIES.earth.atmosphere.groundAlbedo > 0.05, '地球应有海陆反照率');
  assert.ok(BODIES.mars.atmosphere.groundAlbedo > BODIES.earth.atmosphere.groundAlbedo,
    '火星（沙尘覆盖）反照率应高于以海洋为主的地球');
  assert.ok(BODIES.venus.atmosphere.groundAlbedo > 0.5, '金星可见面是硫酸云顶，反照率很高');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) {
    const g = BODIES[id]?.atmosphere?.groundAlbedo ?? 0;
    assert.equal(g, 0, `${id} 没有固体表面，不应有地面反弹（实际 ${g}）`);
  }
});

// ── 批次 10：音频层 ─────────────────────────────────────────────────────────

test('音频引擎含引擎、再入与着陆冲击三层', () => {
  const src = read('src/engine/audio.js');
  assert.ok(/this\._engine = this\._createNoiseLayer\(this\._pinkBuf, 'lowpass', 90, 0\)/.test(src),
    '缺少引擎/推进器层');
  assert.ok(/this\._reentry = this\._createNoiseLayer\(this\._whiteBuf, 'bandpass', 620, 0\)/.test(src),
    '缺少再入层');
  assert.ok(/playLandingImpact\(strength = 0\.5\)/.test(src), '缺少着陆冲击音');
  // 再入强度 ∝ 密度 × 速度²（与动压 q = ½ρv² 同量级）
  assert.ok(/reentryTarget = dens \* vFrac \* vFrac \* 0\.22/.test(src),
    '再入强度未按动压量级（密度×速度²）建模');
});

test('音效状态在 HUD 上可见（默认静音但必须能发现怎么开）', () => {
  const hud = read('src/ui/hud.js');
  const i18n = read('src/ui/i18n.js');
  const main = read('src/main.js');
  assert.ok(/audioOn/.test(hud), 'HUD 未显示音效状态');
  assert.ok(/'hud\.audioOn'/.test(i18n) && /'hud\.audioOff'/.test(i18n), '缺少音效状态文案');
  assert.ok(/audioOn: audioEngine\?\.enabled/.test(main), '未把状态传给 HUD');
  assert.ok(/tip\.audioOn/.test(main), '切换音效时没有反馈提示');
});

// ── 批次 11：真实星表 ───────────────────────────────────────────────────────
//
// 这一组测的是**数据本身**，不是合成器。此前星场是"132 颗手写亮星 + 11900 颗
// 虚构背景星"，而手写表后半段把前面的星按坐标回收复制、只改星等（天狼星出现两次、
// 星等 −1.46 与 2.95 并存），专名也大量错位。测试当时只断言了合成器的分布形状，
// 对"星表是假的"这件事完全无感——所以现在直接对真实星表下断言。

const STAR_BIN = readFileSync(new URL('../public/data/stars.bin', import.meta.url));

test('星表二进制可解析，规模与生成时一致', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  assert.ok(cat, 'stars.bin 解析失败');
  assert.equal(cat.count, CATALOG_COUNT, '星表规模与 stars.generated.js 记录的不一致');
  assert.ok(cat.count > 9000, `只有 ${cat.count} 颗，BSC5 应有 9096 颗`);
  for (let i = 0; i < cat.count; i++) {
    assert.ok(cat.ra[i] >= 0 && cat.ra[i] < 360, `第 ${i} 颗赤经越界 ${cat.ra[i]}`);
    assert.ok(cat.dec[i] >= -90.1 && cat.dec[i] <= 90.1, `第 ${i} 颗赤纬越界 ${cat.dec[i]}`);
    assert.ok(cat.mag[i] > -2 && cat.mag[i] < 8, `第 ${i} 颗星等越界 ${cat.mag[i]}`);
  }
});

test('拒绝坏数据而不是猜：magic / 版本 / 长度任一不对都返回 null', () => {
  const buf = STAR_BIN.buffer.slice(STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength);
  const bad1 = buf.slice(0); new DataView(bad1).setUint8(0, 0x58);
  assert.equal(parseStarCatalog(bad1), null, 'magic 不对时应拒绝');
  const bad2 = buf.slice(0); new DataView(bad2).setUint16(4, 99, true);
  assert.equal(parseStarCatalog(bad2), null, '版本不认识时应拒绝');
  assert.equal(parseStarCatalog(buf.slice(0, 40)), null, '长度不足时应拒绝');
  assert.equal(parseStarCatalog(new ArrayBuffer(4)), null, '太短时应拒绝');
});

test('标志星的位置与实测一致（列号错位会立刻暴露）', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  // 期望值取自 BSC5 本身（自检脚本 tools/fetch-stars.mjs 也核这几颗）
  const expect = [
    ['天狼星 Sirius', 101.287, -16.716, -1.46],
    ['织女一 Vega', 279.234, 38.784, 0.03],
    ['北极星 Polaris', 37.955, 89.264, 2.02],
    ['参宿七 Rigel', 78.634, -8.202, 0.12],
  ];
  for (const [name, ra, dec, mag] of expect) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < cat.count; i++) {
      const d = Math.hypot(cat.ra[i] - ra, cat.dec[i] - dec);
      if (d < bestD) { bestD = d; best = i; }
    }
    assert.ok(bestD < 0.02, `${name} 未在星表中找到（最近 ${bestD.toFixed(3)}°）`);
    assert.ok(Math.abs(cat.mag[best] - mag) < 0.1, `${name} 星等 ${cat.mag[best]} 与实测 ${mag} 不符`);
  }
});

test('累积星数符合全天实测（填充表绝对过不了这一关）', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  // 全天实测累积星数（经典数值，各星表一致）：
  //   V≤1: 15   V≤2: 48   V≤3: 171   V≤4: 513   V≤5: 1602   V≤6: ~5000
  // 手写表那种"把前面的星按坐标回收复制、只把星等往上调"的填充法，
  // 会让每一档都严重超标——这是比"查重"可靠得多的判据。
  const expect = [[1, 15], [2, 48], [3, 171], [4, 513], [5, 1602], [6, 5000]];
  for (const [m, want] of expect) {
    let n = 0;
    for (let i = 0; i < cat.count; i++) if (cat.mag[i] <= m) n++;
    assert.ok(Math.abs(n - want) <= want * 0.2,
      `V≤${m} 有 ${n} 颗，全天实测约 ${want} 颗（差 ${((n / want - 1) * 100).toFixed(0)}%）`);
  }
});

test('坐标重合的星只是密近双星分量，占比极小', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  const seen = new Set();
  let dup = 0;
  for (let i = 0; i < cat.count; i++) {
    const k = `${cat.ra[i].toFixed(3)}/${cat.dec[i].toFixed(3)}`;
    if (seen.has(k)) dup++;
    seen.add(k);
  }
  // BSC5 里确有密近双星的两个分量各自成条、位置在 0.001° 内重合
  // （如参宿三 δ Ori V=2.05 与其 V=4.21 的伴星）。所以判据是"极少"而不是"零"：
  // 实测 17 组 / 9096 颗 = 0.19%；填充表会是几十个百分点。
  assert.ok(dup / cat.count < 0.01,
    `${dup} 颗与别的星坐标重合（${((dup / cat.count) * 100).toFixed(1)}%），远超密近双星的量级`);
});

test('真实星表本身向银道面集中（银河是一条带，这是数据的性质而非拟合出来的）', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  // 银极 J2000：RA 192.8595°, Dec 27.1284°
  const D = Math.PI / 180;
  const ra0 = 192.8595 * D, dec0 = 27.1284 * D;
  const nx = Math.cos(dec0) * Math.cos(ra0), ny = Math.cos(dec0) * Math.sin(ra0), nz = Math.sin(dec0);
  let near = 0, far = 0;
  for (let i = 0; i < cat.count; i++) {
    const ra = cat.ra[i] * D, dec = cat.dec[i] * D;
    const sinB = Math.abs(Math.cos(dec) * Math.cos(ra) * nx
      + Math.cos(dec) * Math.sin(ra) * ny + Math.sin(dec) * nz);
    if (sinB < Math.sin(12 * D)) near++;
    if (sinB > Math.sin(60 * D)) far++;
  }
  const nearFrac = near / cat.count, farFrac = far / cat.count;
  // 球面均匀时 |b|<12° 应占 1−cos12° ≈ 2.2%，|b|>60° 应占 50%
  assert.ok(nearFrac > 0.08, `银道面附近仅 ${(nearFrac * 100).toFixed(1)}%，不像真实星空`);
  assert.ok(farFrac < 0.32, `高银纬 ${(farFrac * 100).toFixed(1)}%，接近球面均匀`);
});

test('B−V → RGB：蓝星确实比红星蓝，且归一化不影响亮度关系', () => {
  const blue = bvToRgb(-0.3), white = bvToRgb(0.5), red = bvToRgb(1.8);
  assert.ok(blue[2] > blue[0], 'B−V=−0.3 应是蓝星（B 通道应高于 R）');
  assert.ok(red[0] > red[2], 'B−V=1.8 应是红星（R 通道应高于 B）');
  assert.ok(white[0] > 0.8 && white[2] > 0.8, 'B−V=0.5（太阳色）应接近白');
  for (const c of [blue, white, red]) {
    assert.ok(Math.abs(Math.max(...c) - 1) < 1e-9, '应归一化到最大分量为 1');
    assert.ok(c.every((x) => x >= 0 && x <= 1), '分量应在 [0,1]');
  }
});

test('星等→强度服从 Pogson 定义（每 5 等差 100 倍）', () => {
  assert.ok(Math.abs(magToIntensity(0) - 1) < 1e-12);
  assert.ok(Math.abs(magToIntensity(5) / magToIntensity(0) - 0.01) < 1e-12, '差 5 等应差 100 倍');
  assert.ok(magToIntensity(-1.46) > magToIntensity(0.03), '天狼星应亮于织女星');
  assert.ok(magToIntensity(6) < magToIntensity(1), '暗星强度应更低');
});

test('星场源码确实用真实星表，且没有残留的虚构星', () => {
  const src = read('src/scene/starfield.js');
  assert.ok(/import \{ bvToRgb, magToDisplayIntensity \} from '\.\.\/astro\/starCatalog\.js'/.test(src),
    '未接入真实星表');
  // 显示强度必须走感知压缩：纯 Pogson 会让 6 等星（比 0 等暗 250 倍）
  // 在 8 位帧缓冲上直接掉到不可见，地面抬头只剩零星几个点
  assert.ok(/magToDisplayIntensity\(mag\)/.test(src), '星等未经过感知压缩');
  assert.ok(!/0\.9 \* magToIntensity\(mag\)/.test(src), '仍在直接用物理通量当显示亮度');
  assert.ok(/function setCatalog\(cat\)/.test(src), '缺少星表填充入口');
  assert.ok(/cat\.ra\[i\] \* DEG, cat\.dec\[i\] \* DEG/.test(src), '未按赤经赤纬定位');
  // 虚构背景星与手写亮星表都必须已经删掉
  assert.ok(!/BRIGHT_STARS/.test(src), '手写亮星表仍有残留');
  assert.ok(!/STAR_COLORS/.test(src), '离散色档仍有残留');
  assert.ok(!/Math\.pow\(1 - u \* 0\.999/.test(src), '虚构背景星的幂律抽样仍在');
  assert.ok(!/11000/.test(src), '虚构背景星仍在生成');
  // 标签必须每颗星各自持有方向——共用一个临时向量会让所有标签指向最后一颗
  const main = read('src/main.js');
  assert.ok(/const dirWorld = raDecToWorld\(/.test(main), '标签方向未按星各自持有');
  assert.ok(/getRelPos: \(v\) => v\.copy\(dirWorld\)/.test(main), '标签仍闭包共享方向向量');
});

// ── 批次 8：小天体形状 ──────────────────────────────────────────────────────

test('妊神星按三轴椭球渲染（说明里写着"橄榄球形"，画面不能是正球）', () => {
  const haumea = TNO_DATA.haumea;
  assert.ok(Array.isArray(haumea.axes) && haumea.axes.length === 3, '缺少三轴半轴');
  const [a, b, c] = haumea.axes;
  assert.ok(a > b && b > c, `半轴应满足 a > b > c，实际 ${a}/${b}/${c}`);
  // 自转周期 3.9 小时把它是拉扁的：长短轴比应显著大于 1
  assert.ok(a / c > 1.8, `长短轴比 ${(a / c).toFixed(2)} 不足以体现"橄榄球形"`);
  // radiusKm 应是三轴的几何平均（等体积球）——高度/距离/碰撞都用它，
  // 用长轴或平均算术值会让物理与形状对不上
  const geoMean = Math.cbrt(a * b * c);
  assert.ok(Math.abs(haumea.radiusKm - geoMean) / geoMean < 0.01,
    `radiusKm ${haumea.radiusKm} 不是三轴几何平均 ${geoMean.toFixed(1)}`);
  const src = read('src/scene/tnoScene.js');
  assert.ok(/if \(d\.axes\) \{/.test(src), '渲染器未处理三轴形状');
  assert.ok(/mesh\.scale\.set\(a \/ R, c \/ R, b \/ R\)/.test(src),
    '短轴应对应体固系 +Y（极轴）');
  // 说明文字里的尺寸要与半轴一致（2320×1700×1030 ≈ 2a×2b×2c）
  assert.ok(/2320×1700×1030/.test(haumea.desc), '说明文字里的尺寸与半轴不一致');
});

test('其余海外天体保持正球（没有实测形状的不要编）', () => {
  for (const [id, d] of Object.entries(TNO_DATA)) {
    if (id === 'haumea') continue;
    assert.ok(!d.axes, `${id} 凭空给了三轴形状——没有实测形状就保持正球`);
  }
});

// ── 批次 6：行星环系 ────────────────────────────────────────────────────────

test('四颗巨行星都有环，且内半径不小于母星半径', () => {
  const R = { jupiter: 71492, saturn: 60268, uranus: 25362, neptune: 24764 };
  for (const [id, rKm] of Object.entries(R)) {
    const r = BODIES[id].rings;
    assert.ok(r, `${id} 缺少环系`);
    assert.ok(r.innerKm > rKm, `${id} 环内半径 ${r.innerKm} 不应小于母星半径 ${rKm}`);
    assert.ok(r.outerKm > r.innerKm, `${id} 环外半径应大于内半径`);
  }
});

test('环系按单层粒子的 Seeliger 定律受光（不是与视角无关的常数）', () => {
  const src = read('src/scene/rings.js');
  // vNormalW 是**环面法向**（整环相同），所以旧写法 max(ndl,0)+… 算出来是个常数：
  // 环的亮度不随观察仰角变化，也没有相位角依赖——丢掉的正是环系最著名的两个
  // 光变特征（侧视增亮、冲日增亮）。
  assert.ok(/float mu0 = abs\(dot\(nrm, uSunDir\)\);/.test(src), '缺少太阳在环面上的仰角');
  assert.ok(/float mu = abs\(dot\(nrm, toCam\)\);/.test(src), '缺少观察者在环面上的仰角');
  assert.ok(/float seeliger = mu0 \/ max\(mu0 \+ mu, 1e-4\);/.test(src), '缺少 Seeliger 定律 μ0/(μ0+μ)');
  assert.ok(!/float lit = max\(ndl, 0\.0\) \+ pow\(max\(-ndl, 0\.0\), 0\.7\)/.test(src),
    '旧的"常数受光"仍在');
  // 冲日增亮：相位角趋零时相干背散射 + 阴影隐藏，环显著变亮
  assert.ok(/float surge = 1\.0 \+ 0\.5 \* exp\(-\(1\.0 - cosA\) \* 25\.0\);/.test(src),
    '缺少冲日增亮');
  // 前向散射必须并入 phase，不能另起一项重复计（旧实现另有一处 pow(...,8)*2.5）
  assert.ok(/0\.9 \* pow\(max\(-cosA, 0\.0\), 3\.0\)/.test(src), '缺少前向散射项');
  assert.ok(!/float fwd = pow\(max\(dot\(viewRay, uSunDir\), 0\.0\), 8\.0\)/.test(src),
    '前向散射被重复计算了两处');
});

test('环自阴影：环挡环（卡西尼在环系高开角拍到的暗带）', () => {
  const src = read('src/scene/rings.js');
  // 旧实现只有"行星本影投在环上"，没有"环挡环自己"
  assert.ok(/vec3 sunInPlane = uSunDir - nrm \* dot\(uSunDir, nrm\);/.test(src),
    '缺少太阳方向在环面内的投影');
  assert.ok(/for \(int i = 1; i <= 10; i\+\+\)/.test(src), '缺少环面内径向步进');
  assert.ok(/uRingInner/.test(src) && /uRingOuter/.test(src), '缺少内外半径 uniform');
  // 必须归一化成无量纲：tau 是"沿程累计的 τ×Δr"，直接乘系数会因 Δr 是几千公里而爆掉
  assert.ok(/tau \/= max\(rSpan, 1\.0\);/.test(src), 'tau 未按环跨度归一化');
  // 必须限幅：环挡环是十几到几十个百分点的调制，不该把整条环吃掉
  assert.ok(/shadow \*= 1\.0 - 0\.35 \* \(1\.0 - exp\(-tau \* 1\.2/.test(src),
    '自阴影未限幅——会衰减到把环系整体变灰');
});

test('近地地面必须有可见质感（否则落地是一片平板）', () => {
  const src = read('src/scene/terrain.js');
  // 实测：修前近地亮度只跨 8 级、相邻像素差 0.106——看上去是一张干净的平板。
  // 两个原因：① 值噪声方差很小（σ≈0.12），把加权和直接当亮度用只有 ±7% 起伏；
  // ② vObjPos 是天体本地坐标（km），×420 以上的哈希自变量在离噪声原点几十公里处
  //    已达 10^4–10^6，fp32 下 sin 的自变量误差超过周期，越高频越先退化成常数。
  assert.ok(/clamp\(1\.0 \+ 2\.2 \* \(nsum - 0\.5\), 0\.62, 1\.38\)/.test(src),
    '缺少带增益且限幅的地面亮度调制');
  assert.ok(/tnoise2\(vObjPos \* 90\.0 \+ vec3\(7\.3, 2\.1, 5\.7\)\)/.test(src),
    '缺少坐标安全的中尺度（约 11 m）细节档');
  assert.ok(!/float dm = 0\.78 \+ 0\.46 \*/.test(src), '旧的弱调制仍在');
});

test('亮冰卫星的单元反照率与底色都要对上实测几何反照率', () => {
  // 土卫一实测几何反照率 0.962（太阳系最高）、土卫四 0.998、土卫二 0.99、
  // 土卫五 0.95——但它们此前 w 只给 0.65–0.92、底色用中灰 [120,118,116]，
  // 从轨道看是暗球。这是星球级视角不逼真最直接的一条。
  const REF = { mimas: 0.962, dione: 0.998, enceladus: 0.99, rhea: 0.95, tethys: 0.80 };
  for (const [id, geo] of Object.entries(REF)) {
    const w = HAPKE_PARAMS[id]?.w;
    assert.ok(w !== undefined, `${id} 缺少 Hapke 参数`);
    // 单元反照率 w 应不低于几何反照率太多（Hapke 下 w→1 时几何反照率才接近 1）
    assert.ok(w >= geo * 0.9, `${id}: w=${w} 远低于实测几何反照率 ${geo}`);
    const base = PRESETS[MOON_PHYS[id].surface.palette].base;
    const lum = (base[0] * 0.299 + base[1] * 0.587 + base[2] * 0.114);
    assert.ok(lum > 170, `${id} 底色亮度 ${lum.toFixed(0)} 太低（实测反照率 ${geo}）`);
  }
});

test('每颗卫星都有自己的地表底色（不能都落在同一个 gray 上）', () => {
  // 扩充批次加的 28 颗卫星一开始全部用 palette:'gray'，从轨道看是同一种灰色噪声球。
  // 它们没有贴图，但反照率与色调是有实测值的——按现有资料合理生成就落在这里。
  const NEW = ['amalthea','thebe','metis','adrastea','hyperion','phoebe','janus','epimetheus',
    'prometheus','pandora','pan','cordelia','ophelia','bianca','cressida','desdemona',
    'juliet','portia','rosalind','belinda','puck','nereid','naiad','thalassa','despina',
    'galatea','larissa','proteus'];
  const gray = NEW.filter((id) => (MOON_PHYS[id]?.surface?.palette ?? 'gray') === 'gray');
  assert.equal(gray.length, 0, `${gray.length} 颗新卫星仍用 gray：${gray.join(' ')}`);
  // 每个引用到的预设都必须存在，否则静默回落到 gray
  const missing = [];
  for (const [id, m] of Object.entries(MOON_PHYS)) {
    const pal = m.surface?.palette;
    if (pal && !PRESETS[pal]) missing.push(`${id}→${pal}`);
  }
  assert.equal(missing.length, 0, `引用了不存在的预设：${missing.join(' ')}`);
  // 底色档数：新卫星应显著拉开花样，而不是挤在少数几档
  const bases = new Set(NEW.map((id) => PRESETS[MOON_PHYS[id].surface.palette].base.join(',')));
  assert.ok(bases.size >= 6, `28 颗新卫星只用了 ${bases.size} 种底色，区分度不足`);
});

test('木星与海王星的暗环用极低弥漫基底（不能套用天王星的 0.03）', () => {
  assert.ok((BODIES.jupiter.rings.diffuse ?? 0.03) < 0.01,
    '木星环光学深度 ~10⁻⁶，弥漫基底必须极低，否则会假亮成第二条土星环');
  assert.ok((BODIES.neptune.rings.diffuse ?? 0.03) < 0.01, '海王星环同样极暗');
  assert.ok((BODIES.uranus.rings.diffuse ?? 0.03) >= 0.02, '天王星环相对亮，应保留默认基底');
});

test('木星环分层与真实结构一致（Halo / Main / 两条 Gossamer）', () => {
  const n = BODIES.jupiter.rings.narrow;
  assert.equal(n.length, 4, '木星环应为 4 层');
  // Main 层（1.72–1.81 R_J ≈ 126,000 km）是木星环里最亮的一层
  const main = n.reduce((a, b) => (b[2] > a[2] ? b : a));
  assert.ok(Math.abs(main[0] - 126000) < 3000, `最亮层应在 Main 环附近，实际 ${main[0]}`);
});

test('海王星环含五条命名环（Galle/Le Verrier/Lassell/Arago/Adams）', () => {
  const n = BODIES.neptune.rings.narrow;
  assert.equal(n.length, 5);
  const radii = n.map((x) => x[0]).sort((a, b) => a - b);
  assert.ok(Math.abs(radii[0] - 41900) < 200, 'Galle 环应在 41,900 km');
  assert.ok(Math.abs(radii[4] - 62930) < 200, 'Adams 环应在 62,930 km');
});

// ── 月球天平动 ──────────────────────────────────────────────────────────────

test('月球走 IAU 自转模型而非硬潮汐锁定（天平动的前提）', () => {
  const rot = read('src/astro/rotation.js');
  const builder = read('src/scene/builder.js');
  assert.ok(/moon:\s*\[269\.9949, 0\.0031, 66\.5392, 0\.0130, 38\.3213, 13\.17635815\]/.test(rot),
    '缺少月球 IAU 2015 自转常数');
  assert.ok(/if \(!e\.isMoon \|\| id === 'moon'\)/.test(builder),
    '月球仍走硬潮汐锁定——天平动不会出现，可见面会永远是 50%');
});

// ── 日食阴影 ────────────────────────────────────────────────────────────────

test('日食遮蔽在接收体着色器内逐片元计算（而非只插一个黑锥网格）', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/uniform int uEclOn;/.test(src) && /uniform vec3 uEclPos;/.test(src), '缺少日食 uniform');
  assert.ok(/float aOcc = asin\(clamp\(uEclR \/ dOcc/.test(src), '缺少遮挡体角半径');
  assert.ok(/float aSun = asin\(clamp\(SUN_RADIUS_KM \/ max\(uSunDistKm/.test(src), '缺少太阳角半径');
  // 重叠下界必须是 |aOcc−aSun|：写成 aSun−aOcc 时，遮挡体角半径远大于太阳
  // （木星遮木卫，9.6° vs 0.05°）正对时只给 50%，而物理上是全遮。
  assert.ok(/float lo = abs\(aOcc - aSun\)/.test(src),
    '重叠下界应为 |aOcc−aSun|（写成 aSun−aOcc 会让大角径遮挡体只给 50%）');
  assert.ok(/float cover = 1\.0 - smoothstep\(lo, hi, sep\)/.test(src),
    '缺少两圆盘重叠的遮蔽判据');
  assert.ok(/uSunI \* ringSh \* cloudShadow \* eclSh/.test(src), '遮蔽未进入最终着色');
  // 除零保护：片元与遮挡体重合时不能出 NaN
  assert.ok(/max\(length\(toOcc\), 1\.0\)/.test(src), '缺少与遮挡体重合时的除零保护');
});

test('日食遮挡体既在地球侧设置（日食）也在月球侧设置（月食），且每帧先清除', () => {
  const src = read('src/scene/eclipses.js');
  assert.ok(/pushOccluder\(earth, moon, camPosKm, distTo\(earth\)\)/.test(src), '缺少日食遮挡体');
  assert.ok(/pushOccluder\(moon, earth, camPosKm, distTo\(moon\)\)/.test(src), '缺少月食遮挡体');
  assert.ok(/pushOccluder\(bodies\.get\(id\), null, camPosKm, 1\)/.test(src),
    '缺少每帧清除——食结束后阴影会永久留在表面上');
});

// ── 批次 12：可访问性 ───────────────────────────────────────────────────────

test('缩放未被禁用（WCAG 1.4.4）', () => {
  for (const f of ['index.html', 'en/index.html']) {
    const html = read(f);
    const vp = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? '';
    assert.ok(vp, `${f} 缺少 viewport`);
    assert.ok(!/user-scalable\s*=\s*no/.test(vp), `${f} 仍禁用缩放`);
    assert.ok(!/maximum-scale\s*=\s*1\b/.test(vp), `${f} 仍把最大缩放锁在 1`);
  }
});

test('焦点样式与 aria-live 播报区存在', () => {
  const css = read('src/style.css');
  assert.ok(/:focus-visible\s*\{/.test(css), '缺少 :focus-visible——纯键盘用户看不到焦点在哪');
  assert.ok(/\.sr-only\s*\{/.test(css), '缺少屏幕阅读器专用文本类');
  for (const f of ['index.html', 'en/index.html']) {
    assert.ok(/aria-live="polite"/.test(read(f)), `${f} 的提示条缺少 aria-live`);
  }
});

test('prefers-reduced-motion 在 CSS 与 JS 两侧都生效', () => {
  const css = read('src/style.css');
  assert.ok(/animation-duration: 0\.001ms !important/.test(css),
    'CSS 只关了启动页动画——界面过渡仍会动');
  const cfg = read('src/config.js');
  assert.ok(/export function prefersReducedMotion/.test(cfg), '缺少共享查询');
  // JS 驱动的相机动画 CSS 管不到，必须在 JS 里判
  const cam = read('src/engine/orbitCamera.js');
  assert.ok(/if \(prefersReducedMotion\(\)\) dur = 0\.01;/.test(cam),
    '飞行动画未受 reduced-motion 影响');
  assert.ok(/const damp = prefersReducedMotion\(\) \? 0 : /.test(cam),
    '拖拽惯性未受 reduced-motion 影响');
  const feel = read('src/engine/cameraFeel.js');
  assert.ok(/if \(prefersReducedMotion\(\)\) \{/.test(feel), '相机语言未受 reduced-motion 影响');
});

// ── 批次 12：离线能力 ───────────────────────────────────────────────────────

test('Service Worker 存在且在应用里注册（PWA 清单此前是空壳）', () => {
  const sw = read('public/sw.js');
  assert.ok(/self\.addEventListener\('fetch'/.test(sw), 'SW 未拦截 fetch');
  assert.ok(/req\.mode === 'navigate'/.test(sw), '缺少导航请求的网络优先策略');
  assert.ok(/caches\.match\(req\)/.test(sw), '缺少缓存优先的静态资源策略');
  assert.ok(/trimCache\(ASSETS, MAX_ASSETS\)/.test(sw), '缺少条目上限——缓存会无界增长');
  assert.ok(/self\.skipWaiting\(\)/.test(sw), '缺少 skipWaiting');
  const main = read('src/main.js');
  assert.ok(/serviceWorker\.register\('sw\.js'\)/.test(main), '应用未注册 SW');
  // file:// 打开（教师工具包建议的 U 盘用法）没有 serviceWorker，必须能跳过
  assert.ok(/location\.protocol === 'https:'/.test(main), '注册未做协议判断');
});

// ── 透明双面材质必须单遍渲染 ────────────────────────────────────────────────
// three r165（three.module.js:29185）对 transparent && DoubleSide && !forceSinglePass
// 的材质会拆成 BackSide + FrontSide 两遍渲染。对双面共面的单层几何，这会把有效
// alpha 变成 1-(1-a)²（环的光学深度翻倍），对加色混合是亮度翻倍（日球层辉光），
// 对地形则是把全场景最重的片元着色器白跑一遍。atmosphere.js 早就知道这个坑，
// 这三处漏了。

test('环材质为单遍渲染（否则光学深度翻倍）', async () => {
  const { createRings } = await import('../src/scene/rings.js');
  const rings = createRings({ rings: { innerKm: 74500, outerKm: 140220, tint: [1, 1, 1], opacity: 1 } }, null);
  const mats = [];
  rings.traverse?.((o) => { if (o.material) mats.push(o.material); });
  if (!mats.length && rings.material) mats.push(rings.material);
  assert.ok(mats.length > 0, '未取到环材质');
  for (const m of mats) {
    if (m.transparent && m.side === 2 /* DoubleSide */) {
      assert.equal(m.forceSinglePass, true, '环材质缺少 forceSinglePass');
    }
  }
});

test('日球层材质为单遍渲染（否则加色辉光叠加两次）', async () => {
  const { createHeliosphere } = await import('../src/scene/heliosphere.js');
  const h = createHeliosphere();
  const mats = [];
  h.traverse((o) => { if (o.material) mats.push(o.material); });
  assert.ok(mats.length > 0, '未取到日球层材质');
  for (const m of mats) {
    if (m.transparent && m.side === 2) {
      assert.equal(m.forceSinglePass, true, '日球层材质缺少 forceSinglePass');
    }
  }
});

test('地形材质为单遍渲染（否则最重的片元着色器白跑一遍）', async () => {
  const { makeTerrainMaterial } = await import('../src/scene/terrain.js');
  const mat = makeTerrainMaterial({ value: null }, { value: 0 }, { value: 1 }, 0, 6371, { value: 1 }, { value: null });
  assert.equal(mat.transparent, true);
  assert.equal(mat.side, 2, '地形应为 DoubleSide（水下仰望可见海面）');
  assert.equal(mat.forceSinglePass, true, '地形材质缺少 forceSinglePass');
});

test('全部透明双面材质（除 atmosphere 已显式处理）都设了 forceSinglePass', () => {
  for (const f of ['src/scene/rings.js', 'src/scene/heliosphere.js', 'src/scene/terrain.js']) {
    assert.match(read(f), /forceSinglePass:\s*true/, `${f} 未设 forceSinglePass`);
  }
});

// ── 食：判据必须是真实几何遮挡，且不能再往场景里插锥体网格 ────────────────────
// 旧实现有两个问题：① 判据是"三体共线度 > 0.999"（2.56°），在六个月的窗口里
// 绝大多数命中的其实是"下一次朔/望"，并不成食；② 场景里插了一个黑色锥体网格，
// 用 MultiplyBlending（three 里忽略片元 alpha）把帧缓冲乘成纯黑，在夜面表现为
// 硬边黑色矩形；且 ConeGeometry 的 uv.x 是方位角不是半径，"半影"成了绕锥条纹。

test('isEclipse 能判出真实日全食（2026-08-12）与真实月食，且不误判普通朔望', async () => {
  const { isEclipse } = await import('../src/scene/eclipses.js');
  const { planetPosition } = await import('../src/astro/planets.js');
  const { moonGeocentric } = await import('../src/astro/moon.js');
  const { dateToJD } = await import('../src/astro/time.js');

  const pos = (jd) => {
    const e = planetPosition('earth', jd);
    const mg = moonGeocentric(jd);
    return {
      sun: [0, 0, 0],
      earth: [e.x, e.y, e.z],
      moon: [e.x + mg.x, e.y + mg.y, e.z + mg.z],
    };
  };
  const R_SUN = 695700, R_EARTH = 6371, R_MOON = 1737.4;

  // 2026-08-12 是一次真实的日全食（冰岛/西班牙可见）
  const jdEcl = dateToJD(new Date(Date.UTC(2026, 7, 12, 17, 46)));
  assert.equal(isEclipse('solar', pos(jdEcl), R_SUN, R_EARTH, R_MOON), true,
    '2026-08-12 应判为日食');

  // 日食后约 7 天是上弦，几何上不可能成食
  assert.equal(isEclipse('solar', pos(jdEcl + 7), R_SUN, R_EARTH, R_MOON), false,
    '上弦不应判为日食');
  // 日食后约 14.8 天是望（可能成月食，但不是日食）
  assert.equal(isEclipse('solar', pos(jdEcl + 14.77), R_SUN, R_EARTH, R_MOON), false,
    '望不应判为日食');
});

test('getNextEclipse 找到的下一次日食与真实日期一致，且不卡主线程', async () => {
  const { EclipseSystem } = await import('../src/scene/eclipses.js');
  const { planetPosition } = await import('../src/astro/planets.js');
  const { moonGeocentric } = await import('../src/astro/moon.js');
  const { dateToJD, jdToDate } = await import('../src/astro/time.js');
  const sys = new EclipseSystem();
  const getPositions = (jd) => {
    const e = planetPosition('earth', jd);
    const mg = moonGeocentric(jd);
    return { sun: [0, 0, 0], earth: [e.x, e.y, e.z], moon: [e.x + mg.x, e.y + mg.y, e.z + mg.z] };
  };
  const from = dateToJD(new Date(Date.UTC(2026, 5, 1)));   // 2026-06-01
  const t0 = Date.now();
  const jd = sys.getNextEclipse('solar', from, getPositions);
  const ms = Date.now() - t0;
  assert.ok(jd, '应找到下一次日食');
  const d = jdToDate(jd);
  assert.equal(d.getUTCFullYear(), 2026, `应落在 2026 年，实际 ${d.toISOString()}`);
  assert.equal(d.getUTCMonth(), 7, `应是 8 月（2026-08-12 日全食），实际 ${d.toISOString()}`);
  assert.ok(ms < 5000, `搜索不应卡主线程，实际 ${ms} ms`);
});

test('食系统不再往场景里插锥体网格（夜面硬边黑矩形的成因）', async () => {
  const { EclipseSystem } = await import('../src/scene/eclipses.js');
  const src = read('src/scene/eclipses.js');
  // 注释里会提到这两个名字（说明历史成因），所以只禁"实际使用"
  assert.ok(!/new THREE\.ConeGeometry/.test(src), '不应再创建 ConeGeometry');
  assert.ok(!/THREE\.MultiplyBlending/.test(src), '不应再用 MultiplyBlending');
  assert.ok(!/this\.cones/.test(src), '不应再维护锥体列表');
  // 仍然要保留逐片元遮蔽的推入路径
  assert.match(src, /pushOccluder/, '必须保留逐片元遮蔽的遮挡体推入');
  // 构造函数不再需要 scene/world
  const sys = new EclipseSystem();
  assert.ok(sys, '应能无参构造');
  // update 只推 uniform，不碰场景图
  const pushed = [];
  const mkBody = (id) => ({ id, posKm: [1e8, 0, 0], phys: { radiusKm: 1000 },
    mat: { userData: { uniforms: { uEclOn: { value: 0 }, uEclPos: { value: { set() { pushed.push(id); } } },
      uEclR: { value: 0 }, uSunDistKm: { value: 0 } } } } });
  const bodies = new Map(['sun', 'earth', 'moon', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'titan']
    .map((id) => [id, mkBody(id)]));
  sys.update(2451545, bodies, [0, 0, 0]);
  assert.ok(pushed.length > 0, '应把遮挡体推给接收体材质');
});

// ── 地表细节：只按足迹衰减，不再叠一道距离淡出 ──────────────────────────────
// 落地平视曾是一片平板（纹理能量 0.09–0.29，而轨道视角 1.8）。归因不是 fp32——
// vObjPos 本来就是相机相对坐标（uPatchRel 减掉了每 2km 跟随玩家吸附的 noiseOriginU）。
// 真正的原因是两道重复的闸门：距离淡出 f2/f3/f4 与足迹门限 aa* 在差不多的距离上
// 各自衰减同一种东西，距离淡出还更早一步。现只保留物理上正确的那一种（足迹）。
// 判据用分带实测（tools/audit-bands.mjs）：近景 +96%、中景 +70%、近地平线带不变。

test('地形细节只按足迹衰减：距离淡出已删除，足迹门限为标定值', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/fwidth\(vObjPos\)/.test(src), '必须保留足迹计算');
  assert.ok(/smoothstep\(0\.7, 1\.6, fp \* 26000\.0\)/.test(src), '最高频档的足迹门限应为标定值');
  assert.ok(/smoothstep\(0\.7, 1\.6, fp \* 35\.0\)/.test(src), '最低频档的足迹门限应为标定值');
  // 距离淡出（按 vViewPosition 的 smoothstep）不得再出现在细节增益里
  assert.ok(!/float f2 = 1\.0 - smoothstep/.test(src), '不应再有 f2 距离淡出');
  assert.ok(!/float f3 = 1\.0 - smoothstep/.test(src), '不应再有 f3 距离淡出');
  assert.ok(!/float f4 = 1\.0 - smoothstep/.test(src), '不应再有 f4 距离淡出');
  assert.ok(!/float g2 = f2 \* aa2/.test(src), '细节增益不应再乘距离淡出');
});

test('地表明暗调制保留增益与限幅（否则噪声方差太小，看着仍是平板）', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/clamp\(1\.0 \+ 2\.2 \* \(nsum - 0\.5\), 0\.62, 1\.38\)/.test(src),
    'dm 的增益与限幅应保持（±38% 表土质感，不死黑不过曝）');
});


// ── 反照率标定：贴图只承载相对结构，绝对亮度锚在实测反照率上 ──────────────────
// 此前表面亮度就等于贴图像素值，于是亮度排序完全错：土卫二贴图均值 0.136、
// 火星 0.219，渲染出来土卫二甚至比火星更暗——而实测几何反照率是 0.99 对 0.25。
// 太阳系最白的固体表面被画成了一个灰球。

test('反照率标定：标定后各天体的有效反照率与实测值一致', async () => {
  const { albedoScaleOf, TEXTURE_LIN_MEAN, SURFACE_ALBEDO } = await import('../src/scene/planetMaterial.js');
  const fileOf = { earth: 'earth_day.jpg', europa: 'europa.png', venus: 'venus_atmosphere.jpg' };
  for (const [id, a] of Object.entries(SURFACE_ALBEDO)) {
    const f = fileOf[id] ?? `${id}.jpg`;
    const m = TEXTURE_LIN_MEAN[f];
    assert.ok(m > 0, `${id} 的贴图 ${f} 缺少线性均值实测`);
    const eff = albedoScaleOf(f, id) * m;
    assert.ok(Math.abs(eff - a) < 1e-6, `${id} 标定后有效反照率 ${eff} ≠ 实测 ${a}`);
  }
});

test('亮冰卫星必须比火星亮（旧实现的排序是反的）', async () => {
  const { TERRAIN_GRADE } = await import('../src/scene/planetMaterial.js');
  const lum = (id) => {
    const g = TERRAIN_GRADE[id]?.grade ?? [1, 1, 1];
    return 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
  };
  assert.ok(lum('enceladus') > lum('mars') * 2,
    `土卫二（反照率 0.99）应显著亮于火星（0.25），实际 ${lum('enceladus').toFixed(2)} vs ${lum('mars').toFixed(2)}`);
  assert.ok(lum('mimas') > lum('mars'),
    `土卫一（0.962）应亮于火星，实际 ${lum('mimas').toFixed(2)} vs ${lum('mars').toFixed(2)}`);
  assert.ok(lum('mercury') < lum('mars'),
    `水星（0.106）应暗于火星（0.25），实际 ${lum('mercury').toFixed(2)} vs ${lum('mars').toFixed(2)}`);
  assert.ok(lum('moon') < 1, `月球地面不应再是白的，实际分级 ${lum('moon').toFixed(2)}`);
});

test('盘面与地形用同一张分级表（否则同一天体两种亮度）', async () => {
  const { TERRAIN_GRADE, displayGradeOf } = await import('../src/scene/planetMaterial.js');
  for (const id of ['earth', 'mars', 'moon', 'enceladus', 'mercury', 'uranus']) {
    const d = displayGradeOf(id), t = TERRAIN_GRADE[id];
    if (!d && !t) continue;
    assert.ok(d && t, `${id} 盘面与地形分级应同时存在`);
    for (let i = 0; i < 3; i++) assert.equal(d.grade[i], t.grade[i], `${id} 第 ${i} 通道盘面/地形不一致`);
  }
});

// ── 帮助文本必须覆盖已实现的按键 ──────────────────────────────────────────────
// 用户要的"电影感"开关（Z 纯净模式）实现已久，但英文帮助里没有、而
// applyDomI18n() 启动时会把 en/index.html 里写好的那行整体覆盖掉——于是
// 非中文用户永远学不到它。同类还有 C/M/Y/Ctrl+B/Ctrl+Shift+B/J。

test('中英文帮助都列出了全部已实现的按键', () => {
  const zh = read('index.html');
  const en = read('src/ui/i18n.js');
  // [按键, 中文帮助里的写法, 英文帮助里的写法]
  const keys = [
    ['Z 纯净模式', '>Z<', '<td>Z</td>'],
    ['C 指南针', '>C<', '<td>C</td>'],
    ['M 音效', '>M<', '<td>M</td>'],
    ['Y 人体剪影', '>Y<', '<td>Y</td>'],
    ['Ctrl+B 书签', 'Ctrl+B', 'Ctrl+B'],
    ['Ctrl+Shift+B 书签', 'Ctrl+Shift+B', 'Ctrl+Shift+B'],
    ['J 真实引力', '>J<', '<td>J</td>'],
  ];
  for (const [name, zhPat, enPat] of keys) {
    assert.ok(zh.includes(zhPat), `中文帮助缺少 ${name}`);
    assert.ok(en.includes(enPat), `英文帮助缺少 ${name}`);
  }
});

// ── 小天体亮度必须按真实视星等，不能一律画成亮点 ──────────────────────────────
// 5412 颗小天体此前一律 2.2px 全亮，于是夜空里是一条"喷带"。真实情况是
// 谷神星 6.7–9.3 等、灶神星 5.2–8.5 等，肉眼极限 6 等——绝大多数根本看不见。

test('小天体按视星等决定可见性，与真实夜空一致', () => {
  const src = read('src/scene/smallBodies.js');
  assert.ok(/applyMagnitude/.test(src), '缺少视星等计算');
  assert.ok(/b\[8\] \+ 5 \* Math\.log10\(rAU \* dAU\)/.test(src),
    '视星等应为 m = H + 5·log10(r·Δ)（H 是数据里的第 8 列）');
  assert.ok(/NAKED_EYE_M\s*=\s*6\.0/.test(src), '应以肉眼极限 6.0 等为可见性基准');
  assert.ok(/vertexColors:\s*true/.test(src), '材质应改为逐点颜色');
  // 数值验算：谷神星（H=3.34，r=2.77 AU，Δ=1.8 AU）应当可见；典型主带（H=12）不可见
  const m = (H, r, d) => H + 5 * Math.log10(r * d);
  const L = (mm) => Math.min(1, Math.pow(10, -0.4 * (mm - 6.0)));
  assert.ok(L(m(3.34, 2.77, 1.8)) > 0.2, '谷神星应当可见');
  assert.ok(L(m(12, 2.77, 1.8)) < 0.01, '典型主带天体不应可见');
});

test('统计点云用小精灵贴图而不是方块（密集时方块肉眼可辨）', () => {
  const src = read('src/scene/belts.js');
  assert.ok(/softDotTexture/.test(src), '缺少软边点精灵');
  assert.ok(/map:\s*softDotTexture\(\)/.test(src), 'PointsMaterial 未使用软边贴图');
});

// ── 曝光律：表面亮度必须只由反照率决定 ────────────────────────────────────────
// 此前 sunI 与曝光各带一个经验指数（(1/d²)^0.55 与 d^0.85），两者相乘后仍随
// 日心距变化，于是**跨距离的亮度排序是错的**：水星（反照率 0.106）渲染出来
// 比火星（0.25）还亮，因为水星拿到 2.77 的光照系数而火星只有 0.588。

test('曝光律：uSunI = 1/d²、曝光 = K·d²，两者相乘与距离无关', () => {
  const b = read('src/scene/builder.js');
  const m = read('src/main.js');
  assert.ok(/const sunI = 1 \/ \(dAU \* dAU\);/.test(b),
    'uSunI 必须是纯反平方律，不能再带 ^0.55 的暗适应压缩');
  assert.ok(!/Math\.pow\(sunIRaw, 0\.55\)/.test(b), '旧的暗适应压缩仍在');
  assert.ok(/sunLight\.intensity = Math\.PI \* li;/.test(b),
    '地形光必须与盘面同一条律（原来取 pow(li,0.55)，水星上地形比盘面暗 2.4 倍）');
  const e = m.match(/exposureTarget = THREE\.MathUtils\.clamp\(([\d.]+) \* Math\.max\(dSunAU, 0\.004\) \*\* 2, ([\d.]+), ([\d.]+)\);/);
  assert.ok(e, '曝光必须写成 K·d² 的形式');
  const K = Number(e[1]);
  assert.ok(K > 0.3 && K < 1.2, `曝光标定系数 ${K} 应在 (0.3, 1.2)：太小画面发灰、太大亮部削顶`);
  // 数值验算：乘积 = K，与 dAU 无关
  const sunI = (d) => 1 / (d * d);
  const expo = (d) => Math.min(2000, Math.max(0.02, K * d * d));
  for (const d of [0.39, 1.0, 1.58, 5.31, 9.43, 35.6]) {
    const p = sunI(d) * expo(d);
    assert.ok(Math.abs(p - K) < 1e-6, `d=${d} AU 时 sunI×曝光 = ${p}，应为常数 ${K}`);
  }
});

// ── 地貌生成器：撞击坑必须按尺寸-频率分布、且有真实形态 ──────────────────────
// 原实现用噪声等值线（`crater()`），给不出碗形/平底、抬升的坑缘、中央峰、溅射毯，
// 也谈不上尺寸分布——落到地面一眼就假。

test('撞击坑场：尺寸-频率分布 N(>D) ∝ D⁻²，且形态随直径转变', async () => {
  const { HeightField } = await import('../src/scene/terrain.js');
  const { MOON_PHYS } = await import('../src/astro/bodies.js');
  const f = new HeightField('moon', MOON_PHYS.moon);
  assert.ok(f.craterField, '月球应有撞击坑场');
  const cs = f.craterField.classes;
  assert.ok(cs.length >= 10, `坑的尺寸档数应足够（实测 ${cs.length}）`);
  // 相邻档的间距比应 ≈ 尺寸比（N(>D)∝D⁻² 的直接推论）
  for (let i = 1; i < cs.length; i++) {
    const ratio = cs[i - 1].cell / cs[i].cell;
    assert.ok(ratio > 1.5 && ratio < 3.0, `第 ${i} 档间距比 ${ratio.toFixed(2)} 偏离尺寸分布律`);
  }
  // 深度-直径关系：小坑线性（0.2D），大坑进入复杂坑后显著变浅
  const small = cs.find((c) => c.D < 10);
  const big = cs[0];
  assert.ok(Math.abs(small.depth / small.D - 0.2) < 1e-6, '简单坑深径比应为 0.2');
  assert.ok(big.depth / big.D < 0.05, `最大坑的深径比 ${(big.depth / big.D).toFixed(3)} 应远小于 0.2（复杂坑/盆地）`);
});

test('DEM 分辨率以下也有撞击坑（否则落地仍是平坡）', async () => {
  const { HeightField } = await import('../src/scene/terrain.js');
  const { MOON_PHYS } = await import('../src/astro/bodies.js');
  const f = new HeightField('moon', MOON_PHYS.moon);
  assert.ok(f.craterFine, '应有 DEM 分辨率以下的细坑场');
  // 最细档应到行走尺度（约 10m），而不是停在 50m
  const minD = f.craterFine.classes[f.craterFine.classes.length - 1].D;
  assert.ok(minD <= 0.012, `细坑场最细档 ${minD}km 太粗，行走尺度仍是平坡`);
});

// ── 太阳：颜色不能被抹成灰、亮度不能随场景曝光变化 ──────────────────────────
// 旧实现 base = vec3(luminance)（纯灰）+ 强度 ×14 配场景曝光 → 一颗没有任何
// 结构的白球；而且飞到冥王星时曝光放大 ~900 倍，日面彻底削平。

test('太阳光球保留色温（不是灰度）', () => {
  const src = read('src/scene/sun.js');
  assert.ok(/vec3\(luminance\) \* vec3\(1\.0, 0\.975, 0\.93\)/.test(src),
    '光球基色应是亮度 × 5772K 黑体色度，而不是纯灰');
  assert.ok(!/vec3 base = vec3\(luminance\);/.test(src), '仍是纯灰基色');
});

test('太阳光球不随场景曝光变化（否则远日轨道会被削成白盘）', () => {
  const sun = read('src/scene/sun.js');
  const main = read('src/main.js');
  assert.ok(/uInvExposure/.test(sun), '太阳着色器应接收曝光倒数');
  assert.ok(/col \* 2\.2 \* uInvExposure/.test(sun), '光球输出应乘曝光倒数');
  assert.ok(!/col \* 14\.0/.test(sun), '旧的 ×14 固定强度仍在');
  assert.ok(/uInvExposure\.value = 1 \/ Math\.max\(renderer\.toneMappingExposure/.test(main),
    'main.js 每帧应写入曝光倒数');
});

// ── 环境贴图：金属材质不能是暗剪影 ────────────────────────────────────────────
// 全仓库此前没有 envMap，却有 metalness 0.6–0.8 的材质（旅行者号金箔、登月舱、
// 月球车、火星车）。MeshStandardMaterial 的金属没有环境反射时，漫反射被
// (1−metalness) 砍到 20%、间接镜面为 0，凑近看就是一团暗褐剪影。

test('主场景设置了程序化环境贴图（金属材质才有东西可反射）', () => {
  const src = read('src/main.js');
  assert.ok(/PMREMGenerator/.test(src), '缺少 PMREM 生成');
  assert.ok(/scene\.environment = pmrem\.fromEquirectangular/.test(src),
    'scene.environment 未设置');
  assert.ok(/environmentIntensity/.test(src), '环境强度应显式压低，避免把地表整体洗亮');
});

// ── 地形必须覆盖视地平，且边缘与基底球无缝 ──────────────────────────────────
// 原来最外级只到 280km 半边长，而 300km 高度上地平线在 ~1000km 外——地形方块
// 明晃晃地浮在光滑基底球上，交界是一条硬直边。_showBase() 还是死代码（从不隐藏）。

test('地形外缘覆盖视地平，且边缘高度收回基准球', () => {
  const src = read('src/scene/terrain.js');
  // 外缘级别至少到 600km（300km 高度上可见的地面半径）
  assert.ok(/280, 600, 1500/.test(src), '最外级应扩展到 600/1500km');
  // 边缘高度向 baseRadius 平滑收回
  assert.ok(/blend > 0\) h = h \* \(1 - blend\) \+ this\.field\.baseRadius\(dir\) \* blend/.test(src),
    '最外级边缘应收到基准球面，否则与基底球交界是硬直边');
});

// ── 星表失败必须可见；亮星要有层次 ────────────────────────────────────────────
test('星表加载失败会告知用户（全链路唯一静默降级）', () => {
  const m = read('src/main.js');
  const i = read('src/ui/i18n.js');
  assert.ok(/hud\.tip\(t\('tip\.starsUnavailable'\)\)/.test(m), '失败时没有提示');
  assert.ok(/tip\.starsUnavailable/.test(i), '缺少 starsUnavailable 文案');
});

test('恒星按星等分三档尺寸（两档时天狼星与二等星一样大）', () => {
  const s = read('src/scene/starfield.js');
  const layers = s.match(/\{ size: [\d.]+, lo: [^}]+\}/g) ?? [];
  assert.ok(layers.length >= 3, `亮星尺寸档位只有 ${layers.length} 档`);
});

test('书签"最近一条"取的是 list()[0]（list 按 created 降序）', () => {
  const m = read('src/main.js');
  assert.ok(/const latest = items\[0\];/.test(m), '仍取 items[length-1]（最旧的一条）');
  assert.ok(!/const latest = items\[items\.length - 1\];/.test(m), '旧写法仍在');
});

// ── 小缺陷：语言回落、窄窗口面板、坡度 ───────────────────────────────────────
test('非英文语言的天体描述不再回落中文', () => {
  const h = read('src/ui/hud.js');
  assert.ok(/desc: DESC_EN\[id\] \?\? descZh,/.test(h),
    '描述应回落到英文（此前非 en 一律中文，日语用户看到"日文按钮+中文描述"）');
  assert.ok(!/LANG === 'en' \? \(DESC_EN\[id\]/.test(h), '旧的三元回落仍在');
});

test('窄窗口桌面浏览器仍能看到目标信息面板', () => {
  const css = read('src/style.css');
  assert.ok(/@media \(max-width: 768px\) and \(pointer: fine\)/.test(css),
    '缺少"窄窗口 + 精细指针"的覆盖规则：桌面窄窗没有 tc-target-btn，面板不能一起隐藏');
});

test('行走有坡度限制（不能垂直爬崖）', () => {
  const s = read('src/engine/ship.js');
  assert.ok(/rise > run \* 1\.73/.test(s), '缺少坡度限制（tan60°）');
  assert.ok(/if \(rise > run \* 1\.73\) move\.set\(0, 0, 0\);/.test(s), '坡度超限应拒绝这一步');
});

// ── 无气天体白昼星空 / 扫掠碰撞 / TNO 自转 ────────────────────────────────────
test('无气天体白昼天空仍能看见星星（阿波罗照片里月面天空是黑的）', async () => {
  const { photoSkyVisibility } = await import('../src/scene/photoExposure.js');
  // 月球正午、站在地面
  const v = photoSkyVisibility({ radiusKm: 1737, distanceKm: 1737.002, sunElevation: 1, airless: true });
  assert.equal(v, 1, `无气天体不应压制星空，实际 ${v}`);
  // 有大气的地球同样条件应被压暗
  const e = photoSkyVisibility({ radiusKm: 6371, distanceKm: 6371.002, sunElevation: 1, airless: false });
  assert.ok(e < 0.2, `有大气白昼应压制星空，实际 ${e}`);
});

test('高速飞行有扫掠碰撞（否则一帧走几千公里会直接穿过去）', () => {
  const s = read('src/engine/ship.js');
  assert.ok(/_prevPosKm/.test(s), '缺少积分前位置记录');
  assert.ok(/disc >= 0/.test(s) && /线段-球求交|扫掠碰撞/.test(s), '缺少线段-球求交');
});

test('TNO 会自转，且用纯反平方光照（与曝光律一致）', () => {
  const s = read('src/scene/tnoScene.js');
  assert.ok(/TNO_ROT_HOURS/.test(s), '缺少自转周期表');
  assert.ok(/e\.mesh\.rotation\.y = ang/.test(s), 'TNO 仍未自转');
  assert.ok(!/Math\.pow\(sunIRaw, 0\.55\)/.test(s), 'TNO 仍用旧的 ^0.55 光照压缩');
});

// ── 冥王星系统应有 5 颗卫星 ────────────────────────────────────────────────────
test('冥卫二/三/四/五进入卫星清单（此前写好了物理数据却从不渲染）', async () => {
  const { MOON_IDS, moonLocalPosition } = await import('../src/astro/moons.js');
  const { MOON_EPOCH_JD } = await import('../src/astro/moonsData.generated.js');
  for (const id of ['charon', 'nix', 'hydra', 'kerberos', 'styx']) {
    assert.ok(MOON_IDS.includes(id), `${id} 不在卫星清单里`);
  }
  // 半长轴应落在发表值附近（±5%）
  const expect = { nix: 48694, hydra: 64738, kerberos: 57783, styx: 42656 };
  for (const [id, a] of Object.entries(expect)) {
    const p = moonLocalPosition(id, MOON_EPOCH_JD);
    const r = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(r - a) / a < 0.05, `${id} 距冥王星 ${r.toFixed(0)}km，期望约 ${a}km`);
  }
});

// ── 夜面底光必须随辐照缩放；有环天体要有环照 ────────────────────────────────
test('夜面底光随 uSunI 缩放（否则外太阳系行星夜面异常亮）', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/col \+= albedo \* 0\.0035 \* uSunI;/.test(src), '夜面底光仍是常数');
  assert.ok(!/col \+= albedo \* 0\.0035;/.test(src), '旧的常数底光仍在');
});

test('有环天体有环照（土星夜面不是全黑）', () => {
  const mat = read('src/scene/planetMaterial.js');
  const b = read('src/scene/builder.js');
  assert.ok(/uRingShine/.test(mat) && /uRingShine\.value = /.test(b), '缺少环照强度');
  assert.ok(/col \+= albedo \* uRingShine \* ringSide;/.test(mat), '缺少环照贡献项');
});

// ── 再入：大气模型必须与实测密度同量级 ──────────────────────────────────────
// 早期把标高写成 rayleighScaleKm·2.4（地球 20.4km）：30km 以下还算贴合，
// 但 60km 处密度比真实值高约 200 倍，动压算出来是 MPa、加热峰值落在 120km。

test('再入大气模型：60km 处动压落在真实峰值量级（10–40 kPa）', async () => {
  const { aeroAt } = await import('../src/engine/ship.js');
  const earth = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const a60 = aeroAt(60, 7.8, earth);
  assert.ok(a60.q > 1e4 && a60.q < 4e4,
    `60km/7.8km/s 的动压 ${(a60.q / 1000).toFixed(1)} kPa 不在 10–40 kPa 区间`);
  // 120km 应当几乎真空
  assert.ok(aeroAt(120, 7.8, earth).q < 100, '120km 处动压应接近零（<100 Pa，对比 60km 的 32 kPa）');
  // 加热随密度平方根 × 速度立方增长
  assert.ok(aeroAt(60, 7.8, earth).heat > aeroAt(120, 7.8, earth).heat);
  // 火星（稀薄大气）同高度动压应远低于地球
  const mars = { rayleighScaleKm: 11.1, rho0: 0.020 };
  assert.ok(aeroAt(60, 7.8, mars).q < a60.q / 8, '火星 60km 动压应远低于地球（稀薄大气）');
});

test('再入有物理实现，不只是音效', () => {
  const s = read('src/engine/ship.js');
  const m = read('src/main.js');
  assert.ok(/export function aeroAt/.test(s), '缺少 aeroAt 模型');
  assert.ok(/this\.vel\.multiplyScalar\(1 - dv \/ this\.vel\.length\(\)\)/.test(s), '缺少阻力减速');
  assert.ok(/ship\.aero\?\.q/.test(m), '相机抖动未接动压');
  assert.ok(/reentry-glow/.test(m), '缺少等离子鞘辉光');
});

// ── 海面必须看得见浪 ────────────────────────────────────────────────────────
// 站在水面时眼高只有 ~0.3m，掠射角让足迹迅速超过波格——原来水波门限 (0.25,0.65)
// 与 0.00025 的振幅叠在一起，十几米外的水面就只剩一块平色。
test('海面波纹的振幅与门限足以在水面看到起伏', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/waterGrad \* 0\.0012/.test(src), '水波振幅过小（原 0.00025 时坡度仅 ~0.15）');
  assert.ok(/smoothstep\(0\.7, 1\.6, fp \* 820\.0\)/.test(src), '水波足迹门限仍过紧');
  assert.ok(!/waterGrad \* 0\.00025/.test(src), '旧的低振幅仍在');
});

// ── 岩石要有表面质感 ────────────────────────────────────────────────────────
test('岩石材质加了程序化法线扰动（否则近看是光滑团块）', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/mat\.onBeforeCompile/.test(src), '岩石材质缺少 onBeforeCompile');
  assert.ok(/rgrad\(vRockPos \* 900\.0\)/.test(src), '缺少岩石法线扰动');
  assert.ok(/uniform mat3 normalMatrix;/.test(src), '片元着色器必须自己声明 normalMatrix');
});

// ── HUD 只在内容变化时写 DOM ────────────────────────────────────────────────
// 主循环每帧重建 3 处 innerHTML + 199 个标签投影，其中时间串每秒才变一次。
test('HUD 的 innerHTML 有内容比对（不是每帧无条件重建）', () => {
  const src = read('src/ui/hud.js');
  assert.ok(/_navHtml/.test(src) && /_tgtHtml/.test(src) && /_timeHtml/.test(src),
    'HUD 三处 innerHTML 都应做内容比对');
  assert.ok(!/this\.elNav\.innerHTML = rows\.join\(''\);\s*$/m.test(src),
    '导航栏仍是每帧无条件重建');
});

// ── 远距行星光点要有 1/d² ────────────────────────────────────────────────────
test('远距行星光点按 1/d² 衰减（否则海王星比金星亮）', () => {
  const src = read('src/scene/builder.js');
  assert.ok(/const flux = 1 \/ Math\.max\(dAUg \* dAUg, 1e-6\)/.test(src), '缺少距离项');
  assert.ok(/Math\.min\(1, flux \* 1\.4\)/.test(src), '光点亮度未乘距离项');
  // 数值验算：金星（0.31 AU）应明显亮于海王星（30 AU）
  const flux = (d) => Math.min(1, (1 / (d * d)) * 1.4);
  assert.ok(flux(0.31) > 1, '金星应满亮');
  assert.ok(flux(30) < 0.002, `海王星应极暗，实际 ${flux(30).toExponential(2)}`);
});
