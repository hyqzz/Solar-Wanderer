// 太阳：动态表面着色器（米粒组织流动）+ 日冕辉光 + 镜头光晕精灵。
// HDR 强度高于 1，交给 ACES 色调映射与泛光形成真实曝光观感。

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

  // 日冕：面向相机的多层径向衰减精灵
  const coronaTex = makeCoronaTexture();
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: coronaTex, color: 0xffd9a0, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  corona.scale.setScalar(radiusKm * 7);
  group.add(corona);

  const glare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: coronaTex, color: 0xfff4e0, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  glare.scale.setScalar(radiusKm * 2.6);
  group.add(glare);

  return {
    group, mesh,
    update(timeSec, camDistKm) {
      uniforms.uTime.value = timeSec;
      // 光晕双向缩放：远处保持可见亮星；近处随辐照度增强
      //（水星处阳光为地球 6 倍，太阳应是炫目光团——人眼/相机眩光半径随光通量增长）
      const kFar = Math.min(60, Math.max(1, camDistKm / (radiusKm * 220)));
      const dAU = camDistKm / 1.495978707e8;
      const kNear = Math.min(8, Math.max(1, Math.pow(1 / Math.max(dAU, 0.02), 0.9)));
      glare.scale.setScalar(radiusKm * 2.6 * Math.max(kFar, kNear));
      corona.scale.setScalar(radiusKm * 7 * Math.min(kNear, 2.5));
    },
  };
}

function makeCoronaTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.08, 'rgba(255,240,210,0.85)');
  g.addColorStop(0.25, 'rgba(255,210,140,0.28)');
  g.addColorStop(0.6, 'rgba(255,180,100,0.07)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
