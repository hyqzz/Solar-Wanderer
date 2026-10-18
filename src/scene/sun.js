// 太阳：动态表面着色器（米粒组织流动 + 临边昏暗）+ 真实日冕。
// 注：此前以"太空无光晕"为由移除了所有光晕——但日冕本身是真实物理结构
// （K 冕电子汤姆孙散射，日全食/太空近距均可见），与镜头泛光 artifacts 是两回事。
// 这里恢复的是物理日冕：1/r^2.5 径向衰减 + 赤道冕流调制，仍不渲染镜头光晕。

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';

export function createSun(radiusKm, mapTex) {
  const group = new THREE.Group();

  const uniforms = {
    uTime: { value: 0 },
    // 太阳活动 0..1（实测周期极值表插值，见 astro/solarCycle.js）——调制黑子覆盖率
    uSolarActivity: { value: 0.5 },
    uMap: { value: mapTex },
    // 场景曝光（相机为地表自动曝光）的**倒数**。光球表面辐亮度是常数，不随
    // 日心距变化；若让它跟着场景曝光走，飞到冥王星时日面会被放大 ~900 倍、
    // 彻底削成白盘。除以曝光后，日面在任何轨道上看起来一样亮。
    // 由 main.js 每帧写入（着色器里拿不到 toneMappingExposure——色调映射在 OutputPass 做）。
    uInvExposure: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewV;
      void main() {
        vUv = uv;
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalMatrix * normal;
        vViewV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime;
      uniform float uSolarActivity;
      uniform float uInvExposure;
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewV;

      ${HASH_GLSL}
      float hash(vec3 p) { return glslHash31(p); }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); a *= 0.5; p *= 2.1; }
        return s;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 p = normalize(vPos);
        vec3 sampled = texture2D(uMap, vUv).rgb;
        // 贴图（sun.jpg）是橙色的显示参考图，只提供**结构**（米粒、黑子），
        // 不提供颜色。取它的亮度做结构，再乘 5772 K 黑体的色度。
        //
        // 旧实现把 base 写成 vec3(luminance)，是**纯灰**——太阳被画成了一颗灰白球，
        // 可见光下最不该错的颜色反而错了。真实的日面是略带暖调的白：
        // 归一化黑体色度约 (1.0, 0.975, 0.93)（蓝端略低，所以看着"白里透暖"）。
        float luminance = dot(sampled, vec3(0.2126, 0.7152, 0.0722));
        // **保留贴图自身的色相**，只把亮度归一。
        //
        // 旧实现取纯亮度再乘一个色度常数（先是纯灰，后来是暖金），等于把贴图
        // 里最宝贵的那部分——太阳标志性的暖橙色——整个丢掉了。线上是直接用
        // 贴图颜色，所以一眼就是太阳；本地被画成灰白/土黄的麻点球。
        // 归一亮度是为了不依赖 sun.jpg 的曝光，色相与结构（米粒、黑子）全保留。
        vec3 base = sampled * (0.85 / max(luminance, 1e-3));
        // Solar granules are ~1 Mm, rather than planet-scale flowing patches.
        // Suppress frequencies below a pixel to avoid scintillation in orbit.
        float fp = length(fwidth(p));
        float a1 = 1.0 - smoothstep(0.35, 0.9, fp * 700.0);
        float a2 = 1.0 - smoothstep(0.35, 0.9, fp * 1450.0);
        float g1 = a1 > 0.01 ? vnoise(p * 700.0 + uTime * 0.001) : 0.5;
        float g2 = a2 > 0.01 ? vnoise(p * 1450.0 - uTime * 0.002) : 0.5;
        float granule = 1.0 + (g1 - 0.5) * 0.25 * a1 + (g2 - 0.5) * 0.1 * a2;
        // 黑子区域：覆盖率随太阳活动周期变化。
        // 旧实现是固定阈值，等于一年四季黑子数不变——而"此刻太阳活动"
        // 恰恰是观察者最容易注意到的太阳变化：极小年日面可以整月无黑子，
        // 极大年则成群成片。阈值越低，被判为黑子的区域越多。
        //
        // 频率取 17：黑子群相对日面很小（单个本影只占日面千分之几），
        // 旧值 6.0 画出来是几块占日面一成的大斑，一眼就不像太阳。
        // 边界随之收紧（±0.02/±0.03）：真实黑子本影与光球的交界是锐的。
        float spotThr = mix(0.14, 0.30, clamp(uSolarActivity, 0.0, 1.0));
        float spots = 1.0 - smoothstep(spotThr - 0.02, spotThr + 0.03,
                                       fbm(p * 13.0 + 13.7 + uTime * 0.004));
        vec3 col = base * granule * (1.0 - 0.75 * spots);
        col *= vec3(1.0, 0.98, 0.94);
        // 临边昏暗：Neckel & Labs (1994) 五阶多项式，而不是一阶线性近似。
        // 真实光球在视线切向要穿过更厚的、更冷的层，边缘比中心暗且**明显偏红**
        // （边缘有效温度低约 1000 K）。线性式在 μ≈0.2 处凑巧接近，中段偏暗约 6%，
        // 且完全给不出边缘的红化。
        float mu = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
        float ld = 0.30 + 0.93 * mu - 0.23 * mu * mu + 0.14 * mu * mu * mu
                 - 0.16 * mu * mu * mu * mu + 0.02 * mu * mu * mu * mu * mu;
        // 波长依赖：蓝光临边变暗更快（瑞利散射与 H⁻ 不透明度在蓝端更强），
        // 用逐通道幂次近似——μ 越小蓝通道衰减越快，边缘因此偏红。
        col *= vec3(ld, pow(ld, 1.10), pow(ld, 1.30));
        // 太阳**不参与场景曝光**。光球表面辐亮度是常数，不随日心距变化；
        // 而场景曝光按 d² 变化（相机为地表自动曝光）——若直接乘进去，飞到冥王星
        // 时日面会被曝光放大 ~900 倍、彻底削成白盘。
        // tonemapping_fragment 会再乘一次 toneMappingExposure，所以这里先除掉，
        // 净输入恒定：日面在海王星轨道与在地球轨道上看起来一样亮。
        //
        // 系数是**色调映射的标定**，必须让日面落在 ACES 的线性段（≲0.8）：
        // 一旦越过拐点，ACES 会把三个通道一起压向白，色相与米粒组织全部丢失。
        // 此前取 2.2 —— 那已经在肩部以上，实测日面被削成一颗灰白麻点球，
        // 与"一眼认得出是太阳"直接冲突（对比线上：橙黄米粒组织）。
        // 0.92 让中心落在拐点下方，临边昏暗与色温都保留下来。
        gl_FragColor = vec4(col * 0.85 * uInvExposure, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radiusKm, 96, 64), mat);
  group.add(mesh);

  // ── 日冕：相机朝向的公告板，K 冕 r^-2.5 衰减 + 赤道冕流 + 极区冕洞变暗 ──
  const coronaUniforms = {
    uTime: { value: 0 },
    uVisibility: { value: 0.000001 },
    uInvExposure: { value: 1 },
  };
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: coronaUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true, // 显式声明（THREE 默认即 true）：日冕可被前景行星遮挡（#14）
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUvC;
      void main() {
        vUvC = uv * 2.0 - 1.0; // [-1,1]，1 = 6 个太阳半径
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime;
      uniform float uVisibility;
      uniform float uInvExposure;   // 与光球同一套"不随场景曝光变化"的处理
      varying vec2 vUvC;

      ${HASH_GLSL}
      float hash2(vec2 p) { return glslHash31(vec3(p, 0.0)); }
      float vnoise2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1,0)), f.x), mix(hash2(i + vec2(0,1)), hash2(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUvC);            // 0..1 → 0..6 太阳半径
        float rR = r * 6.0;                // 太阳半径单位
        if (rR < 0.995) discard;           // 圆面本体由球体渲染
        // K 冕：电子散射，径向 ~r^-2.5
        float k = pow(rR, -2.5);
        // 赤道冕流：方位角低频调制 + 缓慢时间漂移
        float ang = atan(vUvC.y, vUvC.x);
        float streamer = 0.65 + 0.35 * (0.5 + 0.5 * sin(ang * 4.0 + uTime * 0.02))
                       * (0.7 + 0.6 * vnoise2(vec2(ang * 2.0, rR * 1.5 - uTime * 0.03)));
        // 极区冕洞变暗
        float polarDim = 0.55 + 0.45 * abs(cos(ang));
        float i = k * streamer * polarDim;
        // 颜色：近缘暖白 → 远处冷白
        vec3 col = mix(vec3(1.0, 0.93, 0.78), vec3(0.85, 0.9, 1.0), smoothstep(1.0, 4.0, rR));
        float alpha = clamp(i * 0.85 * uVisibility, 0.0, 1.0);
        // 与光球同样先除掉场景曝光：日冕辐亮度同样是常数，不该因为相机在
        // 水星轨道还是海王星轨道而变黑。系数 0.9 让 r=1R 处落在 ACES 线性段。
        gl_FragColor = vec4(col * i * 0.9 * uInvExposure, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  // 公告板尺寸 = 12 个太阳半径（日冕延伸到 ~6R）
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(radiusKm * 12, radiusKm * 12), coronaMat);
  corona.renderOrder = 4;
  corona.frustumCulled = false;
  // 始终面向相机（公告板）
  corona.onBeforeRender = (renderer, scene, camera) => {
    corona.quaternion.copy(camera.quaternion);
  };
  group.add(corona);

  return {
    group, mesh, corona, coronaUniforms, uniforms,
    update(timeSec, camDistKm, occulted = false, solarActivity = null) {
      uniforms.uTime.value = timeSec;
      coronaUniforms.uTime.value = timeSec;
      if (solarActivity !== null) uniforms.uSolarActivity.value = solarActivity;
      // 日冕亮度：K 冕在 1.2 R☉ 处约为光球的 10⁻⁶ 量级，所以"与光球同曝光"的
      // 相机确实拍不到它——旧实现据此把它压到 10⁻⁶，只有日全食才显示。
      // 但那对应的是相机，不是人眼：人眼动态范围约 10¹⁴，航天员在轨肉眼是能看到
      // 日冕的。这里按"人眼观察"渲染：平时给一个很低的基准可见度，形成贴着日面
      // 边缘的淡冕（远亮于无、远暗于日面），日全食时再提升到全强度。
      // 这是显式的显示适配系数，不是物理比值。
      // 0.02 时 r=1R 处 alpha≈0.017——等于永久不可见（线上是有日冕的）。
      // 人眼在轨肉眼可见淡冕，取 0.55；日全食时 1.0。
      coronaUniforms.uVisibility.value = occulted ? 1 : 0.55;
    },
  };
}
