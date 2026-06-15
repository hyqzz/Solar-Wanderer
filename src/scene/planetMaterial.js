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

export function createPlanetMaterial({
  map, nightMap = null, oceanSpec = false, ringShadow = null,
  detailMode = 0, radiusKm = 1, // detailMode: 0 无 / 1 岩质 / 2 气巨冰巨
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
        }
        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.06, 0.12, ndl);
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
        vec3 col = albedo * max(ndl, 0.0) * uSunI * ringSh;
        // 气巨临边昏暗（厚大气斜视光程长 → 边缘变暗，旅行者/卡西尼实拍特征）
        if (uDetailMode == 2) {
          float muv = max(dot(n, normalize(-vPosW)), 0.0);
          col *= 0.55 + 0.45 * pow(muv, 0.55);
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

/** 云层材质（半透明球壳，受同一太阳方向照明） */
export function createCloudMaterial(cloudTex) {
  const uniforms = {
    uMap: { value: cloudTex },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uSunI: { value: 1.0 },
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
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        float ndl = dot(n, uSunDir);
        vec3 cl = texture2D(uMap, vUv).rgb;
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
