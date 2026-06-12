// 玩家载具：第一人称飞船（6DOF，惯性阻尼，指数速度档）与行星地表行走模式。
// 飞船运动使用真实时间 dt（时间加速只作用于天体仿真）；
// 行走模式下位置存于天体体固系，随行星自转自然co-rotate，重力 g=GM/r² 取真实值。

import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
};

// 指针锁定 movementX/Y 已知尖峰（Chromium 锁定瞬间可达数百 px）→ 每事件钳制，
// 杜绝行走/飞行视角的"快速旋转"（R7 #3）
const clampMove = (m) => Math.max(-150, Math.min(150, m));

export class Input {
  constructor(dom, canvas = null) {
    this.keys = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.justPressed = new Set();
    // 非指针锁定时的拖拽（Google Earth 式探索模式）：左键旋转，右/中键平移
    this.drag = { active: false, dx: 0, dy: 0 };
    this.pan = { active: false, dx: 0, dy: 0 };
    this.look = { active: false, dx: 0, dy: 0 }; // Ctrl+左键：旋转航向/倾斜（R7 #7）
    this.onLockChange = null;

    dom.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['Space', 'BracketLeft', 'BracketRight', 'Tab', 'PageUp', 'PageDown',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    dom.addEventListener('keyup', (e) => { if (!isTyping(e)) this.keys.delete(e.code); });
    this.muteUntil = 0; // 指针锁定切换瞬间静默（Chromium 锁定获得/释放时产生突发事件串，R9-1a）
    document.addEventListener('pointerlockchange', () => {
      this.locked = !!document.pointerLockElement;
      this.muteUntil = performance.now() + 150;
      this.dx = 0; this.dy = 0;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (performance.now() < this.muteUntil) return;
      const mx = clampMove(e.movementX), my = clampMove(e.movementY);
      if (this.locked) {
        this.dx += mx; this.dy += my;
      } else if (this.look.active) {
        this.look.dx += mx; this.look.dy += my;
      } else if (this.drag.active) {
        this.drag.dx += mx; this.drag.dy += my;
      } else if (this.pan.active) {
        this.pan.dx += mx; this.pan.dy += my;
      }
    });
    if (canvas) {
      canvas.addEventListener('mousedown', (e) => {
        if (this.locked) return;
        if (e.button === 0) {
          if (e.ctrlKey) this.look.active = true;
          else this.drag.active = true;
        } else if (e.button === 2 || e.button === 1) { this.pan.active = true; e.preventDefault(); }
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('mouseup', () => {
        this.drag.active = false; this.pan.active = false; this.look.active = false;
      });
    }
    document.addEventListener('wheel', (e) => {
      if (isTyping(e)) return;
      // 按 deltaY 幅度归一化（标准滚轮 100/格 → 1）：高速滚轮/触控板的密集事件
      // 不再按事件个数整格累计，消除缩放离散跳跃（R8 #2）
      this.wheel += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) / 100, 1);
    }, { passive: true });
    window.addEventListener('blur', () => {
      this.keys.clear(); this.drag.active = false; this.pan.active = false; this.look.active = false;
    });
  }
  down(code) { return this.keys.has(code); }
  tapped(code) { return this.justPressed.has(code); }
  /** 每帧末调用 */
  endFrame() {
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.drag.dx = 0; this.drag.dy = 0;
    this.pan.dx = 0; this.pan.dy = 0;
    this.look.dx = 0; this.look.dy = 0;
    this.justPressed.clear();
  }
}

const MOUSE_SENS = 0.0022;
const WALK_SENS = 0.00085;  // 行走视角灵敏度（R9-1a 再降：仰望天空可精确定位，仍 360° 无限制）
const WALK_SMOOTH_TAU = 0.05; // 行走视角指数平滑时间常数（秒）
const WALK_FRAME_CLAMP = 260; // 每帧累计输入上限 px（事件堆积/卡顿帧不得倾泻成快速旋转，R9-1a）
const MAX_SUN_R = 3.9e10;   // 飞行模式日心距上限（略超探索模式 250 AU 全景距离，R9-1c）
const WALK_EYE_KM = 0.0017; // 1.7 m
const MIN_SPEED = 0.001;    // 1 m/s
const MAX_SPEED = 3e8;      // ~2 AU/s

export class Ship {
  constructor() {
    this.mode = 'fly';
    this.posKm = new Float64Array(3);
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3(); // km/s 世界轴
    this.speedSetting = 10;         // km/s
    this.effSpeed = 0;              // 实际限速后的目标速度（HUD 显示）
    this.damping = true;
    // 行走状态（smx/smy = 视角输入指数平滑状态）
    this.walk = { bodyId: null, localPos: new THREE.Vector3(), yaw: 0, pitch: 0, vAlt: 0, grounded: false, smx: 0, smy: 0 };
  }

  /** 当前速度大小 km/s */
  speed() { return this.vel.length(); }

  /**
   * @param dt 真实秒
   * @param input Input
   * @param env {
   *   nearest: { id, posKm:Float64Array, radiusKm, landable, distSurface } | null,
   *   getBodyQuat(id)->THREE.Quaternion, getBodyPos(id)->Float64Array,
   *   heightFn(id, dirLocalUnit:Vector3)->km(表面半径), surfaceAngVel(id)->rad/s
   * }
   */
  update(dt, input, env) {
    // 速度档调节（滚轮）
    if (input.wheel !== 0 && this.mode === 'fly') {
      this.speedSetting *= Math.pow(0.5, input.wheel); // 上滚加速
      this.speedSetting = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speedSetting));
    }
    // 模式切换：近地表且可登陆
    if (input.tapped('KeyG') && env.nearest) {
      if (this.mode === 'fly' && env.nearest.landable && env.nearest.distSurface < 20) {
        this.enterWalk(env);
      } else if (this.mode === 'walk') {
        this.exitWalk(env);
      }
    }
    if (this.mode === 'walk') this.updateWalk(dt, input, env);
    else this.updateFly(dt, input, env);
  }

  updateFly(dt, input, env) {
    // 姿态：鼠标俯仰/偏航，Q/E 滚转
    const yaw = -input.dx * MOUSE_SENS;
    const pitch = -input.dy * MOUSE_SENS;
    let roll = 0;
    if (input.down('KeyQ')) roll += 1.2 * dt;
    if (input.down('KeyE')) roll -= 1.2 * dt;
    _q1.set(pitch / 2, yaw / 2, roll / 2, 1).normalize(); // 小角度近似四元数
    this.quat.multiply(_q1).normalize();

    // 推力方向（本地系）
    _v1.set(0, 0, 0);
    if (input.down('KeyW')) _v1.z -= 1;
    if (input.down('KeyS')) _v1.z += 1;
    if (input.down('KeyA')) _v1.x -= 1;
    if (input.down('KeyD')) _v1.x += 1;
    if (input.down('KeyR') || input.down('Space')) _v1.y += 1;
    if (input.down('KeyF') || input.down('KeyC')) _v1.y -= 1;
    const thrusting = _v1.lengthSq() > 0;
    if (thrusting) _v1.normalize().applyQuaternion(this.quat);

    // 接近限速：距表面越近自动越慢（保证可控接近，悬停驻留）
    let cap = this.speedSetting;
    if (env.nearest) {
      const d = Math.max(env.nearest.distSurface, 0.001);
      cap = Math.min(cap, Math.max(0.02, d * 0.6));
    }
    this.effSpeed = thrusting ? cap : 0;
    const boost = input.down('ShiftLeft') ? 2 : 1;

    if (this.damping) {
      _v2.copy(_v1).multiplyScalar(cap * boost);
      const k = 1 - Math.exp(-dt * 3.5);
      this.vel.lerp(_v2, k);
      if (!thrusting && this.vel.lengthSq() < 1e-10) this.vel.set(0, 0, 0);
    } else {
      this.vel.addScaledVector(_v1, cap * boost * 0.5 * dt);
    }
    if (input.tapped('KeyX')) this.vel.set(0, 0, 0);

    this.posKm[0] += this.vel.x * dt;
    this.posKm[1] += this.vel.y * dt;
    this.posKm[2] += this.vel.z * dt;

    // 日球层边界：飞行不得超出全景距离（与探索模式一致的世界边界，R9-1c）
    const rSun = Math.hypot(this.posKm[0], this.posKm[1], this.posKm[2]);
    if (rSun > MAX_SUN_R) {
      const s = MAX_SUN_R / rSun;
      this.posKm[0] *= s; this.posKm[1] *= s; this.posKm[2] *= s;
      _v1.set(this.posKm[0], this.posKm[1], this.posKm[2]).normalize();
      const vr = this.vel.dot(_v1);
      if (vr > 0) this.vel.addScaledVector(_v1, -vr); // 消除外向分量
    }

    // 碰撞站离：不允许进入天体表面之下（地形由行走模式处理，飞行用球面+余量）
    if (env.nearest) {
      const n = env.nearest;
      _v1.set(this.posKm[0] - n.posKm[0], this.posKm[1] - n.posKm[1], this.posKm[2] - n.posKm[2]);
      const dist = _v1.length();
      const minR = n.radiusKm + (n.landable ? 0.005 : n.radiusKm * 0.001);
      if (dist < minR && dist > 0) {
        _v1.normalize();
        this.posKm[0] = n.posKm[0] + _v1.x * minR;
        this.posKm[1] = n.posKm[1] + _v1.y * minR;
        this.posKm[2] = n.posKm[2] + _v1.z * minR;
        const vr = this.vel.dot(_v1);
        if (vr < 0) this.vel.addScaledVector(_v1, -vr); // 消除内向分量
      }
    }
  }

  enterWalk(env) {
    const n = env.nearest;
    this.mode = 'walk';
    const w = this.walk;
    w.bodyId = n.id;
    // 世界相对位置 → 体固(网格本地)系
    _v1.set(this.posKm[0] - n.posKm[0], this.posKm[1] - n.posKm[1], this.posKm[2] - n.posKm[2]);
    _q1.copy(env.getBodyQuat(n.id)).invert();
    _v1.applyQuaternion(_q1);
    const h = env.heightFn(n.id, _v2.copy(_v1).normalize());
    w.localPos.copy(_v2).multiplyScalar(h + WALK_EYE_KM);
    w.vAlt = 0;
    w.grounded = true;
    // 从当前视向初始化偏航与俯仰（视向严格连续，R7 #1：登陆无跳变）
    const frame = this.walkFrame(_m1, env);
    _v3.set(0, 0, -1).applyQuaternion(this.quat); // 当前世界视向
    _q1.copy(env.getBodyQuat(w.bodyId)).invert();
    _v3.applyQuaternion(_q1); // → 本地
    const e = new THREE.Vector3().setFromMatrixColumn(frame, 0);
    const upv = new THREE.Vector3().setFromMatrixColumn(frame, 1);
    const nrt = new THREE.Vector3().setFromMatrixColumn(frame, 2);
    w.yaw = Math.atan2(_v3.dot(e), _v3.dot(nrt));
    w.pitch = Math.asin(THREE.MathUtils.clamp(_v3.dot(upv), -1, 1));
    w.smx = 0; w.smy = 0;
    this.vel.set(0, 0, 0);
  }

  exitWalk(env) {
    // 当前行走位姿已是世界位姿（updateWalk 每帧写回），直接切换并向上抬升一点
    this.mode = 'walk-exit'; // 标记
    const up = _v1.copy(this.walk.localPos).normalize().applyQuaternion(env.getBodyQuat(this.walk.bodyId));
    this.posKm[0] += up.x * 0.003;
    this.posKm[1] += up.y * 0.003;
    this.posKm[2] += up.z * 0.003;
    this.vel.set(0, 0, 0);
    this.mode = 'fly';
  }

  /** 行走本地坐标系（列: east, up, north），在网格本地系中 */
  walkFrame(outM, env) {
    const u = _v2.copy(this.walk.localPos).normalize(); // 天顶
    const poleY = Math.abs(u.y) > 0.999;
    const east = poleY ? _v3.set(1, 0, 0) : _v3.set(0, 1, 0).cross(u).normalize();
    // 北 = 天顶 × 东
    const north = new THREE.Vector3().crossVectors(u, east);
    return outM.makeBasis(east.clone(), u.clone(), north);
  }

  updateWalk(dt, input, env) {
    const w = this.walk;
    const bodyPos = env.getBodyPos(w.bodyId);
    const bodyQuat = env.getBodyQuat(w.bodyId);
    const phys = env.phys(w.bodyId);
    const r = w.localPos.length();
    const g = (phys.gm / (r * r)); // km/s²

    // 视角：偏航绕天顶；俯仰 360° 连续循环（可仰头翻转环视，无任何钳制）。
    // R7 #2：dx>0（鼠标右移）→ yaw 增大 = 向右看，与探索模式方向一致；
    // R7 #3：低灵敏度 + 指数平滑（τ=50ms），未锁定指针时回退用左键拖拽环视。
    // R9-1a：帧级总量钳制（一帧多事件累计无上限是尖峰根源）；
    // 卡顿帧平滑系数按 dt≤33ms 计，积压输入分多帧释放而非一帧倾泻
    let inDx = input.locked ? input.dx : (input.drag.active ? input.drag.dx : 0);
    let inDy = input.locked ? input.dy : (input.drag.active ? input.drag.dy : 0);
    inDx = Math.max(-WALK_FRAME_CLAMP, Math.min(WALK_FRAME_CLAMP, inDx));
    inDy = Math.max(-WALK_FRAME_CLAMP, Math.min(WALK_FRAME_CLAMP, inDy));
    const sm = 1 - Math.exp(-Math.min(dt, 0.033) / WALK_SMOOTH_TAU);
    w.smx += (inDx - w.smx) * sm;
    w.smy += (inDy - w.smy) * sm;
    w.yaw += w.smx * WALK_SENS;
    w.pitch -= w.smy * WALK_SENS;
    if (w.pitch > Math.PI) w.pitch -= 2 * Math.PI;
    if (w.pitch < -Math.PI) w.pitch += 2 * Math.PI;
    if (w.yaw > Math.PI) w.yaw -= 2 * Math.PI;
    if (w.yaw < -Math.PI) w.yaw += 2 * Math.PI;

    // 本地坐标系
    const frame = this.walkFrame(_m1, env);
    const east = _v1.setFromMatrixColumn(frame, 0).clone();
    const up = _v2.setFromMatrixColumn(frame, 1).clone();
    const north = _v3.setFromMatrixColumn(frame, 2).clone();

    // 朝向（本地）：yaw 绕 up，从 -north 开始（yaw=0 朝北）
    const fwd = north.clone().multiplyScalar(Math.cos(w.yaw)).addScaledVector(east, Math.sin(w.yaw));
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();

    // 行走运动
    const move = new THREE.Vector3();
    if (input.down('KeyW')) move.add(fwd);
    if (input.down('KeyS')) move.sub(fwd);
    if (input.down('KeyD')) move.add(right);
    if (input.down('KeyA')) move.sub(right);
    // 水中（R9-2b）：浮力抵消大部分重力，移动迟缓，下沉有终端速度，Space=向上游
    const dirNow = w.localPos.clone().normalize();
    const inWater = !!env.isWater?.(w.bodyId, dirNow) &&
      r < phys.radiusKm + 0.001;
    let speed = (input.down('ShiftLeft') ? 0.009 : 0.003); // 9 / 3 m/s
    if (inWater) speed *= 0.45;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
    w.localPos.add(move);

    // 重力与跳跃（沿天顶）
    if (input.tapped('Space') && w.grounded) { w.vAlt = inWater ? 0.0024 : 0.0042; w.grounded = false; }
    if (inWater && input.down('Space')) w.vAlt += g * 0.5 * dt; // 持续踩水上浮
    w.vAlt -= (inWater ? g * 0.12 : g) * dt;
    if (inWater) w.vAlt = Math.max(w.vAlt, -0.0025); // 水中终端下沉速度 2.5 m/s
    w.localPos.addScaledVector(up, w.vAlt * dt);

    // 地面碰撞（地形高度）
    const dir = w.localPos.clone().normalize();
    const ground = env.heightFn(w.bodyId, dir) + WALK_EYE_KM;
    if (w.localPos.length() <= ground) {
      w.localPos.copy(dir).multiplyScalar(ground);
      w.vAlt = 0;
      w.grounded = true;
    } else if (w.localPos.length() > ground + 0.0001) {
      w.grounded = false;
    }

    // 写回世界位姿
    const worldOff = w.localPos.clone().applyQuaternion(bodyQuat);
    this.posKm[0] = bodyPos[0] + worldOff.x;
    this.posKm[1] = bodyPos[1] + worldOff.y;
    this.posKm[2] = bodyPos[2] + worldOff.z;

    // 相机姿态 = 体固→世界 ∘ 本地朝向
    const lookM = new THREE.Matrix4();
    const camFwd = fwd.clone().multiplyScalar(Math.cos(w.pitch)).addScaledVector(up, Math.sin(w.pitch));
    const camUp = up.clone().multiplyScalar(Math.cos(w.pitch)).addScaledVector(fwd, -Math.sin(w.pitch));
    lookM.lookAt(new THREE.Vector3(), camFwd, camUp); // Matrix4.lookAt: z = eye−target = −camFwd（相机沿 −Z 看）
    this.quat.setFromRotationMatrix(lookM).premultiply(bodyQuat);
  }
}
