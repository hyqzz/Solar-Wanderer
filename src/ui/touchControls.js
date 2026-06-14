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
    this._timeOpen = false; // expandable time panel

    this._build();
  }

  // ── DOM construction ────────────────────────────────────────────────────
  _build() {
    const root = this._el('div', { id: 'tc-root' });
    document.body.appendChild(root);
    this.root = root;

    this._buildBackdrop();
    this._buildTimeWidget(root);

    // Bottom bar: zoom | actions | drawers
    this._buildBottomBar(root);

    // Virtual joystick (walk/fly only)
    this._buildJoystick(root);

    // Right-side buttons (walk/fly only)
    this._buildRightBtns(root);

    // 移动版默认收起星球目录，避免进入即遮挡画面
    const dirPanel = document.getElementById('directory');
    if (dirPanel) {
      dirPanel.classList.remove('open');
      this._dirOpen = false;
    } else {
      this._dirOpen = false;
    }
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

  _buildTimeWidget(root) {
    // 右下角常驻时间按钮 + 点击展开的时间/显示控制面板
    root.appendChild(this._el('div', { id: 'tc-top-bar' })); // hidden stub for CSS compat

    const widget = this._el('div', { id: 'tc-time-widget' });
    root.appendChild(widget);
    this._timeWidget = widget;

    // 常驻时间按钮（右上角始终可见，点击后向下展开面板）
    const timeBtn = this._el('button', { id: 'tc-time-btn' });
    const timeSpan = this._el('span', { id: 'tc-time-val' });
    timeSpan.textContent = '--:--:--';
    const chevron = this._el('span', { id: 'tc-time-chevron' });
    chevron.textContent = '▶';
    timeBtn.appendChild(timeSpan);
    timeBtn.appendChild(chevron);
    widget.appendChild(timeBtn);

    // 展开面板（默认隐藏，位于按钮下方）
    const panel = this._el('div', { id: 'tc-time-panel' });
    panel.hidden = true;
    widget.appendChild(panel);
    this._timePanelEl = panel;

    // Time section
    const timeLabel = this._el('div', { className: 'tc-section-label' });
    timeLabel.textContent = t('tc.timeTitle');
    panel.appendChild(timeLabel);

    const timeRow = this._el('div', { className: 'tc-row' });
    panel.appendChild(timeRow);
    timeRow.appendChild(this._btn(t('tc.warpSlow'), 'tc-warp-down'));
    timeRow.appendChild(this._btn(t('tc.warpFast'), 'tc-warp-up'));

    const time2Row = this._el('div', { className: 'tc-row' });
    panel.appendChild(time2Row);
    time2Row.appendChild(this._btn(t('tc.pause'), 'tc-pause'));
    time2Row.appendChild(this._btn(t('tc.now'),   'tc-now'));

    // Display section
    const dispLabel = this._el('div', { className: 'tc-section-label' });
    dispLabel.textContent = t('tc.dispTitle');
    panel.appendChild(dispLabel);

    const dispRow = this._el('div', { className: 'tc-row' });
    panel.appendChild(dispRow);
    dispRow.appendChild(this._btn(t('tc.orbits'),   'tc-orbits'));
    dispRow.appendChild(this._btn(t('tc.labels'),   'tc-labels'));

    const dispRow2 = this._el('div', { className: 'tc-row' });
    panel.appendChild(dispRow2);
    dispRow2.appendChild(this._btn(t('tc.inertial'), 'tc-inertial'));
    dispRow2.appendChild(this._btn(t('tc.help'),     'tc-help'));

    timeBtn.addEventListener('click', () => {
      this._timeOpen = !this._timeOpen;
      panel.hidden = !this._timeOpen;
      chevron.textContent = this._timeOpen ? '▼' : '▶';
      if (this._timeOpen) {
        if (this._dirOpen) {
          this._dirOpen = false;
          document.getElementById('directory')?.classList.remove('open');
        }
        if (this._tgtOpen) {
          this._tgtOpen = false;
          document.getElementById('hud-target')?.classList.remove('tc-open');
        }
        this._updateBackdrop();
        this._updateDrawerBtnState();
      }
    });

    // 点击面板外部时收起
    document.addEventListener('pointerdown', (e) => {
      if (this._timeOpen && !widget.contains(e.target)) {
        this._timeOpen = false;
        panel.hidden = true;
        chevron.textContent = '▶';
      }
    }, { capture: true, passive: true });

    // 接线按钮
    document.getElementById('tc-warp-up')  .addEventListener('click', () => { this.cb.warpUp?.();   });
    document.getElementById('tc-warp-down').addEventListener('click', () => { this.cb.warpDown?.(); });
    document.getElementById('tc-pause')    .addEventListener('click', () => { this.input.justPressed.add('KeyP'); });
    document.getElementById('tc-now')      .addEventListener('click', () => { this.input.justPressed.add('KeyN'); });
    document.getElementById('tc-orbits')   .addEventListener('click', () => { this.cb.toggleOrbits?.(); });
    document.getElementById('tc-labels')   .addEventListener('click', () => { this.input.justPressed.add('KeyL'); });
    document.getElementById('tc-inertial') .addEventListener('click', () => { this.input.justPressed.add('KeyV'); });
    document.getElementById('tc-help')     .addEventListener('click', () => {
      this.input.justPressed.add('KeyH');
      this._timeOpen = false;
      panel.hidden = true;
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

    const tgtBtn = this._btn(t('tc.target'), 'tc-tgt-btn',  'tc-drawer-btn');
    const menuBtn = this._btn(t('tc.menu'),  'tc-menu-btn', 'tc-drawer-btn');
    drawers.appendChild(tgtBtn);
    drawers.appendChild(menuBtn);

    tgtBtn.addEventListener('click', () => {
      const tgt = document.getElementById('hud-target');
      if (!tgt) return;
      this._tgtOpen = !this._tgtOpen;
      tgt.classList.toggle('tc-open', this._tgtOpen);
      if (this._tgtOpen) {
        if (this._dirOpen) {
          this._dirOpen = false;
          document.getElementById('directory')?.classList.remove('open');
        }
        this._timeOpen = false;
        if (this._timePanelEl) this._timePanelEl.hidden = true;
      }
      this._updateBackdrop();
      this._updateDrawerBtnState();
    });

    // ☰ 作为目录按钮
    menuBtn.addEventListener('click', () => {
      const dir = document.getElementById('directory');
      if (!dir) return;
      this._dirOpen = !this._dirOpen;
      dir.classList.toggle('open', this._dirOpen);
      if (this._dirOpen) {
        if (this._tgtOpen) {
          this._tgtOpen = false;
          document.getElementById('hud-target')?.classList.remove('tc-open');
        }
        this._timeOpen = false;
        if (this._timePanelEl) this._timePanelEl.hidden = true;
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
    document.getElementById('tc-tgt-btn')?.classList.toggle('active', this._tgtOpen);
    document.getElementById('tc-menu-btn')?.classList.toggle('active', this._dirOpen);
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

  _closeDrawers() {
    if (this._dirOpen) {
      this._dirOpen = false;
      document.getElementById('directory')?.classList.remove('open');
    }
    if (this._tgtOpen) {
      this._tgtOpen = false;
      document.getElementById('hud-target')?.classList.remove('tc-open');
    }
    if (this._timeOpen) {
      this._timeOpen = false;
      if (this._timePanelEl) this._timePanelEl.hidden = true;
      const ch = document.getElementById('tc-time-chevron');
      if (ch) ch.textContent = '▶';
    }
    this._updateBackdrop();
    this._updateDrawerBtnState();
  }

  /** 外部调用：关闭目录抽屉（选中天体后自动收起） */
  closeDirectory() {
    if (this._dirOpen) this._closeDrawers();
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

      // 移动版探索模式不显示飞行按钮；飞行模式入口保留在长按/键盘 F（R12）
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
