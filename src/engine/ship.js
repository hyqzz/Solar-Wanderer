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
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
};

// 指针锁定 movementX/Y 已知尖峰 → 每事件钳制
const clampMove = (m) => Math.max(-150, Math.min(150, m));

/**
 * 指数大气模型（纯函数，便于验证）。
 *   ρ(h) = ρ₀·exp(−h/H)，H 取该天体的 Rayleigh 标高（地球 8.5km、火星 11.1km——
 *   与实测的大气密度标高同量级），ρ₀ 为该天体**地面密度**（地球 1.225 kg/m³、
 *   火星 0.020、金星 65）。
 *   q = ½ρv²（动压，Pa）；对流加热按 Sutton–Graves 律 q̇ ∝ √ρ·v³。
 *
 * 早期版本把标高写成 rayleighScaleKm·2.4（地球 20.4km）：这在 30km 以下还算贴合，
 * 但 60km 处密度比真实值高约 200 倍，动压算出来是 MPa 量级、加热峰值落在 120km
 * ——完全不对。标高必须用实测值。
 */
export function aeroAt(altKm, speedKmS, atm) {
  const H = atm.rayleighScaleKm ?? 8;
  const rho0 = atm.rho0 ?? 1.225;
  const rho = rho0 * Math.exp(-Math.max(altKm, 0) / H);
  const vMS = speedKmS * 1000;
  return { rho, q: 0.5 * rho * vMS * vMS, heat: Math.sqrt(Math.max(rho, 0)) * vMS * vMS * vMS };
}

export class Input {
  constructor(dom, canvas = null) {
    this.keys = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0; this.fovWheel = 0;
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

    // ── Gamepad（浏览器无手柄事件流，必须每帧轮询）────────────────────
    this._padIdx = -1;
    this._padKeys = new Set(); // 手柄模拟的按键（用于精准释放）
    this._padPrev = [];        // 按钮沿检测
    dom.addEventListener('gamepadconnected', (e) => { this._padIdx = e.gamepad.index; });
    dom.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this._padIdx) this._padIdx = -1;
    });

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
      // deltaMode 归一化：0=像素（Chrome/Edge），1=行（Firefox，×33），2=页（×100）
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1;
      // Shift+滚轮 = FOV 变焦（10°–100°），不进距离缩放通道
      const v = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * unit / 100, 1);
      if (e.shiftKey) this.fovWheel += v;
      else this.wheel += v;
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
      // 指针可能已失效（合成事件/边缘浏览器时序），捕获失败不应中断手势跟踪
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 手势状态照常记录 */ }
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
   * 手柄轮询（Gamepad API 无事件流，须每帧调用）。
   * 映射（标准布局）：
   *   探索模式：左摇杆=平移（GE 式 WASD 等价）/右摇杆=缩放/LB·RB=时间倍率
   *   飞行模式：左摇杆=视角/右摇杆=前后平移/左右=横移/LT·RT=速度档
   *   行走模式：左摇杆=视角/右摇杆=行走
   *   按钮：A=跳跃 B=惯性观察 X=急停 Y=登陆/返回 Start=暂停 Back=回到现在
   */
  pollGamepad(mode = 'orbit') {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    if (this._padIdx < 0) {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) { this._padIdx = i; break; }
      if (this._padIdx < 0) return;
    }
    const gp = navigator.getGamepads()[this._padIdx];
    if (!gp?.connected) { this._padIdx = -1; return; }

    const dz = (v) => (Math.abs(v) > 0.2 ? v : 0); // 死区
    const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0);
    const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);

    // 摇杆 → 按键模拟（与 GE 键盘方案同链路，零侵入）
    const want = new Set();
    if (mode === 'orbit') {
      if (ly < 0) want.add('KeyW'); if (ly > 0) want.add('KeyS');
      if (lx < 0) want.add('KeyA'); if (lx > 0) want.add('KeyD');
      if (ry < 0) want.add('PageUp'); if (ry > 0) want.add('PageDown');
    } else {
      this.dx += lx * 2.4; this.dy += ly * 2.4; // 左摇杆视角
      if (mode === 'walk') {
        this.joystick.x = rx; this.joystick.y = ry; // 右摇杆行走
      } else {
        if (ry < 0) want.add('KeyW'); if (ry > 0) want.add('KeyS');
        if (rx < 0) want.add('KeyA'); if (rx > 0) want.add('KeyD');
        if (gp.buttons[6]?.pressed) want.add('ShiftLeft');  // LT 减速/加速档
        if (gp.buttons[7]?.pressed) want.add('Equal');
      }
    }
    // 精准释放：上次模拟的键这次不再需要就删掉
    for (const k of this._padKeys) if (!want.has(k)) this.keys.delete(k);
    for (const k of want) this.keys.add(k);
    this._padKeys = want;

    // 按钮沿 → 一次性按键
    const BTN = { 0: 'Space', 1: 'KeyV', 2: 'KeyX', 3: 'KeyG', 4: 'BracketLeft', 5: 'BracketRight', 8: 'KeyN', 9: 'KeyP' };
    for (const [i, code] of Object.entries(BTN)) {
      const pressed = !!gp.buttons[i]?.pressed;
      const was = !!this._padPrev[i];
      if (pressed && !was) { this.keys.add(code); this.justPressed.add(code); }
      if (!pressed && was && !this._padKeys.has(code)) this.keys.delete(code);
      this._padPrev[i] = pressed;
    }
  }

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
    this.dx = 0; this.dy = 0; this.wheel = 0; this.fovWheel = 0;
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
    // 真实引力模式（默认关闭，快捷键切换）：开启后推力只提供加速度，
    // 速度由引力积分得到——于是可以自由落体、可以入轨、可以停在地球静止轨道
    // 看着行星自转，而不是"停手就被行星甩掉"。默认关闭以保留原有街机手感。
    this.gravityMode = false;
    this.effSpeed = 0;
    this.damping = true;
    this.walk = {
      bodyId: null, localPos: new THREE.Vector3(),
      yaw: 0, pitch: 0, vAlt: 0, grounded: false,
      smx: 0, smy: 0, diving: false, submerged: false,
      groundSmooth: null, // 接地视线低通状态（null = 未初始化）
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
      // DEM 基础层未就绪时不登陆（地表高程尚未切换到真实数据，落地后地面会塌陷）
      const ready = !env.baseReady || env.baseReady(env.nearest.id);
      if (this.mode === 'fly' && env.nearest.landable && env.nearest.distSurface < 20 && ready) {
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

    if (this.gravityMode) {
      // ── 真实引力：推力只给加速度，速度靠积分 ──
      // 主天体用平方反比，另叠太阳；不建模多体摄动（真实任务规划才需要）。
      // 关键点：**不做阻尼**——阻尼等于有介质，太空中没有。
      this.vel.addScaledVector(_v1, cap * boost * 0.5 * dt);   // 推力
      const nb = env.nearest;
      if (nb && nb.phys?.gm) {
        _v3.set(this.posKm[0] - nb.posKm[0], this.posKm[1] - nb.posKm[1], this.posKm[2] - nb.posKm[2]);
        const r2 = Math.max(_v3.lengthSq(), 1e-6);
        const r = Math.sqrt(r2);
        const a = nb.phys.gm / r2;                        // km/s²
        this.vel.addScaledVector(_v3, -a * dt / r);
      }
      const rSun2 = Math.max(this.posKm[0] ** 2 + this.posKm[1] ** 2 + this.posKm[2] ** 2, 1e-6);
      const aSun = 1.32712440018e11 / rSun2;
      const rSunLen = Math.sqrt(rSun2);
      this.vel.x -= aSun * dt * this.posKm[0] / rSunLen;
      this.vel.y -= aSun * dt * this.posKm[1] / rSunLen;
      this.vel.z -= aSun * dt * this.posKm[2] / rSunLen;
      if (input.tapped('KeyX')) { /* 引力模式下 X 不再清零速度：那等于凭空消掉动量 */ }
    } else if (this.damping) {
      _v2.copy(_v1).multiplyScalar(cap * boost);
      const k = 1 - Math.exp(-dt * 3.5);
      this.vel.lerp(_v2, k);
      if (!thrusting && this.vel.lengthSq() < 1e-10) this.vel.set(0, 0, 0);
    } else {
      this.vel.addScaledVector(_v1, cap * boost * 0.5 * dt);
    }
    if (!this.gravityMode && input.tapped('KeyX')) this.vel.set(0, 0, 0);

    // === 大气阻力与气动加热 ===
    // 此前只有音效层（audio.js 的再入轰鸣），**没有任何物理**：以 7 km/s 冲进
    // 地球大气，既没有阻力、也没有加热、没有过载。这是"相机漫游"与"飞行模拟"
    // 的分界，也是最容易一眼看穿的缺失之一。
    //
    // 模型：指数大气 ρ(h)=ρ0·exp(-h/H)；阻力加速度 a = q/β（q=½ρv²，β 为弹道
    // 系数）；对流加热按 Sutton–Graves 律 q̇ ∝ √ρ·v³。
    // 这些量同时驱动相机抖动与等离子鞘的强度（见 main.js）。
    this.aero = this.aero || { q: 0, heat: 0, rho: 0, alt: Infinity };
    {
      const nb = env.nearest;
      const atmN = nb?.phys?.atmosphere;
      if (atmN && Number.isFinite(nb.distSurface)) {
        const alt = Math.max(nb.distSurface, 0);            // km
        const a = aeroAt(alt, this.vel.length(), atmN);
        this.aero.rho = a.rho; this.aero.alt = alt; this.aero.q = a.q; this.aero.heat = a.heat;
        if (a.q > 1e-6) {
          // 弹道系数 β = m/(Cd·A) ≈ 500 kg/m²（钝头返回舱量级）
          const aMS = a.q / 500;
          const dv = Math.min(this.vel.length(), aMS * 1e-3 * dt);   // km/s
          if (this.vel.length() > 0) this.vel.multiplyScalar(1 - dv / this.vel.length());
        }
      } else {
        this.aero.q = 0; this.aero.heat = 0; this.aero.rho = 0; this.aero.alt = Infinity;
      }
    }

    // 记录积分前的位置：碰撞要做**扫掠**判定（见下方），只判"移动之后的位置"
    // 会让高速飞船直接穿过天体。
    if (!this._prevPosKm) this._prevPosKm = new Float64Array(3);
    this._prevPosKm[0] = this.posKm[0];
    this._prevPosKm[1] = this.posKm[1];
    this._prevPosKm[2] = this.posKm[2];
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
      let minR = n.radiusKm + (n.landable ? 0.005 : n.radiusKm * 0.001);
      // === 地形碰撞 ===
      // 只用"平均球半径 + 5 m"的话，可以贴着 5 m 高度**穿过山脉**——
      // 碰撞体是球而不是地表。这里在接近地表时改用该方向上的真实地表半径
      // （DEM 起伏 + 程序细节，与渲染同源），于是山体、悬崖、坑缘都是实体。
      // 只在 dist < 1.05 R 时查询，避免高空每帧调用地形采样。
      if (n.landable && env.heightFn && dist > 0 && dist < n.radiusKm * 1.05) {
        _v1.normalize();
        _v4.copy(_v1).applyQuaternion(_q1.copy(env.getBodyQuat(n.id)).invert());  // 世界→体固
        const h = env.heightFn(n.id, _v4);
        if (Number.isFinite(h) && h > 0) minR = h + 0.005;
      }
      // === 扫掠碰撞 ===
      // 只判"移动之后的位置"是不够的：速度上限到 2 AU/s，一帧可以走几十万公里，
      // 整个掠过区间都可能落在球外 → **完全不触发碰撞，直接穿过去**；而若恰好
      // 停在球内，按移动后方向求解还会把人"吐"到星球背面。
      // 这里对"积分前位置 → 当前位置"这一段做线段-球求交，取最先到达的交点。
      if (dist < minR && dist > 0) {
        _v1.normalize();
        this.posKm[0] = n.posKm[0] + _v1.x * minR;
        this.posKm[1] = n.posKm[1] + _v1.y * minR;
        this.posKm[2] = n.posKm[2] + _v1.z * minR;
        const vr = this.vel.dot(_v1);
        if (vr < 0) this.vel.addScaledVector(_v1, -vr);
      } else if (this._prevPosKm) {
        const ax = this._prevPosKm[0] - n.posKm[0];
        const ay = this._prevPosKm[1] - n.posKm[1];
        const az = this._prevPosKm[2] - n.posKm[2];
        const dx = this.posKm[0] - this._prevPosKm[0];
        const dy = this.posKm[1] - this._prevPosKm[1];
        const dz = this.posKm[2] - this._prevPosKm[2];
        const A = dx * dx + dy * dy + dz * dz;
        if (A > 1e-18) {
          const B = 2 * (ax * dx + ay * dy + az * dz);
          const C = ax * ax + ay * ay + az * az - minR * minR;
          const disc = B * B - 4 * A * C;
          if (disc >= 0) {
            const t = (-B - Math.sqrt(disc)) / (2 * A);
            if (t >= 0 && t <= 1) {
              // 线段在 t 处进入球体：把飞船放到该点，并消掉法向速度
              this.posKm[0] = this._prevPosKm[0] + dx * t;
              this.posKm[1] = this._prevPosKm[1] + dy * t;
              this.posKm[2] = this._prevPosKm[2] + dz * t;
              const px = this.posKm[0] - n.posKm[0];
              const py = this.posKm[1] - n.posKm[1];
              const pz = this.posKm[2] - n.posKm[2];
              const pl = Math.hypot(px, py, pz) || 1;
              const vr = (this.vel.x * px + this.vel.y * py + this.vel.z * pz) / pl;
              if (vr < 0) { this.vel.x -= vr * px / pl; this.vel.y -= vr * py / pl; this.vel.z -= vr * pz / pl; }
            }
          }
        }
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
    w.groundSmooth = null; // 重新初始化接地低通（登陆点高程为初值）
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
    // 主动下潜的意图（键盘/触控/滚轮下）
    const wantDescend = input.down('PageDown') || input.touchDescend || input.wheel <= -0.5;
    // 入水判定：**不再要求先按"下潜"**。原来 inWater 需要 w.diving 且 r < surfR+1e-7，
    // 而站立时 r = surfR + 眼高(1.7m)，两个条件都够不着——于是走到海上既不减速、
    // 也不受浮力，只是"站在水面上走"。
    const inWater = onWater && r < surfR + 0.0015;
    // 下潜态改为**派生量**（在水里 + 主动下沉），不再是需要单独进入/退出的模式。
    // 原来 w.diving 由滚轮置位、又由"浮出水面"清除，而浮力一旦把人抬回水面就与
    // 清零条件互相抵消——实测按住下潜键 3 秒 diving 仍然是 false。
    w.diving = inWater && wantDescend;
    let speed = ((input.down('ShiftLeft') || input.touchSprint) ? 0.009 : 0.003);
    if (inWater) speed *= 0.45;
    const moving = move.lengthSq() > 0;
    if (moving) {
      move.normalize().multiplyScalar(speed * dt);
      // 坡度限制：真实的人走不上陡崖。此前只有"把位置半径吸附到地面高度"，
      // 走向垂直崖壁时新方向的地面更高，于是可以以 3 m/s **垂直爬上去**
      // （真实 DEM 的火星/月球上，奥林帕斯山、陨石坑壁尤其明显）。
      //
      // 判据用本步的爬升率：水平位移 ≈ speed·dt，超过 tan(60°)=1.73 倍即拒绝。
      // 60° 而不是 45°：程序地形在坑缘处本来就陡，45° 会让人频繁卡住；
      // 只拦"向上"，下坡不限制。
      if (!inWater) {
        const cand = w.localPos.clone().add(move).normalize();
        const rise = env.heightFn(w.bodyId, cand) - env.heightFn(w.bodyId, dirNow);
        const run = speed * dt;
        if (rise > run * 1.73) move.set(0, 0, 0);
      }
      w.localPos.add(move);
    }

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
      // 浮力：把人推回水面。原来只有阻尼、没有浮力，所以"入水"实际等于"沉底"。
      // 目标上浮速度 ∝ 深度（越深上浮越快），封顶 1.2 m/s；主动下潜时不生效。
      const depth = Math.max(0, surfR - w.localPos.length());
      if (wantDescend) {
        w.vAlt -= g * 0.5 * dt;
      } else {
        const wantV = Math.min(depth * 0.6, 0.0012);
        w.vAlt += (wantV - w.vAlt) * Math.min(dt * 2.5, 1);
      }
      w.vAlt *= Math.exp(-dt * 0.8);   // 水阻
    } else {
      w.vAlt -= g * dt;
    }
    w.localPos.addScaledVector(up, w.vAlt * dt);

    const dir = w.localPos.clone().normalize();
    // 没入水面即算潜水（不再只由 w.diving 决定，否则浮力把脚抬回水面后状态就卡住）
    const rr = w.localPos.length();
    w.submerged = onWater && rr < surfR - 0.0002;
    // 地面：下潜时是海床；在水面（未下潜）时脚在水面下 1.4m —— 人是半个身子泡在
    // 水里，不是站在水上。原来直接用 heightFn（=水面）加眼高，等于站在水面上走。
    let ground;
    if (w.diving) {
      ground = (env.heightSolidFn ?? env.heightFn)(w.bodyId, dir) + WALK_EYE_KM;
    } else if (onWater) {
      ground = surfR - 0.0014 + WALK_EYE_KM;
    } else {
      ground = env.heightFn(w.bodyId, dir) + WALK_EYE_KM;
    }
    // 接地视线低通：解析高度场含分米级微地形，且 DEM 瓦片异步到达会突变局部
    // 高程——视线高度直连时每步都在微抖动/瓦片到达瞬间跳动。非对称时间常数：
    // 地面上升快速跟随（防穿进坡里），下降缓慢沉降（自然步态下台阶感）。
    if (w.groundSmooth == null) w.groundSmooth = ground;
    if (w.grounded) {
      const delta = ground - w.groundSmooth;
      // 大偏差（>5m）= DEM 高分辨率瓦片到达导致的地形权威更新（山地粗/细
      // 层级可差数百米）：此时地形网格同步淡变，相机贴地滑翔跟随而非自由落体
      // （旧逻辑 ground 骤降 → grounded=false → 从数公里高空物理坠落 1 分钟）
      const big = Math.abs(delta) > 0.005;
      const tau = big ? 0.55 : (delta > 0 ? 0.03 : 0.11);
      w.groundSmooth += delta * (1 - Math.exp(-dt / tau));
      if (Math.abs(delta) < 1e-7) w.groundSmooth = ground;
      if (big) {
        w.localPos.copy(dir).multiplyScalar(w.groundSmooth); // 贴地滑翔
        w.vAlt = 0;
        ground = w.groundSmooth;
      }
    } else {
      w.groundSmooth = ground; // 空中/跳跃：不滤波，落地帧再接管
    }
    ground = w.grounded ? w.groundSmooth : ground;
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
