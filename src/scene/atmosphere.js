// 物理大气散射：单次散射光线步进（Nishita 模型）。
// 相机在大气内（地表行走仰望蓝天/晨昏红霞）与大气外（太空中的蓝色弧光）共用同一射线逻辑。
// 注意：本引擎相机恒在场景原点（浮动原点），射线起点即 vec3(0)。

import * as THREE from 'three';
import { QUALITY } from '../engine/quality.js';

export function createAtmosphere(phys) {
  const a = phys.atmosphere;
  const Rg = phys.radiusKm;
  const Ra = Rg + a.heightKm;

  const uniforms = {
    uCenter: { value: new THREE.Vector3() },     // 行星中心（相机相对，km）
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uRg: { value: Rg },
    uRa: { value: Ra },
    uBetaR: { value: new THREE.Vector3(a.rayleigh[0] * 1000, a.rayleigh[1] * 1000, a.rayleigh[2] * 1000) }, // m⁻¹→km⁻¹
    uBetaM: { value: a.mie * 1000 },
    uHR: { value: a.rayleighScaleKm },
    uHM: { value: a.mieScaleKm },
    uG: { value: a.mieG },
    uSunI: { value: 13.0 * (a.multiplier ?? 1) },
    uBoost: { value: 1.0 }, // 入气密度增幅（相机在大气外恒 1 → 外观与 R5 审查版逐位一致）
    // 扁率（R8 #1）：气巨网格按 (1−ob) 压扁，大气求交必须用同一椭球，
    // 否则"地面辉光/遮挡"画在正球 Rg 上，与压扁的真实视边缘错开形成双边界。
    // uStretch = 1/(1−ob) − 1（沿极轴拉伸 → 椭球还原为球）；可登陆体网格未压扁 → 0（数学恒等）
    uAxis: { value: new THREE.Vector3(0, 1, 0) }, // 行星自转轴（世界系，每帧更新）
    uStretch: { value: phys.landable ? 0 : (1 / (1 - (phys.oblateness ?? 0)) - 1) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // 保留 depthTest:false：大气散射需要覆盖在行星本体盘面上（地球晨昏/蓝雾），
    // 开启深度测试会让行星本体裁掉大气，导致地球外观“失真”。
    // 改用模板缓冲解决卫星遮挡：卫星在它所占据的像素写入 stencil=1，
    // 大气只在 stencil=0 处绘制，从而被前方卫星正确遮挡。
    depthTest: false,
    stencilWrite: false,
    stencilRef: 0,
    stencilFunc: THREE.EqualStencilFunc,
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
      uniform float uRg, uRa, uHR, uHM, uG, uSunI, uBetaM, uBoost, uStretch;
      uniform vec3 uBetaR, uAxis;
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
        vec3 inscR = vec3(0.0);
        float inscM = 0.0;

        for (int i = 0; i < N; i++) {
          vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
          float h = hAbove(p);
          float dR = exp(-h / uHR) * uBoost;
          float dM = exp(-h / uHM) * uBoost;
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
            vec3 T = exp(-(uBetaR * (odR + olR) + vec3(uBetaM) * 1.1 * (odM + olM)));
            inscR += T * dR * ds;
            inscM += dot(T, vec3(0.3333)) * dM * ds;
          }
        }

        float mu = dot(rd, uSunDir);
        float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        float g2 = uG * uG;
        float phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) /
                    ((2.0 + g2) * pow(1.0 + g2 - 2.0 * uG * mu, 1.5));

        vec3 L = uSunI * (uBetaR * phR * inscR + vec3(uBetaM) * phM * inscM);
        vec3 viewT = exp(-(uBetaR * odR + vec3(uBetaM) * 1.1 * odM));
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
