// 日球层结构：终止激波（~90 AU）与日球层顶（~120 AU）。
// 形状采用经典 Parker 模型 r(α) = R₀·√(2/(1+cosα))，鼻向指向星际风上游
// （黄经 ~255.4°，黄纬 ~5.1°），尾部截断拉伸。附旅行者 1/2 号实时近似位置。

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';

const DEG = Math.PI / 180;
// 星际风上游方向（鼻向），黄道坐标
const NOSE_LON = 255.4 * DEG;
const NOSE_LAT = 5.1 * DEG;

function noseDirWorld() {
  const x = Math.cos(NOSE_LAT) * Math.cos(NOSE_LON);
  const y = Math.cos(NOSE_LAT) * Math.sin(NOSE_LON);
  const z = Math.sin(NOSE_LAT);
  return new THREE.Vector3(x, z, -y); // 黄道→世界
}

function makeShell(noseAU, color, opacity) {
  const geo = new THREE.SphereGeometry(1, 96, 64);
  const nose = new THREE.Vector3(0, 0, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const cosA = v.dot(nose);
    const r = Math.min(Math.sqrt(2 / (1 + cosA + 1e-4)), 2.8); // 尾部截断 2.8R
    v.multiplyScalar(noseAU * KM_PER_AU * r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN;
      varying vec3 vPosW;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vPosW;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 v = normalize(-vPosW);
        float fres = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
        gl_FragColor = vec4(uColor * (0.25 + fres), uOpacity * (0.3 + fres));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // 将 +Z（鼻向参考）旋到真实鼻向
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), noseDirWorld());
  mesh.frustumCulled = false;
  return mesh;
}

/** 旅行者号近似星历（线性外推，2026.0 历元；误差 < 1 AU 量级，作日球层探索地标） */
export const VOYAGERS = [
  { id: 'voyager1', nameZh: '旅行者1号', nameEn: 'Voyager 1',
    r0AU: 166.3, rateAUyr: 3.57, lonDeg: 255.3, latDeg: 35.0, epochYear: 2026.0,
    desc: '1977 年发射，2012 年穿越日球层顶进入星际空间，是离地球最远的人造物体。' },
  { id: 'voyager2', nameZh: '旅行者2号', nameEn: 'Voyager 2',
    r0AU: 139.0, rateAUyr: 3.16, lonDeg: 289.0, latDeg: -32.5, epochYear: 2026.0,
    desc: '唯一探访过天王星和海王星的探测器，2018 年进入星际空间。' },
];

export function voyagerPosition(vg, jdTT) {
  const year = 2000 + (jdTT - 2451545.0) / 365.25;
  const r = (vg.r0AU + vg.rateAUyr * (year - vg.epochYear)) * KM_PER_AU;
  const lon = vg.lonDeg * DEG, lat = vg.latDeg * DEG;
  const x = r * Math.cos(lat) * Math.cos(lon);
  const y = r * Math.cos(lat) * Math.sin(lon);
  const z = r * Math.sin(lat);
  return { x, y, z }; // 黄道
}

export function createHeliosphere() {
  const group = new THREE.Group();
  const ts = makeShell(90, 0xff9a55, 0.05);   // 终止激波
  const hp = makeShell(121, 0x55c8ff, 0.06);  // 日球层顶
  group.add(ts, hp);
  group.renderOrder = -6;
  return group;
}
