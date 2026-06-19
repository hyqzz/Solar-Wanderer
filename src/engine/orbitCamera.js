// Google Earth 式探索相机，扩展到整个日球层：
// - 相机锚定在焦点天体的体固系（纬度/经度/距离），随天体公转与自转——如同 GE 锚定地表经纬
// - 左键拖拽旋转（带惯性衰减）、滚轮指数缩放、北极朝上、焦点恒居屏幕中央
// - flyTo：GE 签名式飞行动画——对数高度剖面 + 正弦弧线拉升 + 视线提前锁定，
//   到达时停于目标日照面上空，目标居中

import * as THREE from 'three';
import { IS_MOBILE } from './quality.js';

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
// 远离上限：扩展到 100000 AU（奥尔特云外边界），1 ly ≈ 63241 AU（R11 范围扩展）
const MAX_DIST = 1.5e13;

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class OrbitCamera {
  constructor(camera = null) {
    this.camera = camera;
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
    this._radialGesture = false; // 当前滚轮手势是否已锁定为径向缩放（防 mid-gesture 切 dolly）
    this.inertial = false; // 惯性观察模式：相机不随天体自转——观赏卫星/行星绕转（R9-1e）
    this._streak = 0;      // 滚轮连滚加速度（轻拨精细 → 连滚加速，R9-1c）
    this._streakIdle = 0;
    this._zoomHold = 0;    // PageUp/Down 按住渐加速
    this._navHold = 0;     // 键盘平移/旋转按住渐加速（R10：所有操作低→高灵敏度）
    this.pendingFocusId = null; // 点击目标后延迟到滚动时才切换的焦点（R10-fix-3）
    this.pendingTargetLocal = null; // 目标本地偏移（可选，用于精确瞄准表面点击点）
    this.transition = null; // 焦点切换过渡状态
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

  /** env.get(id) -> { posKm:Float64Array, radiusKm, ringsOuterKm?, quat:THREE.Quaternion(体固→世界), viewDist? } */
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
    this._radialGesture = false;
    this.pendingFocusId = null;
    this.pendingTargetLocal = null;
    this.transition = null;
    if (quat) this.adoptOrientation(f, _v2, quat);
  }

  /** 记录当前完整状态，供焦点过渡时临时计算目标后恢复 */
  _snapshot() {
    return {
      focusId: this.focusId,
      lat: this.lat, lon: this.lon, dist: this.dist, distTarget: this.distTarget,
      heading: this.heading, tilt: this.tilt,
      panOffset: this.panOffset.clone(),
      vLat: this.vLat, vLon: this.vLon,
      inertial: this.inertial,
      _dolly: this._dolly, _dollyDepth: this._dollyDepth,
      _dollyTargetId: this._dollyTargetId, _radialGesture: this._radialGesture,
    };
  }
  _restore(s) {
    this.focusId = s.focusId;
    this.lat = s.lat; this.lon = s.lon;
    this.dist = s.dist; this.distTarget = s.distTarget;
    this.heading = s.heading; this.tilt = s.tilt;
    this.panOffset.copy(s.panOffset);
    this.vLat = s.vLat; this.vLon = s.vLon;
    this.inertial = s.inertial;
    this._dolly = s._dolly; this._dollyDepth = s._dollyDepth;
    this._dollyTargetId = s._dollyTargetId; this._radialGesture = s._radialGesture;
  }

  /** 设置延迟焦点：点击目标后先不切换，等滚动时再平滑过渡
   * @param targetLocalDir 目标体固系中的方向（可选，点击表面时精确瞄准该点）
   * @param targetLocalDist 该方向上的距离（通常为半径）
   */
  setPendingFocus(id, targetLocalDir = null, targetLocalDist = 0) {
    this.pendingFocusId = id;
    this.pendingTargetLocal = targetLocalDir
      ? { dir: targetLocalDir.clone().normalize(), dist: targetLocalDist }
      : null;
  }

  /** 启动焦点过渡：记录当前位姿并计算目标初始距离 */
  _startTransition(env) {
    if (!this.pendingFocusId || this.pendingFocusId === this.focusId) {
      this.transition = null;
      return;
    }
    const toId = this.pendingFocusId;
    const snap = this._snapshot();
    this.adoptPosition(env, toId, this.posKm, this.quat);
    const targetDist = this.dist;
    this._restore(snap);
    this.transition = {
      toId,
      fromPos: Float64Array.from(this.posKm),
      fromQuat: this.quat.clone(),
      targetDist,
      targetLocal: this.pendingTargetLocal
        ? { dir: this.pendingTargetLocal.dir.clone(), dist: this.pendingTargetLocal.dist }
        : null,
      t: 0,
      faceT: 0, // 独立朝向进度：滚动后平滑转向目标，与位置进度解耦
    };
  }

  /** 更新焦点过渡：输入驱动，滚轮/PageUpDown 同时推进过渡并改变目标距离。
   * 关键：相机位姿由目标世界点实时 lookAt 计算，确保目标始终被移动到屏幕中心
   * 并随接近/远离保持居中；过程中停止输入即暂停，可点击其他目标重新定位。 */
  _updateTransition(dt, input, env) {
    const tr = this.transition;
    const toF = env.get(tr.toId);

    // 实时目标世界位置（中心 + 可选表面点击点，随天体自转/公转更新）
    _v1.set(toF.posKm[0], toF.posKm[1], toF.posKm[2]);
    if (tr.targetLocal) {
      _v2.copy(tr.targetLocal.dir).applyQuaternion(toF.quat).multiplyScalar(tr.targetLocal.dist);
      _v1.add(_v2);
    }
    const targetWorldPos = _v1; // alias

    // ---- 缩放输入（与正常轨道模式同参数）----
    let zoomK = 0;
    if (input.down('PageUp') || input.down('Equal') || input.down('NumpadAdd')) zoomK -= 1;
    if (input.down('PageDown') || input.down('Minus') || input.down('NumpadSubtract')) zoomK += 1;

    if (input.wheel !== 0) {
      this._streak = Math.min(this._streak + Math.abs(input.wheel) * 0.18, 1);
      this._streakIdle = 0;
    } else {
      this._streakIdle += dt;
      if (this._streakIdle > 0.35) this._streak = Math.max(this._streak - dt * 2, 0);
    }
    this._zoomHold = zoomK !== 0 ? Math.min(this._zoomHold + dt, 2.5) : 0;

    const zoomActive = input.wheel !== 0 || zoomK !== 0;
    if (zoomActive) {
      let zoomMul = 1;
      if (zoomK !== 0) zoomMul *= Math.exp(zoomK * (0.55 + this._zoomHold * 0.65) * dt);
      if (input.wheel !== 0) {
        zoomMul *= Math.pow(1.12 + 0.26 * this._streak, THREE.MathUtils.clamp(input.wheel, -3, 3));
      }
      tr.targetDist *= zoomMul;
      // 下限用目标半径做安全距离（过渡期间不查询地形，避免 lat/lon 未就绪）
      const minD = toF.minDistKm ?? toF.radiusKm * 1.004 + 1;
      tr.targetDist = THREE.MathUtils.clamp(tr.targetDist, minD, MAX_DIST);
      // 过渡进度由缩放方向驱动：滚轮下/PageDown = 接近（t↑），滚轮上/PageUp = 远离（t↓）
      const advance = Math.abs(input.wheel) * 0.12 + Math.abs(zoomK) * dt * 0.9;
      const dir = (input.wheel < 0 || zoomK < 0) ? 1 : -1;
      tr.t = THREE.MathUtils.clamp(tr.t + dir * advance, 0, 1);
      // 朝向目标独立推进：滚动后 0.35s 内平滑转向目标
      tr.faceT = Math.min(1, tr.faceT + dt / 0.35);
    }
    // 一旦开始接近，即使停止滚动也让朝向继续收敛到目标，避免停在不朝向目标的状态
    if (tr.t > 0 && tr.faceT < 1) {
      tr.faceT = Math.min(1, tr.faceT + dt / 0.35);
    }

    const u = smoother(tr.t);
    const uLook = smoother(tr.faceT);

    // 从目标中心指向初始相机位置的方向（不变路径方向，保证路径可预测）
    _v2.set(tr.fromPos[0] - toF.posKm[0], tr.fromPos[1] - toF.posKm[1], tr.fromPos[2] - toF.posKm[2]);
    const startDist = _v2.length();
    if (startDist > 1e-9) _v2.normalize(); else _v2.set(0, 0, 1);

    // 目标到达位置：沿同一方向、按当前 targetDist 定位
    _v3.copy(targetWorldPos).addScaledVector(_v2, tr.targetDist);

    // 当前位置插值
    this.posKm[0] = tr.fromPos[0] + (_v3.x - tr.fromPos[0]) * u;
    this.posKm[1] = tr.fromPos[1] + (_v3.y - tr.fromPos[1]) * u;
    this.posKm[2] = tr.fromPos[2] + (_v3.z - tr.fromPos[2]) * u;

    // 上方向：从初始上方向平滑过渡到目标天体北极（用 uLook 同步）
    _va.set(0, 1, 0).applyQuaternion(tr.fromQuat);
    _vm.set(0, 1, 0).applyQuaternion(this.frameQuat(toF));
    const upX = _va.x + (_vm.x - _va.x) * uLook;
    const upY = _va.y + (_vm.y - _va.y) * uLook;
    const upZ = _va.z + (_vm.z - _va.z) * uLook;
    const upLen = Math.hypot(upX, upY, upZ) || 1;

    // 移除未使用的 lookAt 插值变量；直接由当前位置看向目标世界点
    // 朝向：直接 slerp 到“从当前位置看向目标世界点”的四元数，确保目标始终在向心
    // 方向移动并被尽快居中；比插值 lookAt 点更稳定，尤其当初始视线与目标方向大角分离时。
    _m.lookAt(
      new THREE.Vector3(this.posKm[0], this.posKm[1], this.posKm[2]),
      targetWorldPos,
      new THREE.Vector3(upX / upLen, upY / upLen, upZ / upLen)
    );
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(_m);
    this.quat.slerpQuaternions(tr.fromQuat, targetQuat, uLook);

    if (tr.t >= 1 && tr.faceT >= 0.99) {
      // 过渡完成：提交新焦点并恢复一致的轨道参数
      this.focusId = tr.toId;
      this.adoptPosition(env, tr.toId, this.posKm, this.quat);
      this.pendingFocusId = null;
      this.pendingTargetLocal = null;
      this.transition = null;
    }
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
    // 有效半径：行星本体或环系外缘（土星、天王星），确保 Go/飞抵时整个天体入画
    const r = Math.max(t.radiusKm, t.ringsOuterKm ?? 0);
    // 桌面保持原有 3.5 倍半径行为；移动版按当前视口 FOV/宽高比计算安全距离
    const fallback = Math.max(t.radiusKm * 3.5, 3);
    if (!IS_MOBILE || !this.camera) return fallback;
    const vFOV = this.camera.fov * DEG;
    const aspect = this.camera.aspect;
    const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * aspect);
    const limiting = Math.min(vFOV, hFOV);
    const margin = 1.18; // 18% 边距，避免贴边或被 UI 遮挡
    const distFit = (r * margin) / Math.tan(limiting / 2);
    return Math.max(distFit, fallback);
  }

  /** GE 式飞行动画启动（fromIdOverride 用于从上一焦点起飞，如标签双击） */
  flyTo(env, toId, fromIdOverride = null) {
    this.pendingFocusId = null;
    this.pendingTargetLocal = null;
    this.transition = null;
    const to = env.get(toId);
    const from = env.get(fromIdOverride ?? this.focusId);
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
    this.flight = { toId, fromId: fromIdOverride ?? this.focusId, t: 0, dur, h0, h1, dir0, dir1, start: performance.now() };
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
    // 延迟焦点：点击目标后先不动，滚动/PageUpDown 才平滑切换焦点（R10-fix-3）
    if (this.pendingFocusId && this.pendingFocusId !== this.focusId) {
      if (!this.transition || this.transition.toId !== this.pendingFocusId) {
        this._startTransition(env);
      }
    }
    if (this.transition) {
      this._updateTransition(dt, input, env);
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
      // 平移开始时提交残余 dolly（否则 dolly 继续写入 panOffset，与平移叠加导致镜头跳回）
      if (Math.abs(this._dolly - 1) > 1e-4) {
        this._dolly = 1;
        this._dollyDepth = null;
        this._dollyTargetId = null;
      }
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
    // 移动版近地表下限适度提高：完全贴地时若下限过低，单指拖动几乎无响应，
    // 会被误认为"操控失效"；同时仍保持明显低于高空的灵敏度。
    let sensMin = 2e-6;
    if (IS_MOBILE && alt < f.radiusKm * 0.5) sensMin = 1.2e-5;
    const sens = THREE.MathUtils.clamp(0.00123 * alt / f.radiusKm, sensMin, 0.0052);
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

    // 决定采用径向缩放还是视线推拉（dolly）：
    // - 有平移：径向缩放（保持 panOffset / look-at 点固定，不会甩回焦点方向）。
    // - 无平移且用户未倾斜：径向缩放（经典轨道 + 着陆语义）。
    // - 无平移但用户倾斜：只有实际视线仍指向径向时才用径向缩放；否则用 dolly。
    // 旧实现把"有 panOffset"一律判为 offAxis 并走 dolly，dolly 在视线径向时
    // 会改写 panOffset，导致右键平移后滚轮缩放 look-at 点甩回焦点方向
    //（用户反馈"跳回原空间"）。
    const cl = Math.cos(this.lat);
    _v3.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon))
      .applyQuaternion(this.frameQuat(f)); // 焦点径向（世界）
    _va.set(0, 0, -1).applyQuaternion(this.quat); // 当前视线方向（世界）
    const viewRadial = Math.abs(_va.dot(_v3) + 1) < 0.03; // 视线 ≈ −径向
    // 判断平移是否以"横向环绕"为主（垂直于径向）：典型右键拖拽都是这种，
    // 径向缩放可保持 look-at 点固定；若平移带明显径向分量，则走 dolly。
    const panLen = this.panOffset.length();
    _vm.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon));
    const panDotRadial = panLen > 0 ? this.panOffset.dot(_vm) : 0;
    const panMostlyPerp = panLen > 0 && Math.abs(panDotRadial) < panLen * 0.25;
    // 手势锁定：已经开始的 dolly（_dolly ≠ 1）必须继续走 dolly；已经开始的径向手势
    //（_radialGesture）必须继续走径向，否则近地 auto-tilt 使 viewRadial 变假后会
    // 中途中断切 dolly，导致 look-at 点甩回焦点方向。新手势则按状态选择：
    // - 无平移且用户未倾斜：径向缩放（经典轨道 + 着陆/起飞语义，auto-tilt 由表示层处理）。
    // - 有横向平移且视线仍径向：径向缩放（保持 look-at 点不甩回焦点方向）。
    // - 否则：dolly（倾斜或平移带径向分量导致视线偏离径向时，沿视线推拉保持屏幕中心目标居中）。
    const zoomActive = input.wheel !== 0 || zoomK !== 0;
    const inDollyGesture = Math.abs(this._dolly - 1) > 1e-5;
    // 径向缩放判定：
    // - 无平移且用户未倾斜：经典轨道 / 着陆 / 起飞语义（auto-tilt 由表示层处理）。
    // - 无平移但视线仍指向径向：显式点击切换焦点后可能保留 tilt 补偿，此时仍应以
    //   焦点为中心进行远离/接近，而不是进入 dolly 导致目标偏移。
    // - 有横向平移且视线仍径向：保持 look-at 点不甩回焦点方向。
    // - 移动版纯双指缩放：强制走径向。触控近地表时 auto-tilt 使视线偏离径向，
    //   若按桌面规则进入 dolly，屏幕中心常指向太空或地形深度极小，导致"双指
    //   拉远"几乎没有可见效果（与桌面滚轮可用手感不一致）。
    const mobilePinchRadial = IS_MOBILE && zoomActive &&
      input.pan.dx === 0 && input.pan.dy === 0 && this.panOffset.lengthSq() === 0;
    const shouldBeRadial = (this.panOffset.lengthSq() === 0 &&
      (Math.abs(this.tilt) <= 0.02 || viewRadial || mobilePinchRadial)) ||
      (panMostlyPerp && viewRadial);
    const canStartRadial = zoomActive && !inDollyGesture && !this._radialGesture && shouldBeRadial;
    // 外部设置 distTarget 后（如起飞/返回探索的抬升），即使没有缩放输入也要平滑过渡到目标
    const needsRadialSmooth = !inDollyGesture && !this._radialGesture &&
      Math.abs(this.dist - this.distTarget) > 1e-6 && shouldBeRadial;
    if (canStartRadial) this._radialGesture = true;
    const useRadial = this._radialGesture || canStartRadial || needsRadialSmooth;
    if (useRadial) {
      this._dolly = 1;
      this._dollyTargetId = null;
      const minD = this.minDist(f);
      const base = minD - 0.002; // 基准 = 下限略下方（贴地时高度步长 ≥ 2m 起步）
      const a = Math.max(this.distTarget - base, 0.0008);
      let target = base + a * zoomMul;
      // 移动版：近距离 zoom out（远离）时原公式几乎拉不动相机，导致地表附近
      // 双指远离"操控不生效"。保证每次 zoom out 至少远离 2% 半径，提供与
      // 桌面版滚轮相当的可用拉远手感，同时 zoom in 仍保持精细着陆控制。
      if (IS_MOBILE && zoomMul > 1 && this.distTarget < minD * 1.5) {
        target = Math.max(target, this.distTarget + f.radiusKm * 0.02);
      }
      this.distTarget = THREE.MathUtils.clamp(target, minD, MAX_DIST);
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

    // 缩放手势结束：连续 0.35s 没有任何缩放输入且不在 dolly 中时，才清空径向手势标记。
    // 这样滚轮连续多格之间（包括每格之间的短暂停顿）不会误判为新手势，避免
    // mid-gesture 从径向切到 dolly 导致 look-at 点漂移。
    if (input.wheel === 0 && zoomK === 0 && Math.abs(this._dolly - 1) < 1e-4 && this._streakIdle > 0.35) {
      this._radialGesture = false;
      this._dollyDepth = null;
      this._dollyTargetId = null;
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
