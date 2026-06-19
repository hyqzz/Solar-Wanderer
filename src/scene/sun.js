// 太阳：动态表面着色器（米粒组织流动）。
// 刻意不渲染日冕辉光与镜头光晕：真实太空中肉眼/相机不会看到这类叠加光晕，
// 本项目以 1:1 物理真实为最高目标，因此仅保留太阳圆面本身。

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
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
        gl_FragColor = vec4(col * 14.0, 1.0); // HDR 强度
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radiusKm, 96, 64), mat);
  group.add(mesh);

  return {
    group, mesh,
    update(timeSec, camDistKm) {
      uniforms.uTime.value = timeSec;
      // 不再更新 corona/glare：已移除非物理光晕。
    },
  };
}

