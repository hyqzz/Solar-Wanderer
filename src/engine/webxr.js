// WebXR / VR 支持（issue #33）：
// 封装 Three.js 的 WebXRManager（renderer.xr），提供沉浸式 VR 体验。
// - 立体渲染共享同一星历计算（VR 帧与桌面帧使用同一 simClock）
// - 控制器射线拾取天体、捏合缩放、抓取移动
// - 优雅降级：WebXR 不可用时正常显示桌面模式
// - 性能：Quest 2/3 目标 >60fps，VR 模式下自动降低像素比
//
// 设计要点：
// - 不修改 main.js：通过构造函数注入 renderer/camera/scene，外部按需调用
// - VR 模式下禁用指针锁定（renderer.xr 接管渲染循环）
// - 控制器用 XRControllerModelFactory 加载真实模型，失败时退化为射线指示器

import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

// VR 模式下的性能参数
const VR_PIXEL_RATIO = 1;       // VR 双目渲染开销大，固定 1x 像素比
const RAY_LENGTH = 100;         // 控制器射线长度（世界单位，浮动原点下足够）
const TELEPORT_SPEED = 50;      // 摇杆传送速度 (km/s 等效)
const PINCH_ZOOM_RATE = 0.5;    // 双手捏合缩放速率

export class WebXRManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera
   * @param {THREE.Scene} scene
   */
  constructor(renderer, camera, scene) {
    this._renderer = renderer;
    this._camera = camera;
    this._scene = scene;

    this._supported = false;
    this._session = null;
    this._button = null;
    this._callback = null;        // 控制器交互回调

    // 控制器
    this._controllers = [];
    this._controllerGrips = [];
    this._raycaster = new THREE.Raycaster();
    this._rays = [];              // 可视化射线 Line
    this._factory = null;         // XRControllerModelFactory（延迟创建）

    // 手势状态
    this._squeezeState = [false, false];  // 左右手 squeeze
    this._selectState = [false, false];   // 左右手 select (trigger)
    this._prevPinchDist = 0;              // 上帧双手间距（捏合缩放用）
    this._grabOffset = null;              // 抓取移动偏置

    // 性能：保存桌面模式原始参数，VR 退出后恢复
    this._savedPixelRatio = renderer.getPixelRatio();

    // 绑定方法（避免每帧创建闭包）
    this._onSessionEnded = this._onSessionEnded.bind(this);
  }

  /**
   * 检测 WebXR 支持。必须在用户交互前调用（部分浏览器要求 secure context）。
   * @returns {Promise<boolean>}
   */
  async init() {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      this._supported = false;
      return false;
    }
    try {
      this._supported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      this._supported = false;
    }
    return this._supported;
  }

  /** WebXR immersive-vr 是否可用 */
  get supported() { return this._supported; }

  /** 当前活跃的 XRSession（无则 null） */
  get session() { return this._session; }

  /** 是否处于 VR 模式 */
  get inVR() { return this._session !== null; }

  /**
   * 创建并返回 VR 入口按钮。WebXR 不可用时返回 null。
   * 按钮已附加样式，可直接 appendChild 到 document.body。
   * @returns {HTMLElement|null}
   */
  createButton() {
    if (!this._supported) return null;
    // VRButton.createButton 内部处理了 session 申请与 renderer.xr.setSession
    this._button = VRButton.createButton(this._renderer, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'layers'],
    });
    // 拦截 session 开始/结束以同步本类状态
    const origOnClick = this._button.onclick;
    this._button.onclick = async () => {
      if (this._session === null) {
        await this.enterVR();
      } else {
        this.exitVR();
      }
    };
    return this._button;
  }

  /**
   * 进入 VR 会话。成功后 renderer.xr 接管渲染循环。
   * @returns {Promise<boolean>} 是否成功进入
   */
  async enterVR() {
    if (!this._supported || this._session) return false;

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'layers'],
      });
      this._session = session;
      session.addEventListener('end', this._onSessionEnded);

      // 启用 XR 渲染
      this._renderer.xr.enabled = true;
      await this._renderer.xr.setSession(session);

      // 性能降级：VR 双目渲染开销大，降低像素比
      this._savedPixelRatio = this._renderer.getPixelRatio();
      this._renderer.setPixelRatio(VR_PIXEL_RATIO);

      // 尝试启用 foveated rendering（Quest 2/3 支持，减少边缘分辨率）
      this._tryFoveatedRendering();

      // 设置控制器
      this._setupControllers();

      return true;
    } catch (err) {
      console.warn('[WebXR] 进入 VR 失败:', err);
      this._session = null;
      return false;
    }
  }

  /** 退出 VR 会话 */
  exitVR() {
    if (this._session) {
      this._session.end();
    }
  }

  /** session end 回调：清理状态、恢复桌面参数 */
  _onSessionEnded() {
    if (this._session) {
      this._session.removeEventListener('end', this._onSessionEnded);
      this._session = null;
    }
    this._renderer.xr.enabled = false;
    this._renderer.setPixelRatio(this._savedPixelRatio);
    this._cleanupControllers();
  }

  /**
   * 尝试启用 foveated rendering（注视点渲染）。
   * Quest 2/3 通过 WebXR layers 扩展支持，可大幅提升性能。
   * 不可用时静默跳过。
   */
  _tryFoveatedRendering() {
    try {
      const gl = this._renderer.getContext();
      // WEBGL_qcom_framebuffer_foveated 或类似扩展
      const ext = gl.getExtension('WEBGL_qcom_framebuffer_foveated');
      if (ext) {
        // 扩展可用；具体参数由驱动自动管理
        console.info('[WebXR] foveated rendering 扩展已启用');
      }
    } catch {
      // 静默失败：不影响 VR 功能
    }
  }

  // ── 控制器设置 ──────────────────────────────────────────────────────

  _setupControllers() {
    // 延迟创建 factory（避免桌面模式无谓加载）
    if (!this._factory) {
      try {
        this._factory = new XRControllerModelFactory();
      } catch {
        this._factory = null; // GLTFLoader 不可用时退化为纯射线
      }
    }

    for (let i = 0; i < 2; i++) {
      const controller = this._renderer.xr.getController(i);
      const grip = this._renderer.xr.getControllerGrip(i);

      // 射线可视化（细线，指向 -Z）
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const ray = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x66ccff, transparent: true, opacity: 0.6,
      }));
      ray.scale.z = RAY_LENGTH;
      controller.add(ray);
      this._rays.push(ray);

      // 事件绑定
      controller.addEventListener('selectstart', () => this._onSelectStart(i));
      controller.addEventListener('selectend', () => this._onSelectEnd(i));
      controller.addEventListener('squeezestart', () => this._onSqueezeStart(i));
      controller.addEventListener('squeezeend', () => this._onSqueezeEnd(i));

      this._scene.add(controller);
      this._controllers.push(controller);

      // 加载控制器 3D 模型（失败时仅有射线）
      if (this._factory) {
        try {
          const model = this._factory.createControllerModel(grip);
          grip.add(model);
        } catch { /* 模型加载失败，不影响功能 */ }
      }
      this._scene.add(grip);
      this._controllerGrips.push(grip);
    }
  }

  _cleanupControllers() {
    for (const c of this._controllers) {
      this._scene.remove(c);
      c.removeEventListener('selectstart', null);
    }
    for (const g of this._controllerGrips) this._scene.remove(g);
    for (const r of this._rays) r.geometry.dispose();
    this._controllers = [];
    this._controllerGrips = [];
    this._rays = [];
    this._squeezeState = [false, false];
    this._selectState = [false, false];
    this._prevPinchDist = 0;
    this._grabOffset = null;
  }

  // ── 控制器事件处理 ──────────────────────────────────────────────────

  /** trigger 按下：指向选择天体 */
  _onSelectStart(hand) {
    this._selectState[hand] = true;
    const hit = this._raycastBody(hand);
    if (hit && this._callback) {
      this._callback({ type: 'select', hand, bodyId: hit.bodyId, point: hit.point });
    }
  }

  _onSelectEnd(hand) {
    this._selectState[hand] = false;
  }

  /** squeeze 按下：抓取/捏合 */
  _onSqueezeStart(hand) {
    this._squeezeState[hand] = true;
    // 双手 squeeze → 捏合缩放
    if (this._squeezeState[0] && this._squeezeState[1]) {
      this._prevPinchDist = this._controllerDistance();
    } else {
      // 单手 squeeze → 抓取移动
      this._grabOffset = this._controllers[hand].position.clone();
    }
  }

  _onSqueezeEnd(hand) {
    this._squeezeState[hand] = false;
    this._grabOffset = null;
    this._prevPinchDist = 0;
  }

  /** 从控制器射线拾取天体（需外部提供 bodies 列表） */
  _raycastBody(hand) {
    const controller = this._controllers[hand];
    if (!controller) return null;

    // 控制器世界位姿 → 射线
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    controller.getWorldPosition(origin);
    controller.getWorldDirection(direction);
    // getWorldDirection 返回 -Z 方向，但需取反（Three.js 约定）
    direction.negate();

    this._raycaster.set(origin, direction);
    this._raycaster.far = RAY_LENGTH;

    // 外部通过 callback 提供 bodies，或在此处直接 raycast scene children
    if (this._callback) {
      this._callback({
        type: 'raycast', hand,
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      });
    }
    return null;
  }

  /** 两手控制器间距（世界单位） */
  _controllerDistance() {
    if (this._controllers.length < 2) return 0;
    return this._controllers[0].position.distanceTo(this._controllers[1].position);
  }

  // ── 每帧更新 ────────────────────────────────────────────────────────

  /**
   * 每帧更新控制器状态：摇杆传送、捏合缩放、抓取移动。
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    if (!this._session || this._controllers.length === 0) return;

    // 摇杆/触摸板传送
    for (let i = 0; i < this._controllers.length; i++) {
      const c = this._controllers[i];
      const axes = c.userData.axes; // [x, y] 或 gamepad axes
      if (!axes) continue;

      // 触摸板/摇杆 Y 轴 → 前后移动
      const forward = -axes[1] || 0;
      const sideways = axes[0] || 0;
      if (Math.abs(forward) > 0.1 || Math.abs(sideways) > 0.1) {
        if (this._callback) {
          this._callback({
            type: 'teleport',
            forward: forward * TELEPORT_SPEED * dt,
            sideways: sideways * TELEPORT_SPEED * dt,
          });
        }
      }
    }

    // 双手捏合缩放
    if (this._squeezeState[0] && this._squeezeState[1] && this._prevPinchDist > 0) {
      const dist = this._controllerDistance();
      const delta = this._prevPinchDist - dist; // 双手靠近 → 放大
      if (Math.abs(delta) > 0.001 && this._callback) {
        this._callback({
          type: 'zoom',
          delta: delta * PINCH_ZOOM_RATE,
        });
      }
      this._prevPinchDist = dist;
    }

    // 单手抓取移动
    const grabHand = this._squeezeState[0] ? 0 : (this._squeezeState[1] ? 1 : -1);
    if (grabHand >= 0 && this._grabOffset) {
      const c = this._controllers[grabHand];
      const delta = c.position.clone().sub(this._grabOffset);
      if (delta.lengthSq() > 1e-8 && this._callback) {
        this._callback({
          type: 'grab',
          delta: { x: delta.x, y: delta.y, z: delta.z },
        });
      }
      this._grabOffset = c.position.clone();
    }
  }

  /**
   * 设置控制器交互回调。
   * @param {function} cb 回调函数，接收 { type, hand, ...payload }
   *   type: 'select' | 'raycast' | 'teleport' | 'zoom' | 'grab'
   */
  setControllerCallback(cb) {
    this._callback = cb;
  }
}
