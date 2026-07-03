// 行星表面材质：自定义光照着色器。
// - 真实太阳方向的昼夜明暗（平滑晨昏线）
// - 地球：夜面城市灯光 + 海洋镜面反射（按贴图蓝色启发式掩码）
// - HDR：太阳辐照度按 1/d²（地球处=1）缩放
// - R7 #4：片元程序化细节（分辨率无关，SpaceEngine 路线）——
//   气巨/冰巨：纬向拉伸湍流双尺度 + 风暴涡 + 临边昏暗；岩质：各向同性细节。
//   按行星视半径淡入：远观与 R5 审查版一致，贴近时低清贴图不再糊。

import * as THREE from 'three';

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

export function createPlanetMaterial({
  map, nightMap = null, oceanSpec = false, ringShadow = null,
  detailMode = 0, radiusKm = 1, // detailMode: 0 无 / 1 岩质 / 2 气巨冰巨
  bodyId = null, cloudTex = null, // bodyId 驱动天体特定效果；cloudTex 用于地球云层投影
}) {
  // ringShadow: { tex|null, innerKm, outerKm } —— 环对行星本体的投影（卡西尼实拍标志性特征）
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
        // 程序化细节（按行星视半径淡入，远观恒等于原贴图）
        if (uDetailMode > 0) {
          float dist = length(vPosW); // 相机恒在原点（浮动原点）
          float app = uRadius / max(dist, uRadius); // 视半径因子 0..1
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
              albedo *= 1.0 + fade * ((t1 - 0.5) * 0.16 + (t2 - 0.5) * 0.10);
              albedo = mix(albedo, albedo * vec3(1.10, 1.05, 0.97), fade * storm * 0.55);
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
            // 大红斑：~22°S 反气旋，随 System III 缓慢漂移
            float lon = atan(vObjPos.z, vObjPos.x);
            float grsLon = uTime * 0.00006; // 漂移速率（视觉化，非精确轨道力学）
            float grsLatDist = abs(lat + 0.38); // 纬度匹配
            float grsLonDist = abs(angleDiff(lon, grsLon));
            // smoothstep 要求 edge0 < edge1（GLSL ES 规范），用 1-smoothstep 实现反向衰减
            float grs = (1.0 - smoothstep(0.0, 0.45, grsLonDist))
                      * (1.0 - smoothstep(0.0, 0.16, grsLatDist));
            albedo = mix(albedo, vec3(0.62, 0.28, 0.16), grs * 0.6);
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
        }
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
          float cloudAlpha = clamp(dot(cloudCol, vec3(0.34)) * 1.4, 0.0, 1.0);
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
        vec3 col = albedo * max(ndl, 0.0) * uSunI * ringSh * cloudShadow;
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
          col += city * (1.0 - day) * 0.45;
        }
        if (uOcean == 1) {
          float oceanMask = clamp((albedo.b - max(albedo.r, albedo.g * 0.9)) * 6.0, 0.0, 1.0);
          vec3 v = normalize(cameraPosition - vPosW);
          vec3 h = normalize(uSunDir + v);
          float spec = pow(max(dot(n, h), 0.0), 90.0);
          col += vec3(1.0, 0.97, 0.9) * spec * oceanMask * uSunI * max(ndl, 0.0) * 1.6;
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
export function createCloudMaterial(cloudTex) {
  const uniforms = {
    uMap: { value: cloudTex },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uSunI: { value: 1.0 },
    uTime: { value: 0 }, // 秒，驱动云层旋转与扰动
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
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
      varying vec2 vUv;
      varying vec3 vNormalW;

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

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        float ndl = dot(n, uSunDir);
        // 云层旋转：略快于地球自转（大气超旋转，金星效应的微弱版本）
        float cloudAngle = uTime * 0.00002;
        vec2 cUV = vec2(vUv.x + cloudAngle, vUv.y);
        // 程序化扰动：噪声偏移 UV，产生有机云层演化（非刚体旋转）
        float disturb = pnoise(vec3(vUv * 8.0, uTime * 0.008));
        cUV += vec2(disturb * 0.008, disturb * 0.004);
        vec3 cl = texture2D(uMap, cUV).rgb;
        float alpha = clamp(dot(cl, vec3(0.34)) * 1.4, 0.0, 1.0);
        vec3 col = vec3(1.0) * max(ndl, 0.0) * uSunI + vec3(0.004);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}
