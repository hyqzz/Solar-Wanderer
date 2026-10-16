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
  assert.ok(/pow\(lum, 1\.45\) \* 1\.25 \+ lum \* 0\.06/.test(src), '缺少幂律映射');
  // 旧写法在 lum>0.65 处饱和到 1，把贴图的大片中间调压成硬边不透明白斑
  assert.ok(!/dot\(cl, vec3\(0\.34\)\) - 0\.10\) \* 1\.8/.test(src), '阈值化映射仍在');
  assert.ok(!/dot\(cloudCol, vec3\(0\.34\)\) - 0\.10\) \* 1\.8/.test(src), '云影仍用阈值化映射');
  // Beer–Lambert 形式：永不饱和，薄云保持半透明
  assert.ok(/1\.0 - exp\(-cloudTau\(cl\) \* 1\.9\)/.test(src), '缺少 Beer–Lambert 不透明度');
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
