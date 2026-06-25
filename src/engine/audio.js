// 环境音效引擎：纯程序化合成（Web Audio API），无外部音频文件。
// 设计目标：身临其境但不烦人——所有音量极低，默认静音，用户显式开启。
//
// 音频图：
//   [vacuum hiss]  ─┐
//   [atmo wind]    ─┤
//   [footstep]     ─┤→ bus(gain) → underwaterFilter(lowpass) → master(gain) → destination
//   [bubble]       ─┘
//
// underwaterFilter 始终串联在总线上：未潜水时截止频率 20kHz（透明），
// 潜水时降至 ~450Hz，对所有音效施加闷音效果。

// ── 脚步声表面类型配置 ──────────────────────────────────────────────────
// 每种表面用不同的滤波器类型/频率/包络模拟真实质感：
//   rock  — 月球/岩石：干涩碎裂，中高频带通 + 短促衰减
//   sand  — 火星/ Titan：沙尘摩擦，低频带通 + 较长衰减
//   dirt  — 地球陆地：泥土闷响，低通 + 柔和包络
//   ice   — 冰面：清脆碎裂，高通 + 极短衰减
const FOOTSTEP_PROFILES = {
  rock:  { filter: 'bandpass', freq: 1800, q: 1.5, gain: 0.13, dur: 0.12, freqJitter: 400 },
  sand:  { filter: 'bandpass', freq: 600,  q: 0.8, gain: 0.12, dur: 0.18, freqJitter: 200 },
  dirt:  { filter: 'lowpass',  freq: 900,  q: 1.2, gain: 0.14, dur: 0.12, freqJitter: 0   },
  ice:   { filter: 'highpass', freq: 3000, q: 0.7, gain: 0.10, dur: 0.08, freqJitter: 0   },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;

    // 用户可控开关：默认静音，需显式开启（浏览器自动播放策略 + 不烦人原则）
    this._enabled = false;
    this._volume = 0.6;           // 主音量 0-1
    this._vacuumEnabled = false;  // 太空射电嘶声独立开关（默认关闭，用户可切换）

    // 当前模式与环境（由 setMode 设置）
    this._mode = 'fly';
    this._env = { nearest: null, inAtmosphere: false, underwater: false, surface: 'rock' };

    // 每帧动态状态（由 update 设置，通常来自 Ship.audioState）
    this._state = { speed: 0, walking: false, submerged: false, surfaceType: 'rock' };

    // ── 主链路节点（init 时创建）──
    this._bus = null;              // 总线 GainNode：所有音效层汇入此处
    this._underwaterFilter = null; // BiquadFilterNode：潜水时低通闷音
    this._master = null;           // GainNode：最终音量 + 总开关

    // ── 噪声 buffer（init 时预生成，循环复用）──
    this._whiteBuf = null;  // 白噪声（射电嘶声 / 脚步脉冲）
    this._pinkBuf = null;   // 粉红噪声（大气风声，更自然）

    // ── 持续音效层（init 时创建，通过 gain 控制开关）──
    this._vacuum = null;    // { source, filter, gain } 太空射电嘶声
    this._atmo = null;      // { source, filter, gain } 大气层进入风声

    // ── 调度计时器 ──
    this._stepTimer = 0;    // 脚步累加时间
    this._stepInterval = 0.5;
    this._bubbleTimer = 0;  // 气泡累加时间
  }

  get enabled() { return this._enabled; }

  get vacuumEnabled() { return this._vacuumEnabled; }

  /**
   * 首次用户交互时创建 AudioContext（浏览器自动播放策略要求）。
   * 必须在用户手势（click/touch/keydown）回调中调用，否则 ctx 会被挂起。
   * 构建完整音频图并预生成噪声 buffer。
   */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // Web Audio API 不可用（极旧浏览器）→ 静默降级

    this.ctx = new Ctx();

    // 主链路：bus → underwaterFilter → master → destination
    this._bus = this.ctx.createGain();
    this._bus.gain.value = 1;

    this._underwaterFilter = this.ctx.createBiquadFilter();
    this._underwaterFilter.type = 'lowpass';
    this._underwaterFilter.frequency.value = 20000; // 未潜水时透明
    this._underwaterFilter.Q.value = 0.5;

    this._master = this.ctx.createGain();
    this._master.gain.value = 0; // 默认静音，setEnabled 时渐入

    this._bus.connect(this._underwaterFilter);
    this._underwaterFilter.connect(this._master);
    this._master.connect(this.ctx.destination);

    // 预生成噪声 buffer（2 秒循环，避免可察觉的重复周期）
    this._whiteBuf = this._makeNoiseBuffer('white');
    this._pinkBuf = this._makeNoiseBuffer('pink');

    // 持续音效层：创建后立即 start，通过 gain 控制可闻度（避免反复创建/销毁节点）
    // 太空射电嘶声：白噪声 + 低通滤波（模拟太空射电背景）
    this._vacuum = this._createNoiseLayer(this._whiteBuf, 'lowpass', 600, 0);
    this._vacuum.gain.connect(this._bus);

    // 大气层进入风声：粉红噪声 + 带通滤波（风声摩擦感）
    this._atmo = this._createNoiseLayer(this._pinkBuf, 'bandpass', 500, 0);
    this._atmo.gain.connect(this._bus);
  }

  /**
   * 生成噪声 buffer。
   * white — 均匀分布白噪声（射电嘶声、脚步脉冲源）
   * pink  — Paul Kellet 精细化算法粉红噪声（每倍频 -3dB，风声更自然）
   */
  _makeNoiseBuffer(type) {
    const sr = this.ctx.sampleRate;
    const len = sr * 2; // 2 秒
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
      // Paul Kellet refined pink noise filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  /**
   * 创建持续循环的噪声层：BufferSource(loop) → BiquadFilter → Gain
   * 返回 { source, filter, gain }，gain 初始为 0（静默），由 update 渐变。
   */
  _createNoiseLayer(buffer, filterType, freq, gainVal) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = gainVal;
    src.connect(filter);
    filter.connect(g);
    src.start();
    return { source: src, filter, gain: g };
  }

  /**
   * 设置当前模式与环境。
   * @param mode 'orbit' | 'fly' | 'walk'
   * @param env  { nearest, inAtmosphere, underwater, surface }
   *   - nearest: 最近天体 { id, radiusKm, distSurface, ... }
   *   - inAtmosphere: 是否在大气层内
   *   - underwater: 是否在水下（行走模式潜水）
   *   - surface: 表面类型 'rock'|'sand'|'dirt'|'ice'
   */
  setMode(mode, env) {
    this._mode = mode || 'fly';
    if (env) {
      this._env = {
        nearest: env.nearest || null,
        inAtmosphere: !!env.inAtmosphere,
        underwater: !!env.underwater,
        surface: env.surface || 'rock',
      };
    }
  }

  /**
   * 每帧更新：根据模式/环境/状态驱动各音效层的音量与滤波参数。
   * @param dt    帧间隔（秒）
   * @param state { speed, walking, submerged, surfaceType }
   *   - speed: 移动速度（km/s，行走档位或飞船速度）
   *   - walking: 是否正在行走（有移动输入）
   *   - submerged: 是否潜水
   *   - surfaceType: 当前表面类型
   */
  update(dt, state) {
    if (!this.ctx || !this._enabled) return;
    if (state) Object.assign(this._state, state);

    const now = this.ctx.currentTime;
    const submerged = this._state.submerged || this._env.underwater;

    // ── 水下闷音滤波器：对所有音效生效 ──
    // 未潜水时截止频率 20kHz（人耳不可闻的透明状态）；
    // 潜水时降至 450Hz，模拟水中声音被低通衰减的闷感。
    const targetCutoff = submerged ? 450 : 20000;
    this._underwaterFilter.frequency.setTargetAtTime(targetCutoff, now, 0.15);

    // ── 太空射电嘶声（fly/orbit + 真空 + 用户开启）──
    // 极微弱（0.03），不干扰；默认关闭，需 setVacuum(true) 开启
    const inVacuum = (this._mode === 'fly' || this._mode === 'orbit')
      && !this._env.inAtmosphere && !submerged;
    const vacuumTarget = (inVacuum && this._vacuumEnabled) ? 0.03 : 0;
    this._vacuum.gain.gain.setTargetAtTime(vacuumTarget, now, 0.3);

    // ── 大气层进入风声（fly/orbit + 大气层内）──
    // 音量随大气密度（离地表越近越浓）增大；频率随速度漂移
    let atmoTarget = 0;
    if ((this._mode === 'fly' || this._mode === 'orbit')
      && this._env.inAtmosphere && !submerged) {
      const n = this._env.nearest;
      if (n) {
        // 密度代理：离表面越近越浓（0=大气层顶，1=贴地）
        const altFactor = Math.max(0, 1 - n.distSurface / Math.max(n.radiusKm * 0.3, 0.001));
        atmoTarget = 0.03 + altFactor * 0.07; // 0.03-0.10
      } else {
        atmoTarget = 0.04;
      }
      // 带通中心频率随速度上移（高速摩擦音调升高）
      const speedFreq = 400 + Math.min(this._state.speed * 50, 800);
      this._atmo.filter.frequency.setTargetAtTime(speedFreq, now, 0.2);
    }
    this._atmo.gain.gain.setTargetAtTime(atmoTarget, now, 0.15);

    // ── 脚步声（walk + 行走中 + 未潜水）──
    if (this._mode === 'walk' && this._state.walking && !submerged) {
      this._stepTimer += dt;
      // 步频由行走速度驱动：常速 ~1.2 Hz，冲刺 ~2.5 Hz
      const speedNorm = Math.min(this._state.speed / 0.009, 1);
      this._stepInterval = 1 / (1.2 + speedNorm * 1.3);
      if (this._stepTimer >= this._stepInterval) {
        this._stepTimer = 0;
        this._playFootstep(this._state.surfaceType);
      }
    } else {
      this._stepTimer = 0;
    }

    // ── 气泡声（潜水时随机短促脉冲）──
    if (submerged) {
      this._bubbleTimer += dt;
      const bubbleInterval = 0.8 + Math.random() * 1.5; // 0.8-2.3s 随机间隔
      if (this._bubbleTimer >= bubbleInterval) {
        this._bubbleTimer = 0;
        this._playBubble();
      }
    } else {
      this._bubbleTimer = 0;
    }
  }

  /**
   * 播放一次脚步声：短促噪声脉冲 + 表面类型滤波。
   * 每次随机化频率/播放速率，避免机械重复感。
   */
  _playFootstep(surfaceType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const profile = FOOTSTEP_PROFILES[surfaceType] || FOOTSTEP_PROFILES.rock;

    // 噪声脉冲源：从白噪声 buffer 取一段
    const src = this.ctx.createBufferSource();
    src.buffer = this._whiteBuf;
    src.loop = false;
    src.playbackRate.value = 0.8 + Math.random() * 0.4; // 变速增加多样性

    const filter = this.ctx.createBiquadFilter();
    filter.type = profile.filter;
    filter.frequency.value = profile.freq + (Math.random() * 2 - 1) * profile.freqJitter;
    filter.Q.value = profile.q;

    const g = this.ctx.createGain();
    const dur = profile.dur;
    // ADSR 简化：快速攻击 + 指数衰减
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(profile.gain, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(this._bus);

    // 从噪声 buffer 随机偏移处开始播放，取 dur*1.5 长度的切片
    src.start(now, Math.random() * 1.5, dur * 1.5);
    src.stop(now + dur * 1.5);
  }

  /**
   * 播放一次气泡声：正弦波频率上扫 + 短促包络。
   * 模拟气泡从深处上升时的音调变化。
   */
  _playBubble() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = 200 + Math.random() * 400;
    const endFreq = startFreq + 200 + Math.random() * 300;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

    const g = this.ctx.createGain();
    const peak = 0.035 + Math.random() * 0.035; // 极低音量
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(g);
    g.connect(this._bus);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * 总开关。首次开启时延迟创建 AudioContext（必须在用户手势内调用）。
   * 恢复挂起的 ctx（移动端 tab 切回时 ctx 会自动挂起）。
   */
  setEnabled(on) {
    this._enabled = !!on;
    if (this._enabled) {
      if (!this.ctx) this.init();
      if (!this.ctx) return; // Web Audio 不可用
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this._enabled ? this._volume : 0;
    // 50ms 平滑过渡，避免咔哒声
    this._master.gain.setTargetAtTime(target, now, 0.05);
  }

  /** 主音量 0-1 */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this._enabled) {
      this._master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * 太空射电嘶声独立开关。
   * 即使音频引擎已开启，嘶声仍默认关闭——太空本应近乎无声，
   * 这层极微弱的射电背景仅供希望增强沉浸感的用户选择。
   */
  setVacuum(on) {
    this._vacuumEnabled = !!on;
  }

  /** 切换总开关，返回新状态 */
  toggle() {
    this.setEnabled(!this._enabled);
    return this._enabled;
  }
}
