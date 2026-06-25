// 日食阴影系统：计算并渲染太阳系内的本影/半影锥。
// 处理三类事件：
//   1. 日食（月球遮挡太阳→地球表面）
//   2. 月食（地球遮挡太阳→月球表面，红色本影）
//   3. 卫星食（行星遮挡太阳→卫星，如木星→伽利略卫星）
// 算法：对每个 光源-遮挡体-接收体 三元组，计算几何阴影锥，
// 用自定义着色器在接收体表面渲染柔和半影渐变。
// 性能：只计算相机附近接收体的日食，远处跳过。

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

/**
 * 日食阴影系统：管理场景中所有活跃的阴影锥。
 * 每帧根据星历位置更新阴影锥几何，在接收体表面渲染半影。
 */
export class EclipseSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cones = [];          // 活跃阴影锥 { mesh, occluderId, receiverId, type }
    this.maxCones = 8;        // 性能上限
    this._nextEclipseCache = null;
    this._nextEclipseJd = 0;
  }

  /**
   * 每帧更新：检查所有可能的三元组，为近距离的创建/更新阴影锥。
   * @param {number} jdTT - 儒略日 TT
   * @param {Map} bodies - builder.bodies: id → { posKm, phys, mesh, ... }
   * @param {Float64Array} camPosKm - 相机位置（日心黄道 km）
   */
  update(jdTT, bodies, camPosKm) {
    const sun = bodies.get('sun');
    if (!sun) return;

    const sunPos = sun.posKm;
    let activeCount = 0;

    // ── 日食：月球→地球 ──
    const moon = bodies.get('moon');
    const earth = bodies.get('earth');
    if (moon && earth) {
      const distCam = _v1.set(camPosKm[0] - earth.posKm[0], camPosKm[1] - earth.posKm[1], camPosKm[2] - earth.posKm[2]).length();
      // 只在地球附近 50 万 km 内渲染日食半影
      if (distCam < 5e5) {
        this._updateCone(activeCount++, 'solar', 'sun', 'moon', 'earth',
          sunPos, moon.posKm, moon.phys.radiusKm, earth.posKm, earth.phys.radiusKm, bodies);
      }
    }

    // ── 月食：地球→月球 ──
    if (moon && earth) {
      const distCam = _v1.set(camPosKm[0] - moon.posKm[0], camPosKm[1] - moon.posKm[1], camPosKm[2] - moon.posKm[2]).length();
      if (distCam < 5e5) {
        this._updateCone(activeCount++, 'lunar', 'sun', 'earth', 'moon',
          sunPos, earth.posKm, earth.phys.radiusKm, moon.posKm, moon.phys.radiusKm, bodies);
      }
    }

    // ── 木星→伽利略卫星 ──
    const jupiter = bodies.get('jupiter');
    if (jupiter) {
      const distCamJ = _v1.set(camPosKm[0] - jupiter.posKm[0], camPosKm[1] - jupiter.posKm[1], camPosKm[2] - jupiter.posKm[2]).length();
      if (distCamJ < 2e6) {
        for (const moonId of ['io', 'europa', 'ganymede', 'callisto']) {
          const m = bodies.get(moonId);
          if (!m) continue;
          this._updateCone(activeCount++, 'jovian', 'sun', 'jupiter', moonId,
            sunPos, jupiter.posKm, jupiter.phys.radiusKm, m.posKm, m.phys.radiusKm, bodies);
          if (activeCount >= this.maxCones) break;
        }
      }
    }

    // ── 土星→土卫六 ──
    const saturn = bodies.get('saturn');
    const titan = bodies.get('titan');
    if (saturn && titan) {
      const distCamS = _v1.set(camPosKm[0] - saturn.posKm[0], camPosKm[1] - saturn.posKm[1], camPosKm[2] - saturn.posKm[2]).length();
      if (distCamS < 3e6) {
        this._updateCone(activeCount++, 'jovian', 'sun', 'saturn', 'titan',
          sunPos, saturn.posKm, saturn.phys.radiusKm, titan.posKm, titan.phys.radiusKm, bodies);
      }
    }

    // 隐藏未使用的锥
    for (let i = activeCount; i < this.cones.length; i++) {
      this.cones[i].mesh.visible = false;
    }
  }

  /**
   * 更新或创建一个阴影锥。
   * 阴影锥从遮挡体背光面延伸，本影锥收敛到尖端，半影锥发散。
   */
  _updateCone(idx, type, lightId, occluderId, receiverId,
              sunPos, occluderPos, occluderR, receiverPos, receiverR, bodies) {
    // 太阳→遮挡体方向
    _v1.set(occluderPos[0] - sunPos[0], occluderPos[1] - sunPos[1], occluderPos[2] - sunPos[2]);
    const distSunOcc = _v1.length();
    _v1.normalize(); // 阴影轴方向

    // 太阳半径
    const sunR = bodies.get('sun')?.phys?.radiusKm ?? 696000;

    // 本影长度：L = R_occ * D / (R_sun - R_occ)
    // 当 R_occ < R_sun 时本影收敛（全影锥）
    const umbraLen = occluderR * distSunOcc / (sunR - occluderR);

    // 半影锥在接收体处的半径
    _v2.set(receiverPos[0] - occluderPos[0], receiverPos[1] - occluderPos[1], receiverPos[2] - occluderPos[2]);
    const distOccRecv = _v2.length();
    const projDist = _v2.dot(_v1); // 投影到阴影轴
    if (projDist <= 0) return; // 接收体在遮挡体向阳侧，无阴影

    // 半影半径在接收体处
    const penumbraR = occluderR + (sunR + occluderR) * projDist / distSunOcc;
    // 本影半径在接收体处
    const umbraR = Math.max(0, occluderR - (sunR - occluderR) * projDist / distSunOcc);

    // 如果半影半径太小或接收体太远，跳过
    if (penumbraR < 1) return;

    // 获取或创建锥 mesh
    let cone = this.cones[idx];
    if (!cone) {
      const geo = new THREE.ConeGeometry(1, 1, 32, 1, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uPenumbraR: { value: 1 },
          uUmbraR: { value: 0 },
          uOpacity: { value: 0.5 },
          uColor: { value: new THREE.Color(0x000000) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uPenumbraR;
          uniform float uUmbraR;
          uniform float uOpacity;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            // vUv.x = 0 中心, 1 边缘；vUv.y = 0 顶部(遮挡体), 1 底部(远端)
            float r = vUv.x * 2.0 - 1.0; // -1..1
            float dist = abs(r) * uPenumbraR;
            // 本影：完全黑
            float umbra = 1.0 - smoothstep(uUmbraR * 0.9, uUmbraR * 1.1, dist);
            // 半影：线性渐变
            float penumbra = 1.0 - smoothstep(uUmbraR, uPenumbraR, dist);
            float shadow = max(umbra, penumbra * 0.6);
            // 月食：红色本影
            vec3 col = mix(uColor, vec3(0.4, 0.1, 0.05), umbra * 0.7);
            gl_FragColor = vec4(col, shadow * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.MultiplyBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      cone = { mesh, geo, mat, occluderId, receiverId, type };
      this.cones[idx] = cone;
    }

    // 更新锥几何：从遮挡体延伸到接收体
    const coneLen = projDist;
    const coneR = penumbraR;

    // 锥位置：遮挡体到接收体的中点
    _v3.set(
      occluderPos[0] + _v1.x * coneLen * 0.5,
      occluderPos[1] + _v1.y * coneLen * 0.5,
      occluderPos[2] + _v1.z * coneLen * 0.5
    );
    cone.mesh.position.set(_v3.x, _v3.y, _v3.z);

    // 锥朝向：沿阴影轴（ConeGeometry 默认 +Y 轴）
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v1);
    cone.mesh.quaternion.copy(quat);

    // 锥尺寸
    cone.mesh.scale.set(coneR, coneLen, coneR);

    // 更新 uniforms
    cone.mat.uniforms.uPenumbraR.value = penumbraR;
    cone.mat.uniforms.uUmbraR.value = umbraR;
    cone.mat.uniforms.uOpacity.value = type === 'lunar' ? 0.7 : 0.5;

    cone.mesh.visible = true;
    cone.occluderId = occluderId;
    cone.receiverId = receiverId;
    cone.type = type;
  }

  /**
   * 查找下一次日食（简化版：搜索月地连线对齐太阳的时刻）。
   * @param {string} type - 'solar' | 'lunar'
   * @param {number} fromJd - 起始 JD
   * @param {Function} getPositions - (jdTT) => { sun, moon, earth } 位置
   * @returns {number} 日食发生的 JD
   */
  getNextEclipse(type, fromJd, getPositions) {
    // 简化搜索：以 1 小时步长扫描 6 个月
    const step = 1 / 24 / 60; // 1 分钟
    let jd = fromJd;
    const endJd = fromJd + 183; // 6 个月

    for (; jd < endJd; jd += step) {
      const pos = getPositions(jd);
      if (!pos) continue;

      if (type === 'solar') {
        // 日食：太阳-月球-地球几乎共线，月球在中间
        const align = this._alignment(pos.sun, pos.moon, pos.earth);
        if (align > 0.999) return jd;
      } else if (type === 'lunar') {
        // 月食：太阳-地球-月球几乎共线，地球在中间
        const align = this._alignment(pos.sun, pos.earth, pos.moon);
        if (align > 0.999) return jd;
      }
    }
    return null;
  }

  /** 三体共线度：a→b→c，返回 b 在 a-c 连线上的投影比例（0-1）和角度对齐度 */
  _alignment(a, b, c) {
    _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _v2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
    return _v1.dot(_v2);
  }

  dispose() {
    for (const cone of this.cones) {
      if (cone?.mesh) {
        this.scene.remove(cone.mesh);
        cone.geo.dispose();
        cone.mat.dispose();
      }
    }
    this.cones = [];
  }
}
