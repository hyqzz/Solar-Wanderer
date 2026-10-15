// 行星表面材质：自定义光照着色器。
// - 真实太阳方向的昼夜明暗（平滑晨昏线）
// - 地球：夜面城市灯光 + 海洋镜面反射（按贴图蓝色启发式掩码）
// - HDR：太阳辐照度按 1/d²（地球处=1）缩放
// - R7 #4：片元程序化细节（分辨率无关，SpaceEngine 路线）——
//   气巨/冰巨：纬向拉伸湍流双尺度 + 风暴涡 + 临边昏暗；岩质：各向同性细节。
//   按行星视半径淡入：远观与 R5 审查版一致，贴近时低清贴图不再糊。

import * as THREE from 'three';
import { HAPKE_PARAMS } from '../astro/bodies.js';
import { QUALITY } from '../engine/quality.js';

// 1×1 占位纹理：避免未启用分支的 sampler 绑定空值
const DUMMY_TEX = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1);
DUMMY_TEX.needsUpdate = true;

// 天体 ID（着色器内 int 分支选择）：与 bodies.js 的 key 对应。
// 用 int 而非 string——GLSL ES 1.0 不支持字符串比较，且 int 分支开销极低。
const BODY_EARTH = 3, BODY_MARS = 4, BODY_JUPITER = 5, BODY_SATURN = 6, BODY_TRITON = 100;
const BODY_ID_MAP = {
  earth: BODY_EARTH, mars: BODY_MARS, jupiter: BODY_JUPITER,
  saturn: BODY_SATURN, triton: BODY_TRITON,
};

// 逐天体色彩分级（对标 NASA/JPL 实测影像：信使号/旅行者/卡西尼/新视野号参考观感）。
// 引擎的 1/d² 辐照 + 暗适应曝光补偿在物理上正确，但与公众熟知的探测器影像观感有系统偏差
// （探测器影像本身做了各自的曝光/增强），此处按天体逐一校正：
// - grade：反照率增益（亮度/色温）
// - sat：饱和度（ACES 压缩去饱和的补偿）
// - veil/veilColor：不透明霾罩（土卫六：可见光完全无法穿透的橙色 tholin 烟雾，
//   卡西尼可见光影像为无表面特征的橙色圆盘；降到霾层高度以下才逐渐显露出表面）
const BODY_GRADE = {
  mercury: { grade: [0.40, 0.38, 0.36] },          // 真实反照率 0.09，暗灰微棕（MESSENGER）
  earth:   { grade: [1, 1, 1], sat: 1 },
  jupiter: { sat: 1 },
  uranus:  { grade: [1.50, 1.65, 1.70] },          // 淡青（旅行者 2 号观感）
  // Oxford/Irwin 2024: Neptune is pale green-blue, not enhanced Voyager blue.
  // Approximate display correction of this legacy map; not spectral calibration.
  neptune: { grade: [2.50, 2.50, 2.50], tint: [0.86, 1.02, 1.09], tintMix: 0.94 },
  pluto:   { grade: [1, 1, 1], sat: 1 },
  triton:  { grade: [1.08, 1.00, 0.95], sat: 1 },
  callisto: { grade: [0.90, 0.90, 0.92] },         // 压暗压冷，突出亮坑
  titan:   { veil: 0.94, veilColor: [0.92, 0.45, 0.14] }, // 不透明橙色霾（卡西尼自然色：柔和卡其橙盘）
};
// 地形层（terrain.js 顶点色采样同一份贴图）需要同步这份反照率校正，
// 否则从太空看分级正确的暗天体（水星 0.40×），落到地表却是未分级的亮贴图色。
// sat 一并导出（地球：盘面靠 uSat 补偿 ACES 去饱和，地形若无同款饱和度陆地会发灰）。
export const TERRAIN_GRADE = Object.fromEntries(
  Object.entries(BODY_GRADE).filter(([, v]) => v.grade).map(([k, v]) => [k, { grade: v.grade, sat: v.sat ?? 1 }])
);

export function createPlanetMaterial({
  map, nightMap = null, oceanSpec = false, ringShadow = null,
  detailMode = 0, radiusKm = 1, // detailMode: 0 无 / 1 岩质 / 2 气巨冰巨
  bodyId = null, cloudTex = null, // bodyId 驱动天体特定效果；cloudTex 用于地球云层投影
}) {
  // ringShadow: { tex|null, innerKm, outerKm } —— 环对行星本体的投影（卡西尼实拍标志性特征）
  // 无气天体走 Hapke 风化层 BRDF；表里没有的天体（有大气）保持 Lambert。
  const hp = HAPKE_PARAMS[bodyId] ?? null;
  const uniforms = {
    uMap: { value: map },
    uNight: { value: nightMap ?? DUMMY_TEX },
    uHasNight: { value: nightMap ? 1 : 0 },
    uOcean: { value: oceanSpec ? 1 : 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) }, // 世界系，指向太阳
    uSunI: { value: 1.0 },                          // 相对地球辐照度
    uHasRing: { value: ringShadow ? 1 : 0 },
    uHasRingTex: { value: ringShadow?.tex ? 1 : 0 },
    uRingTex: { value: ringShadow?.tex ?? DUMMY_TEX },
    uRingInner: { value: ringShadow?.innerKm ?? 1 },
    uRingOuter: { value: ringShadow?.outerKm ?? 2 },
    uRingNormal: { value: new THREE.Vector3(0, 1, 0) }, // 环面法向（世界，每帧更新）
    uCenter: { value: new THREE.Vector3() },            // 行星中心（相机相对，每帧更新）
    uDetailMode: { value: detailMode },                 // 可运行时降档置 0
    uRadius: { value: radiusKm },
    // === Issue #26/#27/#28/#29/#36：真实感着色器 uniforms ===
    uTime: { value: 0 },           // 秒（实时，驱动云层/条带/极光帘幕动画）
    uLs: { value: 0 },             // 火星太阳黄经（度，驱动尘暴季节性）
    uSubsolarLat: { value: 0 },    // 日下点纬度（度，驱动冰冠/季节变化）
    uSolarActivity: { value: 0.7 },// 太阳活动 0..1（调制极光强度）
    uBodyId: { value: BODY_ID_MAP[bodyId] ?? 0 }, // 天体 ID（着色器分支）
    uCloudTex: { value: cloudTex ?? DUMMY_TEX },  // 地球云层贴图（地表投影用）
    uHasClouds: { value: cloudTex ? 1 : 0 },
    // 逐天体色彩分级（BODY_GRADE 表；缺省 = 无修正）
    uGrade: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.grade ?? [1, 1, 1])) },
    uSat: { value: BODY_GRADE[bodyId]?.sat ?? 1.0 },
    uNaturalTint: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.tint ?? [1, 1, 1])) },
    uNaturalTintMix: { value: BODY_GRADE[bodyId]?.tintMix ?? 0 },
    uVeil: { value: BODY_GRADE[bodyId]?.veil ?? 0.0 },
    uVeilColor: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.veilColor ?? [0, 0, 0])) },
    // 日食：遮挡体位置与半径（世界系，相机相对），以及本体的日心距
    uEclOn: { value: 0 },
    uEclPos: { value: new THREE.Vector3() },
    uEclR: { value: 1 },
    uSunDistKm: { value: 1.496e8 },
    // 无气天体：Hapke 风化层 BRDF（见 src/astro/bodies.js HAPKE_PARAMS）
    uHapke: { value: hp ? 1 : 0 },
    uW: { value: hp?.w ?? 0.25 },
    uB0: { value: hp?.B0 ?? 1.0 },
    uHh: { value: hp?.h ?? 0.06 },
    uHg: { value: hp?.g ?? -0.3 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vObjPos;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vObjPos = position; // 对象空间（随行星自转，细节特征固定在表面）
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform sampler2D uNight;
      uniform int uHasNight;
      uniform int uOcean;
      uniform int uHasRing;
      uniform int uHasRingTex;
      uniform sampler2D uRingTex;
      uniform float uRingInner, uRingOuter;
      uniform vec3 uRingNormal;
      uniform vec3 uCenter;
      uniform vec3 uSunDir;
      uniform float uSunI;
      uniform int uDetailMode;
      uniform float uRadius;
      // === Issue #26/#27/#28/#36 uniforms ===
      uniform float uTime;
      uniform float uLs;
      uniform float uSubsolarLat;
      uniform float uSolarActivity;
      uniform int uBodyId;
      uniform sampler2D uCloudTex;
      uniform int uHasClouds;
      uniform vec3 uGrade;
      uniform float uSat;
      uniform vec3 uNaturalTint;
      uniform float uNaturalTintMix;
      uniform float uVeil;
      uniform vec3 uVeilColor;
      uniform int uEclOn;
      uniform vec3 uEclPos;
      uniform float uEclR;
      uniform float uSunDistKm;
      const float SUN_RADIUS_KM = 695700.0;
      uniform int uHapke;
      uniform float uW, uB0, uHh, uHg;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vObjPos;

      float phash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      // 角度差归一化到 [-π, π]（用于大红斑经度比较，跨 0/2π 边界正确）
      float angleDiff(float a, float b) {
        float d = a - b;
        return mod(d + 3.14159265, 6.2831853) - 3.14159265;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        vec3 albedo = texture2D(uMap, vUv).rgb;
        float app = uRadius / max(length(vPosW), uRadius); // 视半径因子（相机恒在原点，浮动原点）
        // 程序化细节（按行星视半径淡入，远观恒等于原贴图）
        if (uDetailMode > 0) {
          float dist = length(vPosW); // 相机恒在原点（浮动原点）
          // 淡入范围从 0.01 起（#18：更远处开始出现程序细节，平滑球面→地形过渡）
          float fade = smoothstep(0.01, 0.18, app);
          if (fade > 0.001) {
            vec3 p = vObjPos / uRadius;
            if (uDetailMode == 2) {
              // 气巨/冰巨：纬向拉伸湍流（条带内流动结构）双尺度 + 风暴涡
              vec3 ps = vec3(p.x * 0.22, p.y, p.z * 0.22);
              float t1 = pnoise(ps * 48.0);
              float t2 = pnoise(ps * 190.0) * smoothstep(0.18, 0.7, app);
              float storm = smoothstep(0.74, 0.95, pnoise(p * 85.0 + 13.7));
              // 土星极区降噪：湍流/风暴涡在极盖（贴图蓝灰极区）上叠加出紫斑伪影，
              // 真实土星极区为平滑六边形急流结构——极区程序化细节衰减到 0
              float polarDamp = 1.0;
              if (uBodyId == 6) polarDamp = 1.0 - smoothstep(0.78, 0.92, abs(p.y));
              albedo *= 1.0 + fade * polarDamp * ((t1 - 0.5) * 0.16 + (t2 - 0.5) * 0.10);
              albedo = mix(albedo, albedo * vec3(1.10, 1.05, 0.97), fade * storm * 0.55 * polarDamp);
            } else {
              // 岩质/冰面：三尺度各向同性细节（#21：比原来多一层，地形接管前中距离更真实）
              float t1 = pnoise(p * 64.0);
              float t2 = pnoise(p * 340.0) * smoothstep(0.2, 0.75, app);
              float t3 = pnoise(p * 1200.0) * smoothstep(0.35, 0.9, app);
              albedo *= 1.0 + fade * ((t1 - 0.5) * 0.22 + (t2 - 0.5) * 0.14 + (t3 - 0.5) * 0.07);
            }
          }
          // === Issue #28：木星动态云带 + 大红斑 ===
          // 纬向风剖面（交替东西向急流）+ System III 经度漂移的大红斑 + 对流胞。
          // 保持基础贴图可识别：所有调制为乘法/混合，不替换底色。
          if (uBodyId == 5) {
            float lat = vObjPos.y / uRadius; // 归一化纬度 -1..1
            // 纬向风：不同纬度不同流速（真实木星约 12 条交替急流，简化为正弦）
            float windSpeed = sin(lat * 14.0) * 0.00015;
            float flow = uTime * windSpeed;
            vec3 jp = vObjPos / uRadius;
            // 条带湍流：沿风方向拉伸的噪声产生流动结构
            float turb = pnoise(vec3(jp.x * 3.0 + flow, jp.y * 10.0, jp.z * 3.0 + flow * 0.5)) * 0.12;
            albedo *= 1.0 + turb;
            // 对流胞：近距离才淡入（app > 0.15），远观不可见避免摩尔纹
            float conv = pnoise(jp * 25.0 + vec3(uTime * 0.03)) * smoothstep(0.15, 0.5, app);
            albedo *= 1.0 + conv * 0.06;
            // 大红斑：贴图（卡西尼拼接）自带 GRS 于 ~22°S——原位增强其红橙色饱和度。
            // 旧版在漂移经度叠加第二个程序化红斑，与贴图红斑分离后形成双斑/洗白圈。
            // 在 UV 空间定位（对球面 UV 约定稳健）：贴图 GRS 中心 u≈0.368, v≈0.628。
            {
              vec2 grsD = vec2(angleDiff(vUv.x, 0.368), vUv.y - 0.628);
              float grs = (1.0 - smoothstep(0.008, 0.040, abs(grsD.x)))
                        * (1.0 - smoothstep(0.004, 0.022, abs(grsD.y)));
              vec3 grsCol = albedo * vec3(1.80, 0.74, 0.52) + vec3(0.05, 0.004, 0.0);
              albedo = mix(albedo, grsCol, grs * 0.85);
            }
          }
          // === Issue #36：季节性极地冰冠（仅地球保留） ===
          // 火星分支已移除：程序冰冠低至纬度 ~51° 且混入 70% 白色，远大于真实
          // 火星极冠（多在 80°+），把两极整块刷白、盖掉贴图 —— 还原为贴图原色。
          if (uBodyId == 3) { // 地球：轴倾角 23.5°，水冰极冠（微弱，叠加在贴图真实冰盖上）
            float lat = vObjPos.y / uRadius;
            float ss = uSubsolarLat / 23.5;
            float nCap = smoothstep(0.85 + ss * 0.04, 0.92 + ss * 0.04, lat);
            float sCap = smoothstep(0.85 - ss * 0.04, 0.92 - ss * 0.04, -lat);
            float cap = max(nCap, sCap);
            albedo = mix(albedo, vec3(0.95, 0.97, 1.0), cap * 0.5);
          }
          if (uBodyId == 4) { // 火星：季节极冠（CO₂ 霜冬季延伸 + 夏季残余水冰冠）
            float latS = vObjPos.y / uRadius; // sin(纬度)
            // 北半球冬季极盛于 Ls=270°；南半球冬季极盛于 Ls=90°
            float winterN = 0.5 + 0.5 * cos((uLs - 270.0) * 0.0174532925);
            float winterS = 0.5 + 0.5 * cos((uLs - 90.0) * 0.0174532925);
            // 残余冰冠边缘 sin(82°)≈0.990；季节霜缘最大 sin(55°)≈0.819
            float edgeN = mix(0.990, 0.819, winterN * winterN);
            float edgeS = mix(0.990, 0.819, winterS * winterS);
            float capN = smoothstep(edgeN - 0.015, edgeN + 0.02, latS);
            float capS = smoothstep(edgeS - 0.015, edgeS + 0.02, -latS);
            float cap = max(capN, capS);
            // CO₂ 霜偏蓝白、薄；残余水冰冠更亮
            albedo = mix(albedo, vec3(0.92, 0.94, 0.99), cap * 0.55);
          }
        }
        // 逐天体色彩分级（对标探测器实测影像；BODY_GRADE 表）
        albedo *= uGrade;
        albedo = mix(albedo, dot(albedo, vec3(0.2126, 0.7152, 0.0722)) * uNaturalTint, uNaturalTintMix);
        albedo = mix(vec3(dot(albedo, vec3(0.3333))), albedo, uSat);
        // 地球深海蓝：开阔大洋水体反照率极低（~0.03-0.06，吸收红绿光），
        // 贴图海洋像素偏亮偏青；按蓝色掩码压暗并加深蓝移（Blue Marble/阿波罗实拍观感）
        if (uBodyId == 3) {
          float om = clamp((albedo.b - max(albedo.r, albedo.g * 0.9)) * 6.0, 0.0, 1.0);
          albedo *= mix(vec3(1.0), vec3(0.52, 0.60, 0.86), om * 0.8);
        }
        // 土星极区重着色：贴图极盖为蓝灰斑驳（2013 蓝极期数据），经临边昏暗+ACES 后
        // 呈紫斑伪影；真实（2017+ 卡西尼后期）极区为金色乳白。随后叠加北极六边形
        // （~77°N 波数 6 驻波急流，卡西尼实拍标志特征；体固系随波自转）。
        if (uBodyId == 6) {
          vec3 pp = vObjPos / uRadius;
          float poleF = smoothstep(0.84, 0.95, abs(pp.y));
          albedo = mix(albedo, vec3(0.79, 0.74, 0.60), poleF * 0.78);
          float hexBand = smoothstep(0.950, 0.968, pp.y) * (1.0 - smoothstep(0.978, 0.995, pp.y));
          albedo *= 1.0 + cos(6.0 * atan(pp.z, pp.x)) * hexBand * 0.06;
        }
        // 不透明霾罩（土卫六）：远观为无特征橙色盘（卡西尼可见光实拍）；
        // 下降穿越霾层（~200 km，app≈0.93 对应高度 < 7.5%R）时逐渐显露表面。
        float veilEff = uVeil;
        if (uDetailMode > 0) veilEff = uVeil * (1.0 - smoothstep(0.50, 0.93, app));
        albedo = mix(albedo, uVeilColor, veilEff);
        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.06, 0.12, ndl);
        // === Issue #26：地球云层在地表的软阴影 ===
        // 云层球壳略大于行星（1.0035×），UV 映射一致；此处用同一动画偏移采样云层贴图，
        // 在白昼面（day>0）按云层不透明度衰减直射光，产生软阴影。夜面无阴影（无直射光）。
        float cloudShadow = 1.0;
        if (uBodyId == 3 && uHasClouds == 1 && uDetailMode > 0) {
          // 与 createCloudMaterial 中相同的 UV 动画（旋转 + 扰动），保证阴影与可见云对齐
          float cloudAngle = uTime * 0.00002; // 云层略快于地球自转（大气超旋转）
          vec2 cUV = vec2(vUv.x + cloudAngle, vUv.y);
          float disturb = pnoise(vec3(vUv * 8.0, uTime * 0.008));
          cUV += vec2(disturb * 0.008, disturb * 0.004);
          vec3 cloudCol = texture2D(uCloudTex, cUV).rgb;
          // 阈值化云 alpha：贴图背景灰会在全盘面罩上薄白纱，真实地球有大片晴空区
          float cloudAlpha = clamp((dot(cloudCol, vec3(0.34)) - 0.10) * 1.8, 0.0, 1.0);
          cloudShadow = 1.0 - cloudAlpha * 0.32 * day;
        }
        // 环投影：沿太阳方向与环平面求交，落在环半径内则按环光学深度遮挡直射光
        float ringSh = 1.0;
        if (uHasRing == 1) {
          vec3 rel = vPosW - uCenter;
          float denom = dot(uRingNormal, uSunDir);
          if (abs(denom) > 1e-4) {
            float t = -dot(uRingNormal, rel) / denom;
            if (t > 0.0) {
              float r = length(rel + uSunDir * t);
              float u = (r - uRingInner) / (uRingOuter - uRingInner);
              if (u > 0.0 && u < 1.0) {
                float a = uHasRingTex == 1 ? texture2D(uRingTex, vec2(u, 0.5)).a : 0.3;
                ringSh = 1.0 - a * 0.88;
              }
            }
          }
        }
        // === 无气天体：Hapke 风化层 BRDF 取代 Lambert ===
        // 真实月面在相位角趋近 0° 时亮度陡增（满月比线性外推亮 40%+），这是裸眼与
        // 实拍照片里最显著的月面特征，Lambert 完全给不出。采用 Hapke(1981/1986) 常用简化式：
        //   r = (w/4π)·[μ0/(μ0+μ)]·[(1+B(α))·P(α) + H(μ0)H(μ) − 1]
        //   B(α) = B0/(1+tan(α/2)/h)          冲日项
        //   P(α) = Henyey-Greenstein（负 g = 后向散射）
        //   H(x) = (1+2x)/(1+2x√(1−w))        Chandrasekhar 近似
        // r 里已含 cos(入射角)，故此处不再另乘 ndl；按 r·π/w 归一到同反照率的
        // Lambert，使既有亮度体系（uSunI / 曝光 / 逐天体分级）无需重标定。
        float shade = max(ndl, 0.0);
        if (uHapke == 1) {
          vec3 V = normalize(cameraPosition - vPosW);
          vec3 L = normalize(uSunDir);
          float mu0 = max(dot(n, L), 0.0);
          float mu  = max(dot(n, V), 0.0);
          float ca  = clamp(dot(L, V), -1.0, 1.0);
          float alpha = acos(ca);
          float B = uB0 / (1.0 + tan(alpha * 0.5) / max(uHh, 1e-4));
          float gg = uHg;
          float denom = 1.0 + gg * gg + 2.0 * gg * ca;
          float P = (1.0 - gg * gg) / pow(max(denom, 1e-4), 1.5);
          float sq = sqrt(max(1.0 - uW, 1e-4));
          float H0 = (1.0 + 2.0 * mu0) / (1.0 + 2.0 * mu0 * sq);
          float H1 = (1.0 + 2.0 * mu)  / (1.0 + 2.0 * mu  * sq);
          float r = (uW / 12.566370614) * (mu0 / max(mu0 + mu, 1e-4))
                  * ((1.0 + B) * P + H0 * H1 - 1.0);
          shade = clamp(r * 3.14159265 / max(uW, 1e-3), 0.0, 4.0);
        }
        // === 日食遮蔽（逐片元）===
        // 原实现只在场景里插一个黑色锥体网格：接收体表面本身不变暗，
        // 于是"日全食时地面还是亮的"——这是与真实相差最远的一处。
        // 这里按真实的可见性判据算：从该片元看，遮挡体与太阳的**角半径**谁大、
        // 两者中心的**角分离**多少，决定遮蔽比例（贝利珠/日冕环等更细的效应仍未建模）。
        float eclSh = 1.0;
        if (uEclOn == 1) {
          vec3 toOcc = uEclPos - vPosW;
          float dOcc = max(length(toOcc), 1.0);
          float aOcc = asin(clamp(uEclR / dOcc, 0.0, 1.0));
          float aSun = asin(clamp(SUN_RADIUS_KM / max(uSunDistKm, 1.0), 0.0, 1.0));
          float sep = acos(clamp(dot(toOcc / dOcc, normalize(uSunDir)), -1.0, 1.0));
          // 两圆盘重叠比例。下界必须是 |aOcc−aSun| 而不是 aSun−aOcc：
          // 当遮挡体角半径远大于太阳时（木星遮木卫：9.6° vs 0.05°），
          // 正对时 sep=0 会落在 aSun−aOcc 与 aSun+aOcc 的正中，只给出 50% —— 
          // 而物理上此时太阳被完全挡住，应当是全遮。
          float lo = abs(aOcc - aSun), hi = aOcc + aSun;
          float cover = 1.0 - smoothstep(lo, hi, sep);
          eclSh = 1.0 - cover;
        }
        vec3 col = albedo * shade * uSunI * ringSh * cloudShadow * eclSh;
        // 气巨临边昏暗（厚大气斜视光程长 → 边缘变暗，旅行者/卡西尼实拍特征）
        if (uDetailMode == 2) {
          float muv = max(dot(n, normalize(-vPosW)), 0.0);
          col *= 0.55 + 0.45 * pow(muv, 0.55);
        }
        // === Issue #27：火星全球尘暴 ===
        // Ls 180-360 为风暴季（南半球春冬）；程序化噪声生成尘暴纹理，
        // 全球迷雾覆盖降低表面可见度，色调偏黄粉（悬浮 Fe₂O₃ 尘埃）。
        if (uBodyId == 4 && uDetailMode > 0) {
          // 风暴季强度：Ls 180-220 上升，220-330 全盛，330-360 衰退
          float stormSeason = smoothstep(180.0, 220.0, uLs) * (1.0 - smoothstep(330.0, 360.0, uLs));
          vec3 dp = vObjPos / uRadius;
          // 双尺度噪声：大尺度尘暴团 + 小尺度纹理
          float dust = 0.5 + 0.5 * pnoise(dp * 4.0 + vec3(uTime * 0.015));
          dust *= 0.6 + 0.4 * pnoise(dp * 10.0 + vec3(uTime * 0.03));
          // 黄粉色迷雾覆盖：混合尘色并降低表面可见度
          vec3 dustColor = vec3(0.82, 0.62, 0.45);
          float haze = stormSeason * dust * 0.55;
          col = mix(col, col * dustColor * 0.7 + dustColor * 0.12, haze);
        }
        // 极微弱环境光（星光/行星际散射），避免夜面纯黑
        col += albedo * 0.0035;
        if (uHasNight == 1) {
          vec3 city = texture2D(uNight, vUv).rgb;
          // 城市灯光：3.0 倍增益 + 微暖色温（ISS 夜拍观感——金色灯网；ACES 低照度区压缩需补偿）
        vec3 cityGlow = city * vec3(1.12, 1.0, 0.82);
        col += cityGlow * (1.0 - day) * 3.0;
        }
        if (uOcean == 1) {
          float oceanMask = clamp((albedo.b - max(albedo.r, albedo.g * 0.9)) * 6.0, 0.0, 1.0);
          vec3 v = normalize(cameraPosition - vPosW);
          vec3 h = normalize(uSunDir + v);
          // 太阳耀斑：真实海面耀斑是紧凑亮斑（阵风粗糙海面 ~3° 散布），
          // 旧值 90 次幂过宽（整片白昼面中央巨大白晕），1.6 倍增益洗白海洋
          float spec = pow(max(dot(n, h), 0.0), 340.0);
          col += vec3(1.0, 0.97, 0.9) * spec * oceanMask * uSunI * max(ndl, 0.0) * 1.1;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}

/** 云层材质（半透明球壳，受同一太阳方向照明）
 *  Issue #26：程序化云层动画——缓慢旋转（与地球自转有微小差异）+ 噪声扰动 UV。
 *  网络失败时 builder 不创建云层网格（回退到静态无云地球），此函数仅在贴图可用时调用。 */
export function createCloudMaterial(cloudTex, opts = {}) {
  const R = opts.radiusKm ?? 6371;
  // 云层垂直范围：云底 1.5 km 到云顶 22 km（真实地球云顶约 12–16 km，深对流可到 20 km）。
  // 壳体网格放在外边界上，步进区间由着色器解析求交得到，与光栅化在哪个面无关。
  const baseR = R * (opts.baseRatio ?? 1.0002);
  const topR = R * (opts.topRatio ?? 1.0035);
  const uniforms = {
    uMap: { value: cloudTex },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uSunI: { value: 1.0 },
    uTime: { value: 0 }, // 秒，驱动云层旋转与扰动
    uCenter: { value: new THREE.Vector3() }, // 行星中心（相机相对，km），每帧更新
    uRBase: { value: baseR },
    uRTop: { value: topR },
    uThicknessKm: { value: topR - baseR },
    // 体积云只在 High 档开启（见着色器内的说明）
    uVolumetric: { value: (opts.volumetric ?? (QUALITY.tier === 'high' && QUALITY.detail)) ? 1 : 0 },
    uSteps: { value: QUALITY.cloudN },
    uLightSteps: { value: QUALITY.cloudNL },
    uCameraInside: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // 体积步进累加出来的是预乘颜色（每步都乘了自身 alpha 与已累积透射率），
    // 声明为预乘混合，否则会被再乘一次 alpha 而整体发暗。
    premultipliedAlpha: true,
    // DoubleSide + 着色器内按 uCameraInside 丢弃多余的那一面：
    // 从外部看保留正面，从内部看保留背面，两种视角都正确且不重复混合。
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      uniform float uSunI;
      uniform float uTime;
      uniform vec3 uCenter;
      uniform float uRBase;
      uniform float uRTop;
      uniform float uThicknessKm;
      uniform int uVolumetric;   // 0 = 轻量单次采样（Low / 移动端）
      uniform int uSteps;        // 实际步进数，编译期上限之内按距离自适应
      uniform int uLightSteps;
      uniform float uCameraInside;  // 相机是否在云壳内部（决定保留哪一面）
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      // 射线与球求交 → (近交点, 远交点)；未命中返回 (1,-1)
      vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
        vec3 oc = ro - c;
        float b = dot(oc, rd);
        float h = b * b - (dot(oc, oc) - r * r);
        if (h < 0.0) return vec2(1.0, -1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      // 世界坐标 → 该天体体固系的等距圆柱 UV
      vec2 latLonOf(vec3 q) {
        vec3 rel = q - uCenter;
        float rl = max(length(rel), 0.001);
        // u = atan2(z,-x)/2π ≡ atan2(z,x)/2π + 0.5（mod 1）；
        // v 必须与 Three.js SphereGeometry 的 uv 一致：uv.y = 1 在北极，
        // 所以是 0.5 + asin(y)/π 而不是减——写反了会把云图上下翻转采样。
        return vec2(atan(rel.z, rel.x) / 6.2831853 + 0.5,
                    0.5 + asin(clamp(rel.y / rl, -1.0, 1.0)) / 3.14159265);
      }

      // 与行星材质相同的 value-noise，保证云层扰动与地表阴影一致
      float phash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      /**
       * 云密度：贴图给出水平覆盖，垂直方向用经验廓线。
       * 廓线底部渐入、上部渐出、云顶最锐——掠射时才会看到"云顶"这条边，
       * 而不是原来那种上下一样厚的平板。
       */
      float cloudDensity(vec2 uv, float hFrac) {
        // 云层旋转：略快于地球自转（大气超旋转，金星效应的微弱版本）
        float disturb = pnoise(vec3(uv * 8.0, uTime * 0.008));
        vec2 cUV = vec2(uv.x + uTime * 0.00002, uv.y) + vec2(disturb * 0.008, disturb * 0.004);
        vec3 cl = texture2D(uMap, cUV).rgb;
        // 阈值化：去除贴图背景灰造成的全球薄纱（真实地球约六成云量且有成片晴空）
        float cover = clamp((dot(cl, vec3(0.34)) - 0.10) * 1.8, 0.0, 1.0);
        float prof = smoothstep(0.0, 0.18, hFrac) * (1.0 - smoothstep(0.55, 1.0, hFrac));
        return cover * prof;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        vec3 rd = normalize(vPosW);
        vec3 ro = vec3(0.0);            // 浮动原点：相机恒在世界原点
        vec3 L = normalize(uSunDir);

        // 云壳的面剔除：相机在壳外要保留正面（近半球，在行星之前，深度测试能通过），
        // 在壳内（地表、低空）则要保留背面——壳外的正面此时朝后，会被整体剔除，
        // 那正是"从地面看不到云"的原因。只用 FrontSide 或只用 BackSide 都只能覆盖一半。
        // 步进区间一律由解析求交得到，与光栅化在哪个面无关。
        if (uCameraInside > 0.5) { if (gl_FrontFacing) discard; }
        else { if (!gl_FrontFacing) discard; }

        vec2 tRt = raySphere(ro, rd, uCenter, uRTop);
        float tEnter = max(tRt.x, 0.0);
        if (tRt.y <= tEnter) discard;

        float dayF = smoothstep(-0.06, 0.12, dot(n, L));
        vec3 nightTint = mix(vec3(0.010, 0.013, 0.020), vec3(0.004), dayF);

        // ── 轻量路径：单次采样 ───────────────────────────────────────
        // Low / 移动端。SwiftShader 软件渲染下实测（地球充满画面，p50）：
        //   云层关闭 92.4 ms ｜ 轻量 99.3 ms（+7%）｜ 体积 126.6 ms（+37%）
        // 体积路径相对轻量多 27 ms，集显会把 45 FPS 拖到 30 出头——
        // 所以默认只在 High 档（独显）开启。软件渲染的绝对值不能外推到真机，
        // 但两条路径之间的比例关系可用。
        // 两条路径都输出**预乘**颜色，与材质的 premultipliedAlpha 一致。
        if (uVolumetric == 0) {
          float d = cloudDensity(latLonOf(ro + rd * tEnter), 0.5);
          // 夜面云层减薄（城市灯光从云隙透出）
          float alpha = clamp(d, 0.0, 1.0) * mix(0.42, 1.0, dayF);
          vec3 col = vec3(max(dot(n, L), 0.0)) * uSunI + nightTint;
          gl_FragColor = vec4(col * alpha, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }

        // ── 体积路径：薄壳内有限步长光线步进 ─────────────────────────
        // 壳厚约 22 km（云底 1.5 km）。只有掠射时路径才显著变长——那正是
        // "云有厚度"最容易看出来的地方：临边的云顶轮廓与逆光银边。
        vec2 tRb = raySphere(ro, rd, uCenter, uRBase);
        float t1 = min(tRt.y, (tRb.x > 0.0 ? tRb.x : tRt.y));
        if (t1 <= tEnter) discard;
        float span = t1 - tEnter;

        const int N = ${QUALITY.cloudN};
        const int NL = ${QUALITY.cloudNL};
        float ds = span / float(N);
        vec3 acc = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < N; i++) {
          if (i >= uSteps) break;
          vec3 pp = ro + rd * (tEnter + (float(i) + 0.5) * ds);
          vec3 rel = pp - uCenter;
          float rl = length(rel);
          float hFrac = clamp((rl - uRBase) / max(uThicknessKm, 0.001), 0.0, 1.0);
          float d = cloudDensity(latLonOf(pp), hFrac);
          if (d <= 0.002) continue;
          // 自阴影：沿太阳方向短程步进累计云内光程（云被自身上方遮挡而变暗）
          float shadow = 0.0;
          for (int j = 1; j <= NL; j++) {
            if (j > uLightSteps) break;
            vec3 q = pp + L * (float(j) * ds);
            float ql = max(length(q - uCenter), 0.001);
            float qh = clamp((ql - uRBase) / max(uThicknessKm, 0.001), 0.0, 1.0);
            shadow += cloudDensity(latLonOf(q), qh);
          }
          float sunT = exp(-shadow * 1.7);
          // 前向散射银边：逆光时云缘发亮（真实云最标志性的特征之一）
          float silver = pow(clamp(dot(rd, L), 0.0, 1.0), 8.0) * 1.6;
          float ndl = dot(normalize(rel), L);
          vec3 lit = (vec3(max(ndl, 0.0)) * sunT + vec3(silver * sunT * 0.3)) * uSunI;
          float a = 1.0 - exp(-d * ds * 0.55);
          acc += lit * a * T;
          T *= 1.0 - a;
          if (T < 0.01) break;
        }
        acc += nightTint * (1.0 - T);
        gl_FragColor = vec4(acc, 1.0 - T);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}
