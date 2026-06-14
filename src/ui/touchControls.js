// 移动端屏显控制层（M1）
// 仅在触摸设备上激活（IS_MOBILE）。
// 职责：
//   - 缩放 +/- 按钮（持续按住累加 input.wheel）
//   - 虚拟摇杆（行走/飞行模式，写入 input.joystick）
//   - 模式感知动作按钮（登陆 G、飞行 F、起飞、返回探索、急停 X…）
//   - 右侧功能按钮（行走：跳跃/奔跑/上升/下潜；飞行：升降/急停）
//   - ☰ 汉堡菜单（时间控制 [ ] P N、显示 O L K H）
//   - 🪐 / 🎯 抽屉按钮（切换 #directory 与 #hud-target 可见性）
//
// 所有动作均通过 input.justPressed / input.joystick / input.touch* 字段与既有逻辑衔接，
// 无需修改 orbitCamera / ship 核心代码。

import { t } from './i18n.js';

export class TouchControls {
  /**
   * @param {import('../engine/ship.js').Input} input
   * @param {object} callbacks
   *   switchToOrbit() switchToFly() toggleOrbits() warpUp() warpDown()
   *   getSelectedId()→string|null  getMode()→string  getNearest()→object|null
   *   getOrbitCam()→object
   */
  constructor(input, callbacks) {
    this.input = input;
    this.cb    = callbacks;

    // Held-zoom direction: -1=in, +1=out, 0=none
    this._zoomDir = 0;

    // Joystick state
    this._jsPointerId = null;
    this._jsOrigin    = null;
    this._jsRadius    = 42; // px

    // Button hold states for right-panel
    this._ascendHeld  = false;
    this._descendHeld = false;
    this._sprintHeld  = false;

    // Drawer visibility
    this._dirOpen = false; // mirrored from #directory.open
    this._tgtOpen = false;

    this._menuOpen = false;

    this._build();
  }

  // ── DOM construction ────────────────────────────────────────────────────
  _build() {
    const root = this._el('div', { id: 'tc-root' });
    document.body.appendChild(root);
    this.root = root;

    this._buildBackdrop();
    // Top-left: hamburger menu
    this._buildMenu(root);

    // Bottom bar: zoom | actions | drawers
    this._buildBottomBar(root);

    // Virtual joystick (walk/fly only)
    this._buildJoystick(root);

    // Right-side buttons (walk/fly only)
    this._buildRightBtns(root);

    // Init directory state to match .open class
    this._dirOpen = document.getElementById('directory')?.classList.contains('open') ?? false;
    this._updateDrawerBtnState();
  }

  _el(tag, attrs = {}, text = '') {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el[k] = v;
    if (text) el.textContent = text;
    return el;
  }

  _btn(label, id, extraClass = '') {
    const b = this._el('button', { id, className: `tc-btn ${extraClass}`.trim() });
    b.textContent = label;
    return b;
  }

  _buildMenu(root) {
    const bar = this._el('div', { id: 'tc-top-bar' });
    root.appendChild(bar);

    const menuBtn = this._btn(t('tc.menu'), 'tc-menu-btn');
    bar.appendChild(menuBtn);

    const menu = this._el('div', { id: 'tc-menu' });
    menu.hidden = true;
    bar.appendChild(menu);

    // Time section
    const timeLabel = this._el('div', { className: 'tc-section-label' });
    timeLabel.textContent = t('tc.timeTitle');
    menu.appendChild(timeLabel);

    const timeRow = this._el('div', { className: 'tc-row' });
    menu.appendChild(timeRow);
    timeRow.appendChild(this._btn(t('tc.warpSlow'), 'tc-warp-down'));
    timeRow.appendChild(this._btn(t('tc.warpFast'), 'tc-warp-up'));

    const time2Row = this._el('div', { className: 'tc-row' });
    menu.appendChild(time2Row);
    time2Row.appendChild(this._btn(t('tc.pause'),   'tc-pause'));
    time2Row.appendChild(this._btn(t('tc.now'),     'tc-now'));

    // Display section
    const dispLabel = this._el('div', { className: 'tc-section-label' });
    dispLabel.textContent = t('tc.dispTitle');
    menu.appendChild(dispLabel);

    const dispRow = this._el('div', { className: 'tc-row' });
    menu.appendChild(dispRow);
    dispRow.appendChild(this._btn(t('tc.orbits'),   'tc-orbits'));
    dispRow.appendChild(this._btn(t('tc.labels'),   'tc-labels'));

    const dispRow2 = this._el('div', { className: 'tc-row' });
    menu.appendChild(dispRow2);
    dispRow2.appendChild(this._btn(t('tc.inertial'), 'tc-inertial'));
    dispRow2.appendChild(this._btn(t('tc.help'),     'tc-help'));

    // Wire menu toggle — close drawers when menu opens
    menuBtn.addEventListener('click', () => {
      this._menuOpen = !this._menuOpen;
      menu.hidden = !this._menuOpen;
      if (this._menuOpen) this._closeDrawers(false);
    });

    // Close menu when clicking elsewhere
    document.addEventListener('pointerdown', (e) => {
      if (this._menuOpen && !bar.contains(e.target)) {
        this._menuOpen = false;
        menu.hidden = true;
      }
    }, { capture: true, passive: true });

    // Wire menu buttons
    document.getElementById('tc-warp-up')  .addEventListener('click', () => { this.cb.warpUp?.();   });
    document.getElementById('tc-warp-down').addEventListener('click', () => { this.cb.warpDown?.(); });
    document.getElementById('tc-pause')    .addEventListener('click', () => { this.input.justPressed.add('KeyP'); });
    document.getElementById('tc-now')      .addEventListener('click', () => { this.input.justPressed.add('KeyN'); });
    document.getElementById('tc-orbits')   .addEventListener('click', () => { this.cb.toggleOrbits?.(); });
    document.getElementById('tc-labels')   .addEventListener('click', () => { this.input.justPressed.add('KeyL'); });
    document.getElementById('tc-inertial') .addEventListener('click', () => { this.input.justPressed.add('KeyV'); });
    document.getElementById('tc-help')     .addEventListener('click', () => {
      this.input.justPressed.add('KeyH');
      this._menuOpen = false;
      menu.hidden = true;
    });
  }

  _buildBottomBar(root) {
    const bar = this._el('div', { id: 'tc-bottom-bar' });
    root.appendChild(bar);

    // Zoom group
    const zGroup = this._el('div', { id: 'tc-zoom-group' });
    bar.appendChild(zGroup);

    const zIn  = this._btn(t('tc.zoomIn'),  'tc-zoom-in',  'tc-zoom-btn');
    const zOut = this._btn(t('tc.zoomOut'), 'tc-zoom-out', 'tc-zoom-btn');
    zGroup.appendChild(zIn);
    zGroup.appendChild(zOut);

    this._holdBtn(zIn,  () => { this._zoomDir = -1; }, () => { this._zoomDir = 0; });
    this._holdBtn(zOut, () => { this._zoomDir =  1; }, () => { this._zoomDir = 0; });

    // Dynamic action group (mode-dependent, rebuilt in update)
    const actions = this._el('div', { id: 'tc-actions' });
    bar.appendChild(actions);
    this.actionsEl = actions;

    // Drawer buttons
    const drawers = this._el('div', { id: 'tc-drawer-btns' });
    bar.appendChild(drawers);

    const dirBtn = this._btn(t('tc.dir'),    'tc-dir-btn',  'tc-drawer-btn');
    const tgtBtn = this._btn(t('tc.target'), 'tc-tgt-btn',  'tc-drawer-btn');
    drawers.appendChild(dirBtn);
    drawers.appendChild(tgtBtn);

    dirBtn.addEventListener('click', () => {
      const dir = document.getElementById('directory');
      if (!dir) return;
      this._dirOpen = !this._dirOpen;
      dir.classList.toggle('open', this._dirOpen);
      if (this._dirOpen) {
        // 关闭目标抽屉和菜单
        if (this._tgtOpen) {
          this._tgtOpen = false;
          document.getElementById('hud-target')?.classList.remove('tc-open');
        }
        this._menuOpen = false;
        document.getElementById('tc-menu').hidden = true;
      }
      this._updateBackdrop();
      this._updateDrawerBtnState();
    });

    tgtBtn.addEventListener('click', () => {
      const tgt = document.getElementById('hud-target');
      if (!tgt) return;
      this._tgtOpen = !this._tgtOpen;
      tgt.classList.toggle('tc-open', this._tgtOpen);
      if (this._tgtOpen) {
        // 关闭目录抽屉
        if (this._dirOpen) {
          this._dirOpen = false;
          document.getElementById('directory')?.classList.remove('open');
        }
      }
      this._updateBackdrop();
      this._updateDrawerBtnState();
    });
  }

  _buildJoystick(root) {
    const wrap = this._el('div', { id: 'tc-joystick-wrap' });
    wrap.hidden = true;
    root.appendChild(wrap);
    this.joystickWrap = wrap;

    const base  = this._el('div', { id: 'tc-joystick-base' });
    const thumb = this._el('div', { id: 'tc-joystick-thumb' });
    base.appendChild(thumb);
    wrap.appendChild(base);

    this.jsThumb = thumb;

    base.addEventListener('pointerdown', (e) => {
      if (this._jsPointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      base.setPointerCapture(e.pointerId);
      this._jsPointerId = e.pointerId;
      const rect = base.getBoundingClientRect();
      this._jsOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this._moveJoystick(e.clientX, e.clientY);
    }, { passive: false });

    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._jsPointerId) return;
      e.preventDefault();
      this._moveJoystick(e.clientX, e.clientY);
    }, { passive: false });

    const endJs = (e) => {
      if (e.pointerId !== this._jsPointerId) return;
      this._jsPointerId = null;
      this._jsOrigin    = null;
      this.input.joystick.x = 0;
      this.input.joystick.y = 0;
      thumb.style.transform = 'translate(-50%, -50%)';
    };
    base.addEventListener('pointerup',     endJs);
    base.addEventListener('pointercancel', endJs);
  }

  _moveJoystick(cx, cy) {
    const o  = this._jsOrigin;
    let dx   = cx - o.x;
    let dy   = cy - o.y;
    const d  = Math.hypot(dx, dy);
    const R  = this._jsRadius;
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this.input.joystick.x = dx / R;
    this.input.joystick.y = dy / R;
    this.jsThumb.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }

  _buildRightBtns(root) {
    const wrap = this._el('div', { id: 'tc-right-btns' });
    wrap.hidden = true;
    root.appendChild(wrap);
    this.rightBtns = wrap;

    // Walk buttons
    const walkGroup = this._el('div', { id: 'tc-walk-btns' });
    walkGroup.hidden = true;
    wrap.appendChild(walkGroup);

    const jumpBtn   = this._btn(t('tc.jump'),    'tc-jump',    'tc-right-btn');
    const sprintBtn = this._btn(t('tc.sprint'),  'tc-sprint',  'tc-right-btn');
    const takeoffBtn = this._btn(t('tc.takeoff'),'tc-takeoff', 'tc-right-btn primary');
    walkGroup.appendChild(jumpBtn);
    walkGroup.appendChild(sprintBtn);
    walkGroup.appendChild(takeoffBtn);

    jumpBtn.addEventListener('click', () => { this.input.touchJump = true; });
    this._holdBtn(sprintBtn,  () => { this.input.touchSprint = true;  }, () => { this.input.touchSprint = false; });
    takeoffBtn.addEventListener('click', () => {
      // Trigger takeoff: simulate wheel >= 0.5 (same condition in main.js walk takeoff)
      this.input.wheel += 0.6;
    });

    // Fly buttons
    const flyGroup = this._el('div', { id: 'tc-fly-btns' });
    flyGroup.hidden = true;
    wrap.appendChild(flyGroup);

    const ascBtn  = this._btn(t('tc.ascend'),  'tc-ascend',  'tc-right-btn');
    const descBtn = this._btn(t('tc.descend'), 'tc-descend', 'tc-right-btn');
    const stopBtn = this._btn(t('tc.stop'),    'tc-stop',    'tc-right-btn danger');
    flyGroup.appendChild(ascBtn);
    flyGroup.appendChild(descBtn);
    flyGroup.appendChild(stopBtn);

    this._holdBtn(ascBtn,  () => { this.input.touchAscend = true;  }, () => { this.input.touchAscend = false; });
    this._holdBtn(descBtn, () => { this.input.touchDescend = true; }, () => { this.input.touchDescend = false; });
    stopBtn.addEventListener('click', () => { this.input.justPressed.add('KeyX'); });

    this.walkGroupEl = walkGroup;
    this.flyGroupEl  = flyGroup;
  }

  // Helper: hold-to-repeat pointer button
  _holdBtn(el, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('held');
      onDown();
    }, { passive: false });
    const up = () => { el.classList.remove('held'); onUp(); };
    el.addEventListener('pointerup',     up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave',  up);
  }

  _updateDrawerBtnState() {
    document.getElementById('tc-dir-btn')?.classList.toggle('active', this._dirOpen);
    document.getElementById('tc-tgt-btn')?.classList.toggle('active', this._tgtOpen);
  }

  _buildBackdrop() {
    const bd = this._el('div', { id: 'tc-backdrop' });
    bd.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._closeDrawers();
    }, { passive: false });
    document.body.appendChild(bd);
    this.backdrop = bd;
  }

  // closeMenu=false 时只关闭抽屉，不关闭菜单（菜单打开时用）
  _closeDrawers(closeMenu = true) {
    if (this._dirOpen) {
      this._dirOpen = false;
      document.getElementById('directory')?.classList.remove('open');
    }
    if (this._tgtOpen) {
      this._tgtOpen = false;
      document.getElementById('hud-target')?.classList.remove('tc-open');
    }
    if (closeMenu && this._menuOpen) {
      this._menuOpen = false;
      const menu = document.getElementById('tc-menu');
      if (menu) menu.hidden = true;
    }
    this._updateBackdrop();
    this._updateDrawerBtnState();
  }

  _updateBackdrop() {
    if (this.backdrop) {
      this.backdrop.classList.toggle('visible', this._dirOpen || this._tgtOpen);
    }
  }

  // ── Per-frame update (called from main.js loop) ──────────────────────────
  /**
   * @param {string} mode  'orbit' | 'fly' | 'walk'
   * @param {object|null} nearest  { id, landable, distSurface, radiusKm }
   * @param {object} orbitCam  OrbitCamera instance
   */
  update(mode, nearest, orbitCam) {
    if (!this.root) return;

    // Apply held zoom to input.wheel
    if (this._zoomDir !== 0) {
      this.input.wheel += this._zoomDir * 0.22;
    }

    // Show/hide joystick + right buttons based on mode
    const needJoystick = mode === 'walk' || mode === 'fly';
    if (this.joystickWrap) this.joystickWrap.hidden = !needJoystick;
    if (this.rightBtns)    this.rightBtns.hidden    = !needJoystick;

    if (needJoystick) {
      // Show mode-appropriate right-button group
      if (this.walkGroupEl) this.walkGroupEl.hidden = mode !== 'walk';
      if (this.flyGroupEl)  this.flyGroupEl.hidden  = mode !== 'fly';
    }

    // Clear touch fields when leaving their mode (safety)
    if (mode !== 'walk' && mode !== 'fly') {
      this.input.touchAscend  = false;
      this.input.touchDescend = false;
      this.input.touchSprint  = false;
      this.input.joystick.x   = 0;
      this.input.joystick.y   = 0;
    }

    // Rebuild action buttons only when mode changes
    if (this._lastMode !== mode || this._lastLandable !== (nearest?.landable && nearest.distSurface < Math.max(20, (nearest.radiusKm ?? 0) * 0.05))) {
      this._lastMode     = mode;
      this._lastLandable = nearest?.landable && nearest.distSurface < Math.max(20, (nearest.radiusKm ?? 0) * 0.05);
      this._rebuildActions(mode, nearest);
    }
  }

  _rebuildActions(mode, nearest) {
    const el = this.actionsEl;
    if (!el) return;
    el.innerHTML = '';

    if (mode === 'orbit') {
      // Land button — contextual
      const canLand = nearest?.landable && nearest.distSurface < Math.max(20, (nearest.radiusKm ?? 0) * 0.05);
      if (canLand) {
        const landBtn = this._btn(t('tc.land'), 'tc-land-btn', 'tc-action-btn primary');
        landBtn.addEventListener('click', () => { this.input.justPressed.add('KeyG'); });
        el.appendChild(landBtn);
      }

      // Fly mode button
      const flyBtn = this._btn(t('tc.fly'), 'tc-fly-btn', 'tc-action-btn');
      flyBtn.addEventListener('click', () => { this.cb.switchToFly?.(); });
      el.appendChild(flyBtn);

      // Goto selected
      const gotoBtn = this._btn(t('tc.goto'), 'tc-goto-btn', 'tc-action-btn');
      gotoBtn.addEventListener('click', () => { this.input.justPressed.add('KeyT'); });
      el.appendChild(gotoBtn);

      // Reset view
      const resetBtn = this._btn(t('tc.reset'), 'tc-reset-btn', 'tc-action-btn');
      resetBtn.addEventListener('click', () => { this.input.justPressed.add('KeyR'); });
      el.appendChild(resetBtn);

    } else if (mode === 'walk') {
      // Return to orbit
      const backBtn = this._btn(t('tc.orbit'), 'tc-back-btn', 'tc-action-btn primary');
      backBtn.addEventListener('click', () => { this.input.justPressed.add('KeyG'); });
      el.appendChild(backBtn);

    } else if (mode === 'fly') {
      // Return to orbit
      const backBtn = this._btn(t('tc.orbit'), 'tc-back-orbit-btn', 'tc-action-btn primary');
      backBtn.addEventListener('click', () => { this.cb.switchToOrbit?.(); });
      el.appendChild(backBtn);
    }
  }
}
