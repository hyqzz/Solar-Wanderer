// 太阳：动态表面着色器（米粒组织流动 + 临边昏暗）+ 真实日冕。
// 注：此前以"太空无光晕"为由移除了所有光晕——但日冕本身是真实物理结构
// （K 冕电子汤姆孙散射，日全食/太空近距均可见），与镜头泛光 artifacts 是两回事。
// 这里恢复的是物理日冕：1/r^2.5 径向衰减 + 赤道冕流调制，仍不渲染镜头光晕。

import * as THREE from 'three';

export function createSun(radiusKm, mapTex) {
  const group = new THREE.Group();

  const uniforms = {
    uTime: { value: 0 },
    uMap: { value: mapTex },
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
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewV;

      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
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
        vec3 base = texture2D(uMap, vUv).rgb;
        float g1 = fbm(p * 18.0 + uTime * 0.05);
        float g2 = fbm(p * 55.0 - uTime * 0.09);
        float granule = 0.72 + 0.55 * g1 + 0.3 * g2;
        // 暗化的"黑子"区域
        float spots = smoothstep(0.32, 0.2, fbm(p * 6.0 + 13.7 + uTime * 0.004));
        vec3 col = base * granule * (1.0 - 0.75 * spots);
        col *= vec3(1.02, 0.97, 0.9);
        // 临边昏暗（真实光球物理：视线切向穿越更深更冷的大气层）
        float mu = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
        col *= 0.35 + 0.65 * mu;
        gl_FragColor = vec4(col * 14.0, 1.0); // HDR 强度
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
  };
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: coronaUniforms,
    transparent: true,
    depthWrite: false,
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
      varying vec2 vUvC;

      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
        float alpha = clamp(i * 0.85, 0.0, 1.0);
        gl_FragColor = vec4(col * i * 2.2, alpha);
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
    group, mesh, corona,
    update(timeSec, camDistKm) {
      uniforms.uTime.value = timeSec;
      coronaUniforms.uTime.value = timeSec;
    },
  };
}
