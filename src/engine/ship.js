// 玩家载具：第一人称飞船（6DOF，惯性阻尼，指数速度档）与行星地表行走模式。
// 飞船运动使用真实时间 dt（时间加速只作用于天体仿真）；
// 行走模式下位置存于天体体固系，随行星自转自然co-rotate，重力 g=GM/r² 取真实值。
//
// 移动端触摸支持（M1）：
// - Input 类使用 Pointer Events 替代纯鼠标事件，统一处理鼠标与触摸
// - 单指拖 → drag（探索旋转/行走视角）；双指捏合 → wheel（缩放/起飞/登陆）；双指平移 → pan
// - joystick / touchAscend / touchDescend / touchJump / touchSprint 由 TouchControls 外部设置

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

// 指针锁定 movementX/Y 已知尖峰 → 每事件钳制
const clampMove = (m) => Math.max(-150, Math.min(150, m));

export class Input {
  constructor(dom, canvas = null) {
    this.keys = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.justPressed = new Set();
    this.drag = { active: false, dx: 0, dy: 0 };
    this.pan  = { active: false, dx: 0, dy: 0 };
    this.look = { active: false, dx: 0, dy: 0 };
    this.onLockChange = null;

    // Touch / joystick fields (set by TouchControls)
    this.joystick     = { x: 0, y: 0 };  // -1..1 analog stick
    this.touchAscend  = false;            // held: up-thrust / ascend in water
    this.touchDescend = false;            // held: down-thrust / dive
    this.touchSprint  = false;            // held: run
    this.touchJump    = false;            // one-shot: jump (consumed in updateWalk)

    // Internal pointer-event tracking
    this._pointers    = new Map();  // pointerId → {x, y}
    this._ptrDownPos  = new Map();  // pointerId → {x, y} at pointerdown
    this._pinchDist   = 0;          // last two-finger distance
    this._pinchMid    = null;       // last two-finger midpoint
    this._tapStart    = 0;          // pointerdown timestamp for tap detection
    this._lastTapTime = 0;
    this._lastTapPos  = { x: 0, y: 0 };
    this.muteUntil    = 0;
    this._wasPinching = false;      // true during/after 2-finger gesture → suppresses tap
    this._canvas      = canvas;     // for releasing pointer capture on gesture cancel

    // ── Keyboard ──────────────────────────────────────────────────────────
    dom.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['Space', 'BracketLeft', 'BracketRight', 'Tab', 'PageUp', 'PageDown',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) { this.keys.add(e.code); return; }
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    dom.addEventListener('keyup', (e) => { if (!isTyping(e)) this.keys.delete(e.code); });

    // ── Pointer lock ──────────────────────────────────────────────────────
    document.addEventListener('pointerlockchange', () => {
      this.locked = !!document.pointerLockElement;
      this.muteUntil = performance.now() + 150;
      this.dx = 0; this.dy = 0;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });

    // ── Mouse-move (pointer-lock only: uses movementX/Y) ──────────────────
    document.addEventListener('mousemove', (e) => {
      if (performance.now() < this.muteUntil) return;
      if (this.locked) {
        this.dx += clampMove(e.movementX);
        this.dy += clampMove(e.movementY);
      }
      // Non-locked movement handled by pointermove on canvas below
    });

    // ── Wheel ─────────────────────────────────────────────────────────────
    document.addEventListener('wheel', (e) => {
      if (isTyping(e)) return;
      this.wheel += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) / 100, 1);
    }, { passive: true });

    // ── Window blur ───────────────────────────────────────────────────────
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.drag.active = false; this.pan.active = false; this.look.active = false;
      this._pointers.clear(); this._ptrDownPos.clear();
      this._pinchDist = 0; this._pinchMid = null;
      this._wasPinching = false;
    });

    if (!canvas) return;

    // ── Canvas: Pointer Events (mouse + touch unified) ────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const pt = { x: e.clientX, y: e.clientY };
      this._pointers.set(e.pointerId, { ...pt });
      this._ptrDownPos.set(e.pointerId, { ...pt });

      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        // Touch single-finger tap start
        if (this._pointers.size === 1) {
          this.drag.active = true;
          this._tapStart = performance.now();
          this._wasPinching = false; // fresh single-finger gesture
          // Synthesize mousedown so main.js downX/downY tracking catches it
          canvas.dispatchEvent(new MouseEvent('mousedown', {
            clientX: e.clientX, clientY: e.clientY, bubbles: false,
          }));
        } else if (this._pointers.size === 2) {
          // Two fingers: end single-drag, start pinch+pan
          this.drag.active = false;
          this._wasPinching = true;
          const pts = [...this._pointers.values()];
          this._pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          this._pinchMid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        } else {
          // 3+ fingers: cancel everything
          this.drag.active = false; this.pan.active = false;
        }
      } else {
        // Mouse buttons
        if (this.locked) return;
        if (e.button === 0) {
          if (e.ctrlKey) this.look.active = true;
          else this.drag.active = true;
        } else if (e.button === 2 || e.button === 1) {
          this.pan.active = true;
          e.preventDefault();
        }
      }
    }, { passive: false });

    canvas.addEventListener('pointermove', (e) => {
      if (this.locked) return; // pointer-lock: handled by mousemove (movementX/Y)
      if (!this._pointers.has(e.pointerId)) return;

      const prev = this._pointers.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const count = this._pointers.size;

      if (count === 1) {
        if (this.look.active)       { this.look.dx += dx; this.look.dy += dy; }
        else if (this.drag.active)  { this.drag.dx += dx; this.drag.dy += dy; }
        else if (this.pan.active)   { this.pan.dx  += dx; this.pan.dy  += dy; }
      } else if (count === 2) {
        const pts = [...this._pointers.values()];
        const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const newMid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

        // Pinch → wheel equivalent (spread = zoom in = wheel < 0)
        let pinchActive = false;
        if (this._pinchDist > 5 && newDist > 5) {
          const ratio = newDist / this._pinchDist;
          // 1.5% 死区：双指平移时手指间距微变产生虚假滚轮事件 → 叠加缩放与平移、干扰平移手势
          if (ratio > 0.1 && ratio < 10 && Math.abs(ratio - 1) > 0.015) {
            const wEq = -(Math.log(ratio) / Math.log(1.12)) * 1.6;
            this.wheel += wEq;
            pinchActive = true;
          }
        }
        this._pinchDist = newDist;

        // Two-finger translation → pan
        // 缩放主导时忽略中点偏移，防止对称捏合/张开被错误地解释成平移，
        // 导致 look-at 点被甩到数万 km 外、后续单指拖动几乎无效（移动版起飞后）。
        if (this._pinchMid && (!pinchActive || !this._wasPinching)) {
          const dmx = newMid.x - this._pinchMid.x;
          const dmy = newMid.y - this._pinchMid.y;
          if (Math.hypot(dmx, dmy) > 0.5) {
            this.pan.active = true;
            this.pan.dx += dmx;
            this.pan.dy += dmy;
          }
        }
        this._pinchMid = newMid;
      }
    }, { passive: true });

    const onPointerEnd = (e) => {
      const downPos = this._ptrDownPos.get(e.pointerId);
      const hadPinch = this._wasPinching;
      this._pointers.delete(e.pointerId);
      this._ptrDownPos.delete(e.pointerId);

      // Touch tap detection → synthesize click / dblclick on canvas
      if ((e.pointerType === 'touch' || e.pointerType === 'pen') && downPos) {
        const moved   = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        const elapsed = performance.now() - this._tapStart;
        if (moved < 14 && elapsed < 400 && this._pointers.size === 0 && !hadPinch) {
          const now = performance.now();
          const dblDist = Math.hypot(e.clientX - this._lastTapPos.x, e.clientY - this._lastTapPos.y);
          if (now - this._lastTapTime < 360 && dblDist < 32) {
            canvas.dispatchEvent(new MouseEvent('dblclick', {
              clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true,
            }));
            this._lastTapTime = 0;
          } else {
            canvas.dispatchEvent(new MouseEvent('click', {
              clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true,
            }));
            this._lastTapTime = now;
            this._lastTapPos  = { x: e.clientX, y: e.clientY };
          }
        }
      }

      const remaining = this._pointers.size;
      if (remaining === 0) {
        this.drag.active = false; this.pan.active = false; this.look.active = false;
        this._pinchDist  = 0;    this._pinchMid  = null;
        this._wasPinching = false;
      } else if (remaining === 1) {
        // Back to single finger after two-finger gesture
        this._pinchDist = 0; this._pinchMid = null;
        this.pan.active = false;
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
          this.drag.active = true;
        }
      }
    };
    canvas.addEventListener('pointerup',     onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    // Browser may implicitly release capture (alert, system gesture, scroll edge).
    // Treat it like pointerup so stale pointerIds don't accumulate.
    canvas.addEventListener('lostpointercapture', (e) => {
      if (this._pointers.has(e.pointerId)) onPointerEnd(e);
    });

    // Fallback: release on window in case pointer capture was lost
    window.addEventListener('mouseup', () => {
      if (this._pointers.size === 0) {
        this.drag.active = false; this.pan.active = false; this.look.active = false;
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ── Global: capture 2nd finger even when it lands on HUD/label elements ──
    // Without this, a second touch on a non-canvas element is never registered,
    // so canvas never enters pinch mode. Only allow promotion from exactly 1
    // existing pointer → 2; ignore 3rd+ fingers to keep state machine simple.
    // 阻止 TouchControls 按钮等后续监听器 capture 这根 pointer，否则 pinch
    // 手势会被按钮的 setPointerCapture 打断，导致移动版双指远离/缩放失效。
    window.addEventListener('pointerdown', (e) => {
      if (e.target === canvas) return;               // canvas already handled it
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (this._pointers.size !== 1) return;         // only promote a lone pointer to pinch
      if (this._pointers.has(e.pointerId)) return;   // duplicate
      try { canvas.setPointerCapture(e.pointerId); } catch { return; }
      // 必须阻止按钮（如 TouchControls）在同事件上调用 setPointerCapture，
      // 否则第二根手指的事件会全部被按钮吞掉，canvas 无法完成 pinch。
      e.stopImmediatePropagation();
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._ptrDownPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 2) {
        this.drag.active = false; this.pan.active = false;
        this._wasPinching = true;
        const pts = [...this._pointers.values()];
        this._pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        this._pinchMid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      }
    }, { capture: true, passive: true });
  }

  down(code) { return this.keys.has(code); }
  tapped(code) { return this.justPressed.has(code); }

  /**
   * 模式切换时彻底重置所有手势状态（拖拽 / 平移 / 捏合 / 触控点）。
   * 必须清空 _pointers，否则旧触控点残留会导致新模式下第一次手势被误判为
   * 多指（如从行走起飞回探索后，单指拖拽被当作双指缩放，GE 操控"失效"）。
   */
  cancelGestures() {
    if (this._canvas) {
      for (const id of this._pointers.keys()) {
        try { this._canvas.releasePointerCapture(id); } catch { /* 可能已被释放 */ }
      }
    }
    this._pointers.clear();
    this._ptrDownPos.clear();
    this.drag.active = false; this.pan.active = false; this.look.active = false;
    this._pinchDist = 0; this._pinchMid = null;
    this._wasPinching = false;
    this.drag.dx = 0; this.drag.dy = 0;
    this.pan.dx = 0; this.pan.dy = 0;
    this.look.dx = 0; this.look.dy = 0;
  }

  endFrame() {
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.drag.dx = 0; this.drag.dy = 0;
    this.pan.dx  = 0; this.pan.dy  = 0;
    this.look.dx = 0; this.look.dy = 0;
    this.justPressed.clear();
  }
}

const MOUSE_SENS   = 0.0022;
const WALK_SENS    = 0.00085;
const WALK_SMOOTH_TAU  = 0.05;
const WALK_FRAME_CLAMP = 260;
const MAX_SUN_R  = 1.55e13;
const WALK_EYE_KM = 0.0017;
const MIN_SPEED = 0.001;
const MAX_SPEED = 3e8;

// 地表 palette → 音频表面类型映射（供 AudioEngine 选择脚步声滤波参数）。
// 月球/岩石类 palette 统一为 'rock'；火星/Titan 尘埃为 'sand'；
// 地球陆地为 'dirt'；冰质天体为 'ice'。
const SURFACE_PALETTE_TO_AUDIO = {
  mars: 'sand', titan: 'sand',
  earth: 'dirt',
  ice: 'ice', pluto: 'ice', triton: 'ice',
};
const surfaceTypeOf = (phys) => {
  const p = phys?.surface?.palette;
  return SURFACE_PALETTE_TO_AUDIO[p] || 'rock';
};

export class Ship {
  constructor() {
    this.mode = 'fly';
    this.posKm = new Float64Array(3);
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.speedSetting = 10;
    this.effSpeed = 0;
    this.damping = true;
    this.walk = {
      bodyId: null, localPos: new THREE.Vector3(),
      yaw: 0, pitch: 0, vAlt: 0, grounded: false,
      smx: 0, smy: 0, diving: false, submerged: false,
    };
    // 音频状态快照：供外部 AudioEngine 读取（不直接调用 audio，解耦）。
    // updateWalk / updateFly 每帧刷新，main.js 集成时传给 AudioEngine.update()。
    this.audioState = { walking: false, speed: 0, submerged: false, surfaceType: 'rock' };
  }

  speed() { return this.vel.length(); }

  update(dt, input, env) {
    if (input.wheel !== 0 && this.mode === 'fly') {
      this.speedSetting *= Math.pow(0.5, input.wheel);
      this.speedSetting = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speedSetting));
    }
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
    // View: pointer-lock uses dx/dy; mobile uses single-finger drag
    const lookDx = input.locked ? input.dx : input.drag.dx;
    const lookDy = input.locked ? input.dy : input.drag.dy;
    const yaw   = -lookDx * MOUSE_SENS;
    const pitch = -lookDy * MOUSE_SENS;
    let roll = 0;
    if (input.down('KeyQ')) roll += 1.2 * dt;
    if (input.down('KeyE')) roll -= 1.2 * dt;
    _q1.set(pitch / 2, yaw / 2, roll / 2, 1).normalize();
    this.quat.multiply(_q1).normalize();

    // Thrust — keyboard + joystick
    const jx = input.joystick.x;
    const jy = input.joystick.y;
    _v1.set(0, 0, 0);
    if (input.down('KeyW') || jy < -0.15) _v1.z -= 1;
    if (input.down('KeyS') || jy > 0.15)  _v1.z += 1;
    if (input.down('KeyA') || jx < -0.15) _v1.x -= 1;
    if (input.down('KeyD') || jx > 0.15)  _v1.x += 1;
    if (input.down('KeyR') || input.down('Space') || input.touchAscend)  _v1.y += 1;
    if (input.down('KeyC') || input.touchDescend) _v1.y -= 1;

    const thrusting = _v1.lengthSq() > 0;
    if (thrusting) _v1.normalize().applyQuaternion(this.quat);

    let cap = this.speedSetting;
    if (env.nearest) {
      const d = Math.max(env.nearest.distSurface, 0.001);
      cap = Math.min(cap, Math.max(0.02, d * 0.6));
    }
    this.effSpeed = thrusting ? cap : 0;
    const boost = (input.down('ShiftLeft') || input.touchSprint) ? 2 : 1;

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

    const rSun = Math.hypot(this.posKm[0], this.posKm[1], this.posKm[2]);
    if (rSun > MAX_SUN_R) {
      const s = MAX_SUN_R / rSun;
      this.posKm[0] *= s; this.posKm[1] *= s; this.posKm[2] *= s;
      _v1.set(this.posKm[0], this.posKm[1], this.posKm[2]).normalize();
      const vr = this.vel.dot(_v1);
      if (vr > 0) this.vel.addScaledVector(_v1, -vr);
    }

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
        if (vr < 0) this.vel.addScaledVector(_v1, -vr);
      }
    }

    // 刷新音频状态快照：飞行中无脚步 / 速度驱动大气风声 / 表面类型取最近天体
    this.audioState.walking = false;
    this.audioState.speed = this.vel.length();
    this.audioState.submerged = false;
    this.audioState.surfaceType = env.nearest
      ? surfaceTypeOf(env.phys(env.nearest.id))
      : this.audioState.surfaceType;
  }

  enterWalk(env) {
    const n = env.nearest;
    this.mode = 'walk';
    const w = this.walk;
    w.bodyId = n.id;
    _v1.set(this.posKm[0] - n.posKm[0], this.posKm[1] - n.posKm[1], this.posKm[2] - n.posKm[2]);
    _q1.copy(env.getBodyQuat(n.id)).invert();
    _v1.applyQuaternion(_q1);
    const h = env.heightFn(n.id, _v2.copy(_v1).normalize());
    w.localPos.copy(_v2).multiplyScalar(h + WALK_EYE_KM);
    w.vAlt = 0;
    w.grounded = true;
    const frame = this.walkFrame(_m1, env);
    _v3.set(0, 0, -1).applyQuaternion(this.quat);
    _q1.copy(env.getBodyQuat(w.bodyId)).invert();
    _v3.applyQuaternion(_q1);
    const e = new THREE.Vector3().setFromMatrixColumn(frame, 0);
    const upv = new THREE.Vector3().setFromMatrixColumn(frame, 1);
    const nrt = new THREE.Vector3().setFromMatrixColumn(frame, 2);
    w.yaw   = Math.atan2(_v3.dot(e), _v3.dot(nrt));
    w.pitch = Math.asin(THREE.MathUtils.clamp(_v3.dot(upv), -1, 1));
    w.smx = 0; w.smy = 0;
    w.diving = false; w.submerged = false;
    this.vel.set(0, 0, 0);
  }

  exitWalk(env) {
    this.mode = 'walk-exit';
    const up = _v1.copy(this.walk.localPos).normalize().applyQuaternion(env.getBodyQuat(this.walk.bodyId));
    this.posKm[0] += up.x * 0.003;
    this.posKm[1] += up.y * 0.003;
    this.posKm[2] += up.z * 0.003;
    this.vel.set(0, 0, 0);
    this.mode = 'fly';
  }

  walkFrame(outM, env) {
    const u = _v2.copy(this.walk.localPos).normalize();
    const poleY = Math.abs(u.y) > 0.999;
    const east  = poleY ? _v3.set(1, 0, 0) : _v3.set(0, 1, 0).cross(u).normalize();
    const north = new THREE.Vector3().crossVectors(u, east);
    return outM.makeBasis(east.clone(), u.clone(), north);
  }

  updateWalk(dt, input, env) {
    const w = this.walk;
    const bodyPos  = env.getBodyPos(w.bodyId);
    const bodyQuat = env.getBodyQuat(w.bodyId);
    const phys = env.phys(w.bodyId);
    const r = w.localPos.length();
    const g = (phys.gm / (r * r));

    // View input — pointer-lock OR single-finger drag OR touch drag
    let inDx = input.locked ? input.dx : (input.drag.active ? input.drag.dx : 0);
    let inDy = input.locked ? input.dy : (input.drag.active ? input.drag.dy : 0);
    inDx = Math.max(-WALK_FRAME_CLAMP, Math.min(WALK_FRAME_CLAMP, inDx));
    inDy = Math.max(-WALK_FRAME_CLAMP, Math.min(WALK_FRAME_CLAMP, inDy));
    const sm = 1 - Math.exp(-Math.min(dt, 0.033) / WALK_SMOOTH_TAU);
    w.smx += (inDx - w.smx) * sm;
    w.smy += (inDy - w.smy) * sm;
    w.yaw   += w.smx * WALK_SENS;
    w.pitch -= w.smy * WALK_SENS;
    if (w.pitch >  Math.PI) w.pitch -= 2 * Math.PI;
    if (w.pitch < -Math.PI) w.pitch += 2 * Math.PI;
    if (w.yaw   >  Math.PI) w.yaw   -= 2 * Math.PI;
    if (w.yaw   < -Math.PI) w.yaw   += 2 * Math.PI;

    const frame = this.walkFrame(_m1, env);
    const east  = _v1.setFromMatrixColumn(frame, 0).clone();
    const up    = _v2.setFromMatrixColumn(frame, 1).clone();
    const north = _v3.setFromMatrixColumn(frame, 2).clone();

    const fwd   = north.clone().multiplyScalar(Math.cos(w.yaw)).addScaledVector(east, Math.sin(w.yaw));
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();

    // Movement — keyboard + virtual joystick
    const jx = input.joystick.x;
    const jy = input.joystick.y;
    const move = new THREE.Vector3();
    if (input.down('KeyW') || jy < -0.15) move.add(fwd);
    if (input.down('KeyS') || jy > 0.15)  move.sub(fwd);
    if (input.down('KeyD') || jx > 0.15)  move.add(right);
    if (input.down('KeyA') || jx < -0.15) move.sub(right);

    const dirNow = w.localPos.clone().normalize();
    const surfR  = phys.radiusKm + 0.001;
    const onWater = !!env.isWater?.(w.bodyId, dirNow);
    if (onWater && !w.diving && (input.wheel <= -0.5 || input.down('PageDown') || input.touchDescend)) {
      w.diving = true; w.grounded = false; w.vAlt = 0;
    }
    const inWater = onWater && w.diving && r < surfR + 1e-7;
    let speed = ((input.down('ShiftLeft') || input.touchSprint) ? 0.009 : 0.003);
    if (inWater) speed *= 0.45;
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(speed * dt);
    w.localPos.add(move);

    if (inWater && input.wheel !== 0) {
      const depth = Math.max(surfR - w.localPos.length(), 0.0002);
      const step  = Math.max(0.0004, depth * 0.12);
      w.localPos.addScaledVector(up, step * Math.max(-3, Math.min(3, input.wheel)));
    }
    // Water vertical with touch
    if (inWater && input.touchAscend)  w.vAlt += g * 0.5 * dt;

    // Jump / ascend
    const jumpTriggered = input.tapped('Space') || input.touchJump;
    if (jumpTriggered) {
      if (w.grounded) {
        w.vAlt = inWater ? 0.0024 : 0.0042;
        w.grounded = false;
      }
      input.touchJump = false; // consume
    }
    if (inWater) {
      if (input.down('Space') || input.touchAscend) w.vAlt += g * 0.5 * dt;
      w.vAlt *= Math.exp(-dt * 2.5);
    } else {
      w.vAlt -= g * dt;
    }
    w.localPos.addScaledVector(up, w.vAlt * dt);

    const dir = w.localPos.clone().normalize();
    if (w.diving) {
      const rr = w.localPos.length();
      if (rr < surfR - 0.001) w.submerged = true;
      else if (w.submerged && rr >= surfR - 0.0001) { w.diving = false; w.submerged = false; w.vAlt = 0; }
    }
    const groundFn = w.diving ? (env.heightSolidFn ?? env.heightFn) : env.heightFn;
    const ground   = groundFn(w.bodyId, dir) + WALK_EYE_KM;
    if (w.localPos.length() <= ground) {
      w.localPos.copy(dir).multiplyScalar(ground);
      w.vAlt = 0; w.grounded = true;
    } else if (w.localPos.length() > ground + 0.0001) {
      w.grounded = false;
    }

    const worldOff = w.localPos.clone().applyQuaternion(bodyQuat);
    this.posKm[0] = bodyPos[0] + worldOff.x;
    this.posKm[1] = bodyPos[1] + worldOff.y;
    this.posKm[2] = bodyPos[2] + worldOff.z;

    const lookM  = new THREE.Matrix4();
    const camFwd = fwd.clone().multiplyScalar(Math.cos(w.pitch)).addScaledVector(up, Math.sin(w.pitch));
    const camUp  = up.clone().multiplyScalar(Math.cos(w.pitch)).addScaledVector(fwd, -Math.sin(w.pitch));
    lookM.lookAt(new THREE.Vector3(), camFwd, camUp);
    this.quat.setFromRotationMatrix(lookM).premultiply(bodyQuat);

    // 刷新音频状态快照：行走中 / 移动速度 / 潜水 / 表面类型
    this.audioState.walking = moving;
    this.audioState.speed = speed;
    this.audioState.submerged = !!w.submerged;
    this.audioState.surfaceType = surfaceTypeOf(phys);
  }
}
