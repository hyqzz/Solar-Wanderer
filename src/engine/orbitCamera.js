// Google Earth 式探索相机，扩展到整个日球层：
// - 相机锚定在焦点天体的体固系（纬度/经度/距离），随天体公转与自转——如同 GE 锚定地表经纬
// - 左键拖拽旋转（带惯性衰减）、滚轮指数缩放、北极朝上、焦点恒居屏幕中央
// - flyTo：GE 签名式飞行动画——对数高度剖面 + 正弦弧线拉升 + 视线提前锁定，
//   到达时停于目标日照面上空，目标居中

import * as THREE from 'three';

const DEG = Math.PI / 180;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _vm = new THREE.Vector3(); // minDist/groundRadius/光标锚点专用（不与 _v1-3 串用）
const _va = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qf = new THREE.Quaternion(); // setInertial/交接快照专用（不与 _q 串用）
const _qg = new THREE.Quaternion(); // groundRadiusOf 专用（R10：不得复用 _qf——
                                    // setInertial 经 adoptPosition→minDist→groundRadiusOf
                                    // 会覆盖待恢复视向，曾导致可登陆天体按 V 镜头跳跃）
const IDENTITY_Q = new THREE.Quaternion();

const EYE_KM = 0.0017;          // 行走视高 1.7 m（与 ship.js 一致）
const AUTO_TILT_MAX = 80 * DEG; // 近地自动倾斜上限（俯视 → 近地平，GE/NMS 着陆观感）
// 远离上限：121 AU 日球层顶完整入画（58° 视场 → ~250 AU），不再无限远离（R9-1c）
const MAX_DIST = 3.74e10;

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class OrbitCamera {
  constructor() {
    this.focusId = 'earth';
    this.lat = 12 * DEG;
    this.lon = 0;
    this.dist = 1;        // km，自天体中心
    this.distTarget = 1;
    this.vLat = 0;        // 惯性角速度 rad/s
    this.vLon = 0;
    this.heading = 0;     // GE 航向（Shift+A/D 旋转，北偏角）
    this.tilt = 0;        // GE 倾斜（Shift+W/S，0=俯视中心，正值看向地平）
    this.panOffset = new THREE.Vector3(); // 空间平移（体固系 km，右键拖拽：整个空间随鼠标移动，无旋转）
    this.flight = null;
    this.posKm = new Float64Array(3);
    this.quat = new THREE.Quaternion();
    this._autoTilt = 0;   // 近地自动倾斜（每帧由高度计算，叠加在用户 tilt 上）
    this._dolly = 1;      // 视线推拉模式的待消耗缩放比例（倾斜/平移时滚轮沿视线接近屏幕中心）
    this._dollyDepth = null; // 推拉参考深度（绝对值，随推进递减；位移吸收进 panOffset 后
                             // 锚点会随相机同移，深度必须独立跟踪，否则匀速冲越不收敛）
    this._dollyTargetId = null; // 推拉手势锁定的目标天体（整个手势绝不换靶，R9-1b）
    this.inertial = false; // 惯性观察模式：相机不随天体自转——观赏卫星/行星绕转（R9-1e）
    this._streak = 0;      // 滚轮连滚加速度（轻拨精细 → 连滚加速，R9-1c）
    this._streakIdle = 0;
    this._zoomHold = 0;    // PageUp/Down 按住渐加速
    this._navHold = 0;     // 键盘平移/旋转按住渐加速（R10：所有操作低→高灵敏度）
  }

  /** 锚定参考系：体固（默认，随自转）或惯性（观赏绕转） */
  frameQuat(f) { return this.inertial ? IDENTITY_Q : f.quat; }

  /** 切换惯性观察模式：以当前位姿无缝重新锚定（位置/视向严格连续） */
  setInertial(on, env) {
    if (this.inertial === on) return;
    const pos = Float64Array.from(this.posKm);
    _qf.copy(this.quat);
    this.inertial = on;
    this.adoptPosition(env, this.focusId, pos, _qf);
  }

  /** env.get(id) -> { posKm:Float64Array, radiusKm, quat:THREE.Quaternion(体固→世界), viewDist? } */
  init(env, focusId, distMul = 4) {
    this.focusId = focusId;
    const f = env.get(focusId);
    this.dist = this.distTarget = f.radiusKm * distMul;
    // 初始视角：日照面（相机在太阳一侧）
    this.alignSunward(env);
    this.compute(env);
  }

  alignSunward(env) {
    const f = env.get(this.focusId);
    _v1.set(-f.posKm[0], -f.posKm[1], -f.posKm[2]).normalize(); // 指向太阳
    _q.copy(this.frameQuat(f)).invert();
    _v1.applyQuaternion(_q); // → 体固系
    this.lat = Math.asin(THREE.MathUtils.clamp(_v1.y, -1, 1)) * 0.6;
    this.lon = Math.atan2(-_v1.z, _v1.x);
  }

  /**
   * 由任意世界位置恢复轨道参数（从飞船/行走模式切回时）。
   * quat 非空时反解 heading/tilt，使切换前后视向严格连续（R7 #1/#7 无缝起飞）。
   */
  adoptPosition(env, focusId, worldPosKm, quat = null) {
    this.focusId = focusId;
    const f = env.get(focusId);
    _v1.set(
      worldPosKm[0] - f.posKm[0], worldPosKm[1] - f.posKm[1], worldPosKm[2] - f.posKm[2]
    );
    const d = _v1.length();
    _v2.copy(_v1).normalize(); // 径向（世界系），姿态反解用
    _q.copy(this.frameQuat(f)).invert();
    _v1.applyQuaternion(_q).normalize();
    this.lat = Math.asin(THREE.MathUtils.clamp(_v1.y, -1, 1));
    this.lon = Math.atan2(-_v1.z, _v1.x);
    this.dist = this.distTarget = Math.max(d, this.minDist(f));
    this.vLat = this.vLon = 0;
    this.heading = 0;
    this.tilt = 0;
    this.panOffset.set(0, 0, 0);
    this.flight = null;
    this._dolly = 1;
    this._dollyDepth = null;
    this._dollyTargetId = null;
    if (quat) this.adoptOrientation(f, _v2, quat);
  }

  /** 由相机四元数反解 heading/tilt（u = 径向单位向量，世界系） */
  adoptOrientation(f, u, quat) {
    const view = _va.set(0, 0, -1).applyQuaternion(quat);
    const cosT = THREE.MathUtils.clamp(-view.dot(u), -1, 1);
    const tiltTotal = Math.acos(cosT); // 0=看向天体中心，π/2=看地平
    // 视线的地平面投影方向 p（tilt∈(0,π) 时即“屏幕上方”绕径向的方位）
    const p = _v3.copy(view).addScaledVector(u, -view.dot(u));
    if (p.lengthSq() < 1e-10) {
      // 视线≈径向：用相机上方向投影定 heading
      p.set(0, 1, 0).applyQuaternion(quat);
      p.addScaledVector(u, -p.dot(u));
    }
    if (p.lengthSq() < 1e-10) { this.heading = 0; this.tilt = 0; return; }
    p.normalize();
    // 锚定系北极在地平面的投影 np 与东向 ep
    const np = _vm.set(0, 1, 0).applyQuaternion(this.frameQuat(f));
    np.addScaledVector(u, -np.dot(u));
    if (np.lengthSq() < 1e-10) { this.heading = 0; this.tilt = tiltTotal - this._autoTilt; return; }
    np.normalize();
    const ep = _va.crossVectors(u, np); // 与 compute 中 applyAxisAngle(u, heading) 同手性
    this.heading = Math.atan2(p.dot(ep), p.dot(np));
    // 总倾斜 = 用户 tilt + 自动倾斜 → 用户分量回填，保证 compute 复现同一视向
    const ground = this.groundRadiusOf(f);
    this.tilt = tiltTotal - this.autoTiltOf(f, Math.max(this.dist - ground, 0));
  }

  /** 当前 lat/lon 方向的地面半径（与行走碰撞同源；非可登陆体 = 平均半径） */
  groundRadiusOf(f) {
    if (!f.groundRadius) return f.radiusKm;
    const cl = Math.cos(this.lat);
    _vm.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon));
    // 惯性模式下 lat/lon 在惯性系：转为体固系再查地形（地形高度场是体固的）
    if (this.inertial) _vm.applyQuaternion(_qg.copy(f.quat).invert());
    return f.groundRadius(_vm);
  }

  /** 近地自动倾斜：高度低于 startAlt 时俯视连续过渡到近地平（GE/NMS 着陆观感） */
  autoTiltOf(f, alt) {
    const startAlt = THREE.MathUtils.clamp(f.radiusKm * 0.04, 1, 600);
    const t = 1 - THREE.MathUtils.clamp(alt / startAlt, 0, 1);
    return t <= 0 ? 0 : AUTO_TILT_MAX * Math.pow(t, 1.6);
  }

  /**
   * 最小距离（自天体中心）：
   * - 可登陆体：当前方向地形高度 + 1.7m 视高（滚轮可一路落到地面，R7 #1）
   * - 气巨/冰巨：env 提供 minDistKm（允许下潜入大气至云甲板上空，R7 #5）
   * - 其余（太阳等）：旧公式 R×1.004+1
   */
  minDist(f) {
    if (f.groundRadius) return this.groundRadiusOf(f) + EYE_KM;
    if (f.minDistKm) return f.minDistKm;
    return f.radiusKm * 1.004 + 1;
  }

  /**
   * 极点穿越翻转（chart flip）：纬度越过 ±90° 时
   * lat→180°−lat、lon+=180°、heading+=180°、vLat 反号 —— 相机位置与画面严格连续，
   * 实现翻越极点的无限环绕（设计原则：一切视角自由循环，纬度亦不例外）。
   */
  poleNormalize() {
    const HALF = Math.PI / 2;
    if (this.lat > HALF || this.lat < -HALF) {
      this.lat = (this.lat > HALF ? Math.PI : -Math.PI) - this.lat;
      this.lon += Math.PI;
      this.heading += Math.PI;
      this.vLat = -this.vLat;
    }
    if (this.lon > Math.PI) this.lon -= 2 * Math.PI;
    else if (this.lon < -Math.PI) this.lon += 2 * Math.PI;
    if (this.heading > Math.PI) this.heading -= 2 * Math.PI;
    else if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
  }

  arrivalDist(env, id) {
    const t = env.get(id);
    if (t.viewDist) return t.viewDist;
    return Math.max(t.radiusKm * 3.5, 3);
  }

  /** GE 式飞行动画启动 */
  flyTo(env, toId) {
    const to = env.get(toId);
    const from = env.get(this.focusId);
    const sep = Math.hypot(
      to.posKm[0] - from.posKm[0], to.posKm[1] - from.posKm[1], to.posKm[2] - from.posKm[2]
    );
    const h0 = Math.max(this.dist, this.minDist(from));
    const h1 = this.arrivalDist(env, toId);
    // 起始方向：当前相机相对焦点；终点方向：目标日照面（略抬升）
    _v1.set(
      this.posKm[0] - from.posKm[0], this.posKm[1] - from.posKm[1], this.posKm[2] - from.posKm[2]
    );
    const dir0 = _v1.lengthSq() > 0 ? _v1.clone().normalize() : new THREE.Vector3(0, 0.3, 1).normalize();
    _v2.set(-to.posKm[0], -to.posKm[1], -to.posKm[2]).normalize(); // 目标处指向太阳
    const dir1 = _v2.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.45).normalize();
    // 时长：距离对数缩放（同星球微调 ~2s，跨日球层 ~7s）
    const dur = THREE.MathUtils.clamp(1.6 + Math.log10(Math.max(sep + h0, 10) / 1e4) * 0.55, 1.8, 7);
    // 墙钟驱动（GE 行为：固定真实时长，低帧率下跳帧前进）
    this.flight = { toId, fromId: this.focusId, t: 0, dur, h0, h1, dir0, dir1, start: performance.now() };
  }

  cancelFlight(env) {
    if (!this.flight) return;
    // 就地接管：以当前位置相对更近的天体恢复轨道参数
    const to = this.flight.toId;
    this.flight = null;
    this.adoptPosition(env, to, this.posKm);
  }

  update(dt, input, env) {
    if (this.flight) {
      this.updateFlight(dt, env);
      return;
    }
    let f = env.get(this.focusId);
    const drag = input.drag;

    // ---- Google Earth 键盘方案 ----
    const shift = input.down('ShiftLeft') || input.down('ShiftRight');
    // 高度 = 距当前方向地面（与行走碰撞同源），所有近地速率/倾斜以此为准（R7 #1/#7）
    const groundR = this.groundRadiusOf(f);
    const alt = Math.max(this.dist - groundR, f.radiusKm * 1e-6);
    // 平移角速率随高度缩放（贴地慢、高空快，GE 手感）。
    // 下限 3e-6 rad/s（地球≈19 m/s）：旧值 0.015 按 25km 最低高度调参，
    // R7 允许降到地面 1.7m，旧下限在地面≈95 km/s 失控
    const panRate = 1.0 * THREE.MathUtils.clamp(alt / f.radiusKm, 3e-6, 1.2);
    const up = (input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0;
    const dn = (input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0;
    const lf = (input.down('KeyA') || input.down('ArrowLeft')) ? 1 : 0;
    const rt = (input.down('KeyD') || input.down('ArrowRight')) ? 1 : 0;
    // 键盘操作灵敏度由低到高（R10）：按下瞬间精细，持续按住渐加速（0.45→1.65 倍）
    this._navHold = (up || dn || lf || rt) ? Math.min(this._navHold + dt, 2) : 0;
    const navMul = 0.45 + this._navHold * 0.6;
    if (!shift) {
      // 平移（屏幕空间，随航向旋转；↑北 ↓南 ←西 →东；纬度可穿越极点连续环绕）
      const sN = up - dn, sE = rt - lf;
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      this.lat += (sN * ch - sE * sh) * panRate * navMul * dt;
      this.lon += ((sN * sh + sE * ch) * panRate * navMul * dt) /
        Math.max(Math.abs(Math.cos(this.lat)), 0.15);
    } else {
      // Shift+A/D 旋转航向；Shift+W/S 倾斜 —— 均为 360° 无限循环
      //（设计原则：一切视角自由循环，纬度经极点穿越翻转实现）
      this.heading += (lf - rt) * 1.1 * navMul * dt;
      this.tilt += (up - dn) * 0.9 * navMul * dt;
      if (this.tilt > Math.PI) this.tilt -= 2 * Math.PI;
      if (this.tilt < -Math.PI) this.tilt += 2 * Math.PI;
      if (this.heading > Math.PI) this.heading -= 2 * Math.PI;
      if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }
    // PageUp/PageDown 与 +/- 缩放（与滚轮统一为屏幕中心语义，集中在下方缩放段处理）
    let zoomK = 0;
    if (input.down('PageUp') || input.down('Equal') || input.down('NumpadAdd')) zoomK -= 1;
    if (input.down('PageDown') || input.down('Minus') || input.down('NumpadSubtract')) zoomK += 1;
    // R 复位视角（GE: 北朝上、回俯视、平移归零）
    if (input.tapped('KeyR')) { this.heading = 0; this.tilt = 0; this.panOffset.set(0, 0, 0); }

    // Ctrl+左键拖拽 → 旋转航向/倾斜（围绕焦点的 3D 环视，R7 #7）
    if (input.look?.active && (input.look.dx !== 0 || input.look.dy !== 0)) {
      this.heading += input.look.dx * 0.0035;
      this.tilt += input.look.dy * 0.0035;
      if (this.tilt > Math.PI) this.tilt -= 2 * Math.PI;
      if (this.tilt < -Math.PI) this.tilt += 2 * Math.PI;
      if (this.heading > Math.PI) this.heading -= 2 * Math.PI;
      if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    // 右键/中键拖拽 → 空间平移（无旋转：整个空间跟随鼠标移动）
    if (input.pan.active && (input.pan.dx !== 0 || input.pan.dy !== 0)) {
      const k = this.dist * 0.0012;
      _v2.set(1, 0, 0).applyQuaternion(this.quat);  // 相机右
      _v3.set(0, 1, 0).applyQuaternion(this.quat);  // 相机上
      _v2.multiplyScalar(-input.pan.dx * k).addScaledVector(_v3, input.pan.dy * k);
      _q.copy(this.frameQuat(f)).invert();
      _v2.applyQuaternion(_q); // 世界 → 锚定系
      this.panOffset.add(_v2);
      const maxPan = this.dist * 2 + f.radiusKm * 2;
      if (this.panOffset.length() > maxPan) this.panOffset.setLength(maxPan);
    }

    // ---- 拖拽 → 角速度（直接响应 + 松手惯性，随航向旋转） ----
    // 灵敏度随离地高度收敛（≈"抓住地面拖动"：近地慢、高空快，R7 #7）
    const sens = THREE.MathUtils.clamp(0.00123 * alt / f.radiusKm, 2e-6, 0.0052);
    if (drag.active) {
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      this.vLat = ((drag.dy * ch - drag.dx * sh) * sens) / Math.max(dt, 1e-3);
      this.vLon = ((-drag.dx * ch - drag.dy * sh) * sens) / Math.max(dt, 1e-3);
    }
    this.lon += this.vLon * dt;
    this.lat += this.vLat * dt;
    this.poleNormalize();
    const damp = Math.exp(-dt * (drag.active ? 0 : 4.5));
    this.vLon *= damp;
    this.vLat *= damp;

    // ---- 缩放（R8 #2 / R9-1b/c/d）：滚轮与 PageUp/Down 统一为"以屏幕中心接近/远离" ----
    // 灵敏度由低到高（R9-1c）：轻拨精细（×1.12/格），连滚渐加速（最高 ×1.38/格）；
    // PageUp/Down 按住时间越长速率越高（0.55 → 2.2 /s）
    if (input.wheel !== 0) {
      this._streak = Math.min(this._streak + Math.abs(input.wheel) * 0.18, 1);
      this._streakIdle = 0;
    } else {
      this._streakIdle += dt;
      if (this._streakIdle > 0.35) this._streak = Math.max(this._streak - dt * 2, 0);
    }
    this._zoomHold = zoomK !== 0 ? Math.min(this._zoomHold + dt, 2.5) : 0;
    let zoomMul = 1;
    if (zoomK !== 0) zoomMul *= Math.exp(zoomK * (0.55 + this._zoomHold * 0.65) * dt);
    if (input.wheel !== 0) {
      zoomMul *= Math.pow(1.12 + 0.26 * this._streak, THREE.MathUtils.clamp(input.wheel, -3, 3));
    }

    // （R10 修订）滚轮/PageUp/Down 不再隐式切换焦点 —— 严格沿屏幕中心前进/后退；
    // 焦点只通过点击天体 / 搜索 / 双击标签显式切换（main.js pickBody）。

    // 无倾斜无平移：视线轴 = 焦点径向 → 经典径向缩放（着陆流程依赖的语义，保持不变）。
    // 缩放按"离地高度"等比（R10）：贴地时步长米级、高空步长公里级 ——
    // 可精确定位到任何高度（旧实现按中心距等比，贴地一格外推 700 km）。
    // 有倾斜或平移：视线不再指向轨道锚点，径向缩放会让屏幕中心目标甩偏/跳跃 ——
    // 改为沿视线推拉（dolly）；目标在手势起点锁定一次，整个手势绝不换靶（R9-1b：
    // 旧实现每帧按屏幕中心实时重定目标，视线漂移扫过近处天体时参考深度突变 → 瞬间猛冲）。
    const offAxis = this.panOffset.lengthSq() > 0 || Math.abs(this.tilt) > 0.02;
    if (!offAxis) {
      this._dolly = 1;
      this._dollyTargetId = null;
      const minD = this.minDist(f);
      const base = minD - 0.002; // 基准 = 下限略下方（贴地时高度步长 ≥ 2m 起步）
      const a = Math.max(this.distTarget - base, 0.0008);
      this.distTarget = THREE.MathUtils.clamp(base + a * zoomMul, minD, MAX_DIST);
      this.dist += (this.distTarget - this.dist) * Math.min(dt * 7, 1);
    } else {
      this.distTarget = this.dist; // 冻结径向缩放通道
      if (zoomMul !== 1) {
        if (this._dolly === 1) {
          // 新手势：捕获并锁定目标（命中天体优先，否则锚点投影）
          this._dollyDepth = null;
          this._dollyTargetId = null;
          _va.set(0, 0, -1).applyQuaternion(this.quat);
          const hit = env.centerHit?.(this.posKm, _va) ?? null;
          if (hit) {
            this._dollyTargetId = hit.id ?? null;
            this._dollyDepth = hit.depth;
          } else {
            const d = env.centerDepth?.(this.posKm, _va) ?? null;
            if (d != null) this._dollyDepth = d;
          }
        }
        this._dolly *= zoomMul;
      }
      if (Math.abs(this._dolly - 1) > 1e-5) {
        _va.set(0, 0, -1).applyQuaternion(this.quat);
        // 深度刷新：只对手势锁定的那一个目标做射线求交（绝不换靶）
        if (this._dollyTargetId && env.get) {
          const tb = env.get(this._dollyTargetId);
          if (tb) {
            // 目标=焦点（用户点击锁定）→ 用地形感知下限，可一路推进到地表触发自动登陆
            const margin = this._dollyTargetId === this.focusId
              ? this.minDist(tb) : (tb.minDistKm ?? tb.radiusKm * 1.004 + 1);
            _v2.set(
              tb.posKm[0] - this.posKm[0], tb.posKm[1] - this.posKm[1], tb.posKm[2] - this.posKm[2]
            );
            const b = _v2.dot(_va);
            if (b > 0) {
              const det = b * b - (_v2.lengthSq() - margin * margin);
              if (det > 0) {
                const tHit = b - Math.sqrt(det);
                if (tHit > 1e-6) this._dollyDepth = tHit;
              }
            }
          }
        }
        if (this._dollyDepth == null) {
          _v1.copy(this.panOffset).applyQuaternion(this.frameQuat(f));
          _v1.set(
            f.posKm[0] + _v1.x - this.posKm[0],
            f.posKm[1] + _v1.y - this.posKm[1],
            f.posKm[2] + _v1.z - this.posKm[2]
          );
          const t = _v1.dot(_va);
          this._dollyDepth = t > f.radiusKm * 1e-6 ? t : null;
        }
        const depth = this._dollyDepth;
        if (depth == null || depth <= f.radiusKm * 1e-6) {
          this._dolly = 1; // 屏幕中心无可接近目标 → 停止推进
        } else {
          // 平滑消耗（与径向缩放同节奏）；T = 本帧绝对目标深度
          const k = Math.min(dt * 7, 1);
          const T = depth * this._dolly;
          const sNew = Math.max(depth + (T - depth) * k, 1e-9);
          let delta = depth - sNew; // >0 = 沿视线前进
          // 防穿入焦点天体：|pos + V·δ − f.pos| ≥ minDist（二次方程取最近正根）
          if (delta > 0) {
            _v2.set(
              this.posKm[0] - f.posKm[0], this.posKm[1] - f.posKm[1], this.posKm[2] - f.posKm[2]
            );
            const minD = this.minDist(f);
            const b = _v2.dot(_va);
            const c = _v2.lengthSq() - minD * minD;
            const det = b * b - c;
            if (c > 0 && det > 0) {
              const tHit = -b - Math.sqrt(det);
              if (tHit > 0 && delta > tHit) delta = Math.max(tHit - 1e-6, 0);
            }
          }
          // 远离上限：日心距不得超过日球层全景距离（R9-1c）
          if (delta < 0) {
            const rSun = Math.hypot(this.posKm[0], this.posKm[1], this.posKm[2]);
            if (rSun > MAX_DIST) delta = 0;
          }
          this.posKm[0] += _va.x * delta;
          this.posKm[1] += _va.y * delta;
          this.posKm[2] += _va.z * delta;
          // 位置变化吸收进 panOffset（lat/lon/dist/heading/tilt 全部不变 → 画面姿态稳定）
          _v1.set(
            this.posKm[0] - f.posKm[0], this.posKm[1] - f.posKm[1], this.posKm[2] - f.posKm[2]
          );
          const cl = Math.cos(this.lat);
          _v3.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon))
            .applyQuaternion(this.frameQuat(f)); // 径向（世界）
          _v1.addScaledVector(_v3, -this.dist); // 锚点偏移（世界）
          _q.copy(this.frameQuat(f)).invert();
          this.panOffset.copy(_v1.applyQuaternion(_q));
          // 参考深度随推进递减；剩余比例 = 绝对目标 / 新深度
          this._dollyDepth = depth - delta;
          this._dolly = this._dollyDepth <= 1e-9 ? 1 : T / this._dollyDepth;
          if (Math.abs(this._dolly - 1) < 1e-4) this._dolly = 1;
        }
      } else {
        this._dollyDepth = null;
        this._dollyTargetId = null;
      }
    }

    this.compute(env);
  }

  compute(env) {
    const f = env.get(this.focusId);
    const fq = this.frameQuat(f); // 体固（默认）或惯性锚定系（R9-1e）
    // 锚定系球坐标 → 世界（环绕中心 = 天体中心 + 平移偏置）
    const cl = Math.cos(this.lat);
    _v1.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon))
      .applyQuaternion(fq);
    let ox = 0, oy = 0, oz = 0;
    if (this.panOffset.lengthSq() > 0) {
      _v3.copy(this.panOffset).applyQuaternion(fq);
      ox = _v3.x; oy = _v3.y; oz = _v3.z;
    }
    this.posKm[0] = f.posKm[0] + ox + _v1.x * this.dist;
    this.posKm[1] = f.posKm[1] + oy + _v1.y * this.dist;
    this.posKm[2] = f.posKm[2] + oz + _v1.z * this.dist;
    // 平移后防止相机进入天体内部：径向推出
    const dcx = this.posKm[0] - f.posKm[0], dcy = this.posKm[1] - f.posKm[1], dcz = this.posKm[2] - f.posKm[2];
    const dc = Math.hypot(dcx, dcy, dcz);
    const minD = this.minDist(f);
    if (dc < minD && dc > 0) {
      const push = minD / dc;
      this.posKm[0] = f.posKm[0] + dcx * push;
      this.posKm[1] = f.posKm[1] + dcy * push;
      this.posKm[2] = f.posKm[2] + dcz * push;
    }
    // 朝向：看向天体中心；上方向 = 锚定系北极绕径向转 heading（GE 航向）
    _v2.set(0, 1, 0).applyQuaternion(fq);
    if (this.heading !== 0) _v2.applyAxisAngle(_v1, this.heading);
    _v3.copy(_v1).negate(); // 视线
    _m.lookAt(new THREE.Vector3(), _v3, _v2);
    this.quat.setFromRotationMatrix(_m);
    // 倾斜：用户 tilt + 近地自动倾斜（俯视→近地平连续过渡，R7 #1），绕相机本地 X 轴
    this._autoTilt = this.autoTiltOf(f, Math.max(this.dist - this.groundRadiusOf(f), 0));
    const tiltTotal = this.tilt + this._autoTilt;
    if (tiltTotal !== 0) {
      _q.set(Math.sin(tiltTotal / 2), 0, 0, Math.cos(tiltTotal / 2));
      this.quat.multiply(_q);
    }
  }

  updateFlight(dt, env) {
    const fl = this.flight;
    fl.t = Math.min(1, (performance.now() - fl.start) / 1000 / fl.dur);
    const s = smoother(fl.t);
    const from = env.get(fl.fromId);
    const to = env.get(fl.toId);

    // 路径中心（双精度逐分量插值，目标实时移动也精确）
    const cx = from.posKm[0] + (to.posKm[0] - from.posKm[0]) * s;
    const cy = from.posKm[1] + (to.posKm[1] - from.posKm[1]) * s;
    const cz = from.posKm[2] + (to.posKm[2] - from.posKm[2]) * s;
    const sep = Math.hypot(
      to.posKm[0] - from.posKm[0], to.posKm[1] - from.posKm[1], to.posKm[2] - from.posKm[2]
    );

    // GE 签名高度剖面：对数插值 + 正弦弧线
    const h = Math.exp(Math.log(fl.h0) * (1 - s) + Math.log(fl.h1) * s) +
      Math.sin(Math.PI * s) * sep * 0.22;

    // 离面方向插值
    _v1.copy(fl.dir0).lerp(fl.dir1, s).normalize();
    this.posKm[0] = cx + _v1.x * h;
    this.posKm[1] = cy + _v1.y * h;
    this.posKm[2] = cz + _v1.z * h;

    // 视线：前 60% 内逐渐锁定目标，之后目标恒居中
    const sLook = smoother(Math.min(1, fl.t / 0.6));
    const lx = cx + (to.posKm[0] - cx) * sLook;
    const ly = cy + (to.posKm[1] - cy) * sLook;
    const lz = cz + (to.posKm[2] - cz) * sLook;
    _v3.set(lx - this.posKm[0], ly - this.posKm[1], lz - this.posKm[2]).normalize();
    // 上方向：世界北 → 目标天体北
    _v2.set(0, 1, 0).lerp(_v1.set(0, 1, 0).applyQuaternion(to.quat), s).normalize();
    _m.lookAt(new THREE.Vector3(), _v3, _v2);
    this.quat.setFromRotationMatrix(_m);

    if (fl.t >= 1) {
      // 到达：转入环绕，参数自当前位置反解
      this.flight = null;
      this.adoptPosition(env, fl.toId, this.posKm);
      this.distTarget = this.dist;
    }
  }
}
