// 物理大气散射：单次散射光线步进（Nishita 模型）。
// 相机在大气内（地表行走仰望蓝天/晨昏红霞）与大气外（太空中的蓝色弧光）共用同一射线逻辑。
// 注意：本引擎相机恒在场景原点（浮动原点），射线起点即 vec3(0)。

import * as THREE from 'three';
import { QUALITY } from '../engine/quality.js';

export function createAtmosphere(phys, auroraMode = 0) {
  const a = phys.atmosphere;
  const Rg = phys.radiusKm;
  const Ra = Rg + a.heightKm;

  // mie / mieG 均支持标量（向后兼容）与 [R,G,B] 数组（分光，用于火星蓝色日落）
  const mieArr  = Array.isArray(a.mie)  ? a.mie  : [a.mie,  a.mie,  a.mie ];
  const mieGArr = Array.isArray(a.mieG) ? a.mieG : [a.mieG, a.mieG, a.mieG];

  const uniforms = {
    uCenter: { value: new THREE.Vector3() },     // 行星中心（相机相对，km）
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uRg: { value: Rg },
    uRa: { value: Ra },
    uBetaR: { value: new THREE.Vector3(a.rayleigh[0] * 1000, a.rayleigh[1] * 1000, a.rayleigh[2] * 1000) }, // m⁻¹→km⁻¹
    uBetaM: { value: new THREE.Vector3(mieArr[0] * 1000, mieArr[1] * 1000, mieArr[2] * 1000) }, // 分光 Mie (km⁻¹)
    uHR: { value: a.rayleighScaleKm },
    uHM: { value: a.mieScaleKm },
    uG: { value: new THREE.Vector3(mieGArr[0], mieGArr[1], mieGArr[2]) }, // 分光 mieG (Henyey-Greenstein 各向异性)
    uSunI: { value: 13.0 * (a.multiplier ?? 1) },
    uBoost: { value: 1.0 },  // Rayleigh 密度增幅（天空底色，高值 → 明亮白昼天空）
    uBoostM: { value: 1.0 }, // Mie 密度增幅（独立控制，低值 → 太阳盘面不被前向散射淹没）
    uHaze: { value: a.haze ?? 0.0 }, // 近地面气溶胶/尘埃雾霾（火星沙尘、金星硫酸云、泰坦烟霾）
    // 扁率（R8 #1）：气巨网格按 (1−ob) 压扁，大气求交必须用同一椭球，
    // 否则"地面辉光/遮挡"画在正球 Rg 上，与压扁的真实视边缘错开形成双边界。
    // uStretch = 1/(1−ob) − 1（沿极轴拉伸 → 椭球还原为球）；可登陆体网格未压扁 → 0（数学恒等）
    uAxis: { value: new THREE.Vector3(0, 1, 0) }, // 行星自转轴（世界系，每帧更新）
    uStretch: { value: phys.landable ? 0 : (1 / (1 - (phys.oblateness ?? 0)) - 1) },
    // === Issue #27/#29：尘暴 + 极光 uniforms ===
    uTime: { value: 0 },            // 秒（驱动极光帘幕动画）
    uSolarActivity: { value: 0.7 }, // 太阳活动 0..1（调制极光强度）
    uAuroraMode: { value: auroraMode }, // 0=无 1=地球 2=木星 3=土星 4=海卫一
    uAuroraStrength: { value: 1.0 },    // 运行时降档置 0
    uDustStorm: { value: 0.0 },     // 火星尘暴强度 0..1（boost 雾霾）
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    // 外侧：FrontSide + depthTest 让大气只绘制在最近的 opaque 表面之前，
    // 从而被前方卫星/行星本体正确遮挡（#R15 替代方案，避免模板缓冲失效）。
    // 内侧：DoubleSide 保证相机在大气壳内部时仍能看到天空穹顶。
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCenter;
      uniform vec3 uSunDir;
      uniform float uRg, uRa, uHR, uHM, uSunI, uBoost, uBoostM, uHaze, uStretch;
      uniform vec3 uBetaR, uBetaM, uG, uAxis; // uG 分光：蓝光前向峰更尖 → 日落蓝色光晕
      // === Issue #27/#29 uniforms ===
      uniform float uTime;
      uniform float uSolarActivity;
      uniform int uAuroraMode;    // 0=无 1=地球 2=木星 3=土星 4=海卫一
      uniform float uAuroraStrength;
      uniform float uDustStorm;
      varying vec3 vWorldPos;

      // 沿自转轴拉伸：扁椭球 → 正球（uStretch=0 时恒等）
      vec3 stretch(vec3 p) { return p + uAxis * (dot(p, uAxis) * uStretch); }

      // 射线-椭球相交（拉伸空间内对球求交；t 参数与真实空间共享——线性映射保参数），
      // 返回 (tNear, tFar)，无交返回 (1e20, -1e20)
      vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
        vec3 o = stretch(ro - c);
        vec3 d = stretch(rd);
        float a2 = dot(d, d);
        float b = dot(o, d);
        float det = b * b - a2 * (dot(o, o) - r * r);
        if (det < 0.0) return vec2(1e20, -1e20);
        float s = sqrt(det);
        return vec2((-b - s) / a2, (-b + s) / a2);
      }

      // 椭球高度（等效赤道尺度）
      float hAbove(vec3 p) { return length(stretch(p - uCenter)) - uRg; }

      // value-noise（极光帘幕扰动用；与行星材质同源实现保证一致性）
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
        vec3 ro = vec3(0.0);
        vec3 rd = normalize(vWorldPos);

        vec2 tA = raySphere(ro, rd, uCenter, uRa);
        if (tA.x > tA.y) discard;
        float t0 = max(tA.x, 0.0);
        float t1 = tA.y;
        vec2 tG = raySphere(ro, rd, uCenter, uRg);
        if (tG.x < tG.y && tG.x > 0.0) t1 = min(t1, tG.x);
        if (t1 <= t0) discard;

        const int N = ${QUALITY.atmoN};
        const int NL = ${QUALITY.atmoNL};
        float ds = (t1 - t0) / float(N);
        float odR = 0.0, odM = 0.0;
        vec3 inscR = vec3(0.0), inscM = vec3(0.0);
        vec3 auroraL = vec3(0.0); // Issue #29：极光发射累积（非散射，独立于 BetaR/BetaM）

        for (int i = 0; i < N; i++) {
          vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
          float h = hAbove(p);
          float dR = exp(-h / uHR) * uBoost;   // Rayleigh 密度（天空底色）
          // 近地面气溶胶层：低标高指数衰减；uBoostM 独立于 uBoost，避免前向散射淹没太阳
          // Issue #27：火星尘暴季 boost 雾霾（uDustStorm > 0 时增厚近地面尘埃层）
          float hazeEff = uHaze + uDustStorm * 0.6;
          float dM = (exp(-h / uHM) + hazeEff * exp(-h / max(uHM * 0.22, 0.5))) * uBoostM;
          odR += dR * ds;
          odM += dM * ds;
          // 向太阳的光学深度
          vec2 tS = raySphere(p, uSunDir, uCenter, uRa);
          float sl = max(tS.y, 0.0) / float(NL);
          float olR = 0.0, olM = 0.0;
          bool shadowed = false;
          vec2 tSG = raySphere(p, uSunDir, uCenter, uRg * 0.998);
          if (tSG.x < tSG.y && tSG.y > 0.0 && tSG.x > 0.0) shadowed = true;
          if (!shadowed) {
            for (int j = 0; j < NL; j++) {
              vec3 q = p + uSunDir * ((float(j) + 0.5) * sl);
              float hq = hAbove(q);
              olR += exp(-hq / uHR) * sl;
              olM += exp(-hq / uHM) * sl;
            }
            vec3 T = exp(-(uBetaR * (odR + olR) + uBetaM * 1.1 * (odM + olM)));
            inscR += T * dR * ds;
            inscM += T * dM * ds; // 分光 Mie：保留各通道透射率，蓝光前向散射在日落处显现
          }
          // === Issue #29：极光帘幕发射 ===
          // 高纬度极光卵（~65-75°磁纬）+ 高度带（地球 60-180km，气巨更高）。
          // 帘幕效果：双尺度噪声产生垂直光带 + 时间动画。
          // uAuroraMode=0 时跳过（无极光天体）；uAuroraStrength=0 时降档关闭。
          if (uAuroraMode > 0 && uAuroraStrength > 0.001) {
            vec3 srel = stretch(p - uCenter);
            float sh = length(srel) - uRg;
            // 极光高度带：地球 60-180km，木星/土星 30-300km（更厚的极光层）
            float altMin = uAuroraMode == 2 ? 30.0 : 60.0;
            float altMax = uAuroraMode == 2 ? 300.0 : 180.0;
            float altF = smoothstep(altMin, altMin + 20.0, sh)
                       * (1.0 - smoothstep(altMax - 40.0, altMax, sh));
            // 磁纬度（近似为地理纬度：用自转轴方向 dot）
            float magLat = dot(normalize(srel), uAxis);
            float poleProx = abs(magLat);
            // 极光卵：极区边缘的环形带（poleProx ~0.85-0.96）
            float oval = smoothstep(0.80, 0.90, poleProx)
                       * (1.0 - smoothstep(0.96, 1.0, poleProx));
            // 帘幕：垂直光带（沿极轴方向拉伸的噪声）+ 时间扰动
            float curtain1 = pnoise(srel * 5.0 + vec3(0.0, 0.0, uTime * 0.4));
            float curtain2 = pnoise(srel * 11.0 + vec3(uTime * 0.2, 0.0, 0.0));
            float auroraInt = altF * oval
                            * (0.5 + 0.5 * curtain1)
                            * (0.7 + 0.3 * curtain2);
            auroraInt *= uSolarActivity * uAuroraStrength;
            // 极光颜色（不同天体不同激发粒子）：
            //  地球=OI 557.7nm 绿；木星=H3+ 蓝紫；土星=H3+ 粉紫；海卫一=弱 N2 红
            vec3 aColor;
            if (uAuroraMode == 1) aColor = vec3(0.15, 1.0, 0.35);
            else if (uAuroraMode == 2) aColor = vec3(0.55, 0.35, 1.0);
            else if (uAuroraMode == 3) aColor = vec3(0.80, 0.45, 0.90);
            else aColor = vec3(0.90, 0.40, 0.30);
            auroraL += aColor * auroraInt * ds;
          }
        }

        float mu = dot(rd, uSunDir);
        float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        // 分光 Henyey-Greenstein：uG 为 vec3，蓝通道前向峰更尖，日落时产生蓝色光晕
        vec3 g2 = uG * uG;
        vec3 phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) /
                   ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * uG * mu, vec3(1e-6)), vec3(1.5)));

        vec3 L = uSunI * (uBetaR * phR * inscR + uBetaM * phM * inscM);
        L += auroraL; // Issue #29：极光为发射光（非散射），直接叠加到出射辐亮度
        vec3 viewT = exp(-(uBetaR * odR + uBetaM * 1.1 * odM));
        float alpha = 1.0 - dot(viewT, vec3(0.3333));

        // 轻微抖动消除条带（×alpha：仅作用于有大气信号处。R8 #1 修复——
        // 旧实现无条件加在整个壳投影盘上，外太阳系高曝光下显形为以 Ra 为界的圆圈线）
        float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 255.0;
        gl_FragColor = vec4(L + dith * alpha, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(Ra, 64, 48), mat);
  mesh.renderOrder = 100;
  mesh.frustumCulled = true;
  mat.userData.uniforms = uniforms;
  return mesh;
}
