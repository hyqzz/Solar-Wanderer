// 渲染真实度回归：DEM 层级上限、太阳临边昏暗、大气臭氧层。
//
// 这三项都属于"静默出错"的类型——画面照样出来，只是物理不对，
// 所以既要锁定数值行为，也要检查着色器源码里确实有这些项。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEM_SOURCES, levelExceedsSource } from '../src/scene/demTiles.js';
import { BODIES } from '../src/astro/bodies.js';

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
