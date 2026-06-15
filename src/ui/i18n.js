// 界面国际化（i18n）：浏览器中文→简体中文，其他→英文（#2）。
// LANG 来自 config.js（Node 默认 'zh'）。t(key, vars) 取本地化串并替换 {x} 占位符；
// bodyName(entry) 取天体本地化名称。applyDomI18n() 处理 index.html 静态文本。

import { LANG } from '../config.js';
export { LANG };

const D = {
  // ── 通用单位（HUD 用）────────────────────────────────────────────────
  'u.year': ['年', 'yr'], 'u.month': ['月', 'mo'], 'u.week': ['周', 'wk'],
  'u.day': ['天', 'd'], 'u.hour': ['小时', 'h'], 'u.min': ['分钟', 'min'],
  'u.days': ['天', 'd'], 'u.years': ['年', 'yr'], 'u.hours': ['小时', 'h'],
  'u.ms': ['毫秒', 'ms'], 'u.sec': ['秒', 's'], 'u.perSec': ['/秒', '/s'],
  'u.ly': ['光年', 'ly'],

  // ── 时间面板 ─────────────────────────────────────────────────────────
  'time.paused': ['⏸ 已暂停', '⏸ Paused'],
  'time.realtime': ['1×（实时）', '1× (real-time)'],
  'time.rate': ['时间倍率', 'Time warp'],
  'time.k.minus': ['减', 'slower'], 'time.k.plus': ['加', 'faster'],
  'time.k.pause': ['暂停', 'pause'], 'time.k.now': ['现在', 'now'],
  'time.outOfRange': ['⚠ 超出星历高精度范围(1800–2050)', '⚠ Outside high-accuracy ephemeris range (1800–2050)'],

  // ── 导航面板 ─────────────────────────────────────────────────────────
  'nav.flight': ['✈ 飞行动画', '✈ Flying'],
  'nav.orbit': ['🌐 探索（拖拽·滚轮·双击前往）', '🌐 Explore (drag · scroll · double-click to fly)'],
  'nav.walk': ['🚶 地表行走', '🚶 Surface walk'],
  'nav.fly': ['🚀 自由飞行', '🚀 Free flight'],
  'nav.goingTo': ['前往 {name}', 'To {name}'],
  'nav.orbiting': ['环绕焦点：{name}', 'Orbiting: {name}'],
  'nav.speed': ['速度 {v}', 'Speed {v}'],
  'nav.gear': ['　档位 {v}（滚轮调节）', '　gear {v} (scroll)'],
  'nav.nearest': ['最近天体：{name}　高度 {alt}', 'Nearest: {name}　alt {alt}'],
  'nav.gravity': ['表面重力 {g} m/s²', 'Surface gravity {g} m/s²'],
  'nav.hintFly': ['自由飞行', 'Free flight'], 'nav.hintGoto': ['前往所选', 'Go to selected'],

  // ── 目标信息面板 ─────────────────────────────────────────────────────
  'tgt.none': ['未选择目标 — 单击标签选中，双击/搜索/目录前往<br>数字键 1-9/0 直达行星',
    'No target — click a label to select; double-click/search/directory to fly<br>Keys 1-9/0 jump to planets'],
  'tgt.dist': ['距你 {d}　<span class="dim">光行 {lt}</span>', 'Distance {d}　<span class="dim">light-time {lt}</span>'],
  'tgt.dSun': ['距太阳 {au} AU', 'From Sun {au} AU'],
  'tgt.radius': ['半径 {r} km', 'Radius {r} km'],
  'tgt.gravity': ['表面重力 {g} m/s²', 'Surface gravity {g} m/s²'],
  'tgt.period': ['公转周期 {p}', 'Orbital period {p}'],
  'tgt.rotation': ['自转周期 {p}', 'Rotation period {p}'],
  'tgt.fact': ['📚 <b>你知道吗</b>　', '📚 <b>Did you know</b>　'],
  'tgt.factNext': ['换一条 ↻', 'Another ↻'],
  'tgt.goto': ['<span class="key">T</span> 前往（GE 式飞行）', '<span class="key">T</span> Fly there'],

  // ── 提示（tips）──────────────────────────────────────────────────────
  'tip.quality': ['已自动降低画质以保证流畅运行', 'Quality lowered automatically for smooth performance'],
  'tip.tnoOrbitsOn': ['海外天体轨道线：开', 'Trans-Neptunian orbits: ON'],
  'tip.tnoOrbitsOff': ['海外天体轨道线：关', 'Trans-Neptunian orbits: OFF'],
  'tip.pendingFocus': ['🎯 已选择目标：{name}（滚动鼠标或 PageUp/Down 平滑接近/远离）',
    '🎯 Target set: {name} (scroll or PageUp/Down to approach/recede)'],
  'tip.lockedFocus': ['🎯 已锁定焦点：{name}（滚轮拉近可直达登陆）',
    '🎯 Focus locked: {name} (scroll in to land directly)'],
  'tip.flyingTo': ['✈ 正在前往 {name} …（拖拽可中断）', '✈ Flying to {name}… (drag to cancel)'],
  'tip.lockHint': ['单击画面锁定鼠标即可用准星瞄准天体', 'Click to lock the pointer and aim with the crosshair'],
  'tip.aimHint': ['移动鼠标用准星瞄准天体，单击选中', 'Move the mouse to aim; click to select'],
  'tip.landHint': ['滚轮继续拉近 = 直接降落 {name}（或按 G 立即登陆）',
    'Keep scrolling in = land on {name} (or press G to land now)'],
  'tip.landAny': ['滚轮一路拉近即可无缝降落地表', 'Scroll all the way in to land seamlessly'],
  'tip.enterAtmo': ['☁ 正在进入 {name} 大气层（无固体表面，滚轮后退离开）',
    '☁ Entering {name} atmosphere (no solid surface; scroll out to leave)'],
  'tip.gasGiant': ['⚠ 气态/冰巨行星无固体表面：可下潜入大气层，无法降落',
    '⚠ Gas/ice giant has no solid surface: you can dive into the atmosphere but not land'],
  'tip.sun': ['⚠ 接近太阳：表面温度 5772 K', '⚠ Approaching the Sun: surface 5772 K'],
  'tip.inertial': ['🛰 惯性观察模式：相机不随自转，加速时间（]键）可观赏 {name} 的卫星绕转 · V 切回',
    '🛰 Inertial view: camera ignores rotation; speed up time (]) to watch {name}\'s moons orbit · V to exit'],
  'tip.walkLocked': ['滚轮后退起飞 · G 返回探索 · Space 跳跃 · Shift 奔跑 · 抬头看看天空',
    'Scroll back to take off · G to explore · Space jump · Shift run · look up at the sky'],
  'tip.walkUnlocked': ['单击画面锁定鼠标环视（或按住左键拖拽）· 滚轮后退起飞',
    'Click to lock the pointer and look around (or drag) · scroll back to take off'],
  'tip.landNear': ['滚轮继续拉近 = 直接降落 {name}（或按 G 立即登陆）',
    'Keep scrolling in = land on {name} (or press G to land now)'],
  'tip.urlCopied': ['🔗 链接已复制到剪贴板（Ctrl+L）', '🔗 Link copied to clipboard (Ctrl+L)'],
  'tip.urlUpdated': ['🔗 地址栏已更新（Ctrl+L）', '🔗 Address bar updated (Ctrl+L)'],

  // ── HUD 面板 ─────────────────────────────────────────────────────────
  'hud.flightTo': ['前往 {name}　{p}%', 'To {name}　{p}%'],
  'hud.orbitFocus': ['环绕焦点：{name}', 'Orbiting: {name}'],
  'hud.speed': ['速度 {v}', 'Speed {v}'],
  'hud.gear': ['　档位 {v}（滚轮调节）', '　gear {v} (scroll)'],
  'hud.nearest': ['最近天体：{name}　高度 {alt}', 'Nearest: {name}　alt {alt}'],
  'hud.surfaceGravity': ['表面重力 {g} m/s²', 'Surface gravity {g} m/s²'],
  'hud.hintFly': ['自由飞行', 'Free flight'],
  'hud.hintGoto': ['前往所选', 'Go to selected'],
  'hud.lightMs': ['毫秒', 'ms'],
  'hud.lightSec': ['秒', 's'],
  'hud.lightMin': ['分钟', 'min'],
  'hud.lightHour': ['小时', 'h'],

  'word.target': ['目标', 'target'],

  // ── 目录 / 搜索 ──────────────────────────────────────────────────────
  'dir.title': ['🪐 天体目录', '🪐 Directory'], 'dir.sub': ['点击即前往', 'click to fly'],
  'grp.star': ['☀️ 恒星', '☀️ Stars'], 'grp.planet': ['🪐 行星', '🪐 Planets'],
  'grp.dwarf': ['🧊 矮行星', '🧊 Dwarf planets'], 'grp.moon': ['🌙 卫星', '🌙 Moons'],
  'grp.comet': ['☄️ 彗星', '☄️ Comets'], 'grp.tno': ['🌑 海外天体（TNO）', '🌑 Trans-Neptunian (TNO)'],
  'grp.probe': ['🛰 探测器', '🛰 Probes'], 'grp.boundary': ['🌌 日球层边界', '🌌 Heliosphere edge'],
  'grp.region': ['🪐 星带与全景', '🪐 Belts & panoramas'],
  'kind.star': ['恒星', 'star'], 'kind.planet': ['行星', 'planet'], 'kind.moon': ['卫星', 'moon'],
  'kind.comet': ['彗星', 'comet'], 'kind.probe': ['探测器', 'probe'], 'kind.boundary': ['边界', 'boundary'],
  'kind.poi': ['地标', 'landmark'], 'kind.tno': ['海外天体', 'TNO'], 'kind.region': ['区域', 'region'],
  'search.orbits': ['🛤 轨道线', '🛤 Orbit lines'], 'search.on': ['显示', 'shown'], 'search.off': ['隐藏', 'hidden'],
  'search.cur': ['当前', 'now'], 'search.toggle': ['点击切换', 'click to toggle'],

  // ── 开始界面 ─────────────────────────────────────────────────────────
  'start.sub': ['太阳系 1:1 实时模拟 · 基于 NASA JPL 星历还原此刻太阳系 · 自由探索整个太阳系',
    '1:1 real-time solar system · NASA JPL ephemerides recreate the system right now · explore the whole solar system'],
  'start.loading': ['加载中…', 'Loading…'],
  'start.loadingTex': ['加载真实行星贴图… {done}/{total}', 'Loading real planet textures… {done}/{total}'],
  'start.enter': ['点击进入太阳系', 'Enter the solar system'],
  'start.hint': ['进入后单击画面锁定鼠标 · H 查看完整操作说明',
    'Click to lock the pointer after entering · press H for full controls'],
  'start.hintTouch': ['单指旋转 · 双指缩放 · 双击标签前往',
    'One-finger rotate · pinch to zoom · double-tap label to fly'],
  'start.star': ['Star on GitHub', 'Star on GitHub'],
  'help.toggle': ['操作说明（H 关闭）', 'Controls (H to close)'],

  // ── 触摸操作面板 ─────────────────────────────────────────────────────
  'tc.menu':      ['☰', '☰'],
  'tc.zoomIn':    ['＋', '＋'],
  'tc.zoomOut':   ['－', '－'],
  'tc.dir':       ['🎯', '🎯'],
  'tc.target':    ['ℹ️', 'ℹ️'],
  'tc.land':      ['🛬 降落', '🛬 Land'],
  'tc.fly':       ['🚀 飞行', '🚀 Fly'],
  'tc.orbit':     ['🌐 探索', '🌐 Explore'],
  'tc.stop':      ['⏹ 急停', '⏹ Stop'],
  'tc.goto':      ['✈ 前往', '✈ Go'],
  'tc.reset':     ['↺ 复位', '↺ Reset'],
  'tc.inertial':  ['🛰 惯性', '🛰 Inertial'],
  'tc.jump':      ['↑ 跳跃', '↑ Jump'],
  'tc.ascend':    ['▲', '▲'],
  'tc.descend':   ['▼', '▼'],
  'tc.sprint':    ['⚡ 奔跑', '⚡ Run'],
  'tc.takeoff':   ['🚀 起飞', '🚀 Takeoff'],
  'tc.warpSlow':  ['⏮ 减速', '⏮ Slower'],
  'tc.warpFast':  ['⏭ 加速', '⏭ Faster'],
  'tc.pause':     ['⏸ 暂停', '⏸ Pause'],
  'tc.now':       ['⏺ 现在', '⏺ Now'],
  'tc.orbits':    ['🛤 轨道线', '🛤 Orbits'],
  'tc.labels':    ['🏷 标签', '🏷 Labels'],
  'tc.help':      ['❓ 帮助', '❓ Help'],
  'tc.timeTitle': ['⏱ 时间', '⏱ Time'],
  'tc.dispTitle': ['🖥 显示', '🖥 Display'],
  'tc.dirTitle':  ['🎯 目录', '🎯 Directory'],

  // ── 触摸专属操作提示 ─────────────────────────────────────────────────
  'tip.walkTouch': ['拖拽屏幕环视 · 摇杆移动 · 双指后缩起飞',
    'Drag to look · joystick to move · pinch-out to take off'],
  'tip.flyTouch': ['拖拽屏幕转向 · 摇杆平移 · 左上角切回探索',
    'Drag to look · joystick to strafe · top-left to return'],
};

export function t(key, vars) {
  const e = D[key];
  let s = e ? (LANG === 'zh' ? e[0] : e[1]) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/** 天体本地化名称：英文界面优先用 nameEn，缺失回退中文。 */
export function bodyName(entry) {
  if (!entry) return '';
  return LANG === 'zh' ? entry.nameZh : (entry.nameEn || entry.nameZh);
}

const isTouchDevice = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 &&
  (typeof window === 'undefined' || window.matchMedia?.('(pointer: coarse)').matches);

/** 处理 index.html 中带 data-i18n / data-i18n-html 的静态文本节点；英文界面注入英文帮助。 */
export function applyDomI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.getAttribute('data-i18n-html'));

  // 移动端：把启动提示改为触摸说明
  if (isTouchDevice()) {
    const hint = root.querySelector('.start-inner .hint');
    if (hint) hint.textContent = t('start.hintTouch');
  }

  if (LANG === 'en') {
    document.documentElement.lang = 'en';
    const inner = document.querySelector('#help .help-inner');
    if (inner) inner.innerHTML = isTouchDevice() ? HELP_TOUCH_EN : HELP_EN;
  } else if (isTouchDevice()) {
    const inner = document.querySelector('#help .help-inner');
    if (inner) inner.innerHTML = HELP_TOUCH_ZH;
  }
}

const HELP_EN = `
  <h2>Controls (press H to close)</h2>
  <div class="help-cols">
    <div>
      <h3>🌐 Explore mode (default · Google Earth style)</h3>
      <table>
        <tr><td>Left-drag</td><td>Orbit around focus (inertia; auto-slows near surface)</td></tr>
        <tr><td>Ctrl+Left-drag</td><td>Rotate heading / tilt (3D look-around)</td></tr>
        <tr><td>Right/Middle-drag</td><td>Pan the whole space (no rotation; R to reset)</td></tr>
        <tr><td>W S A D / Arrows</td><td>Pan view (N/S/W/E, speed scales with altitude)</td></tr>
        <tr><td>Shift+A / Shift+D</td><td>Rotate heading (CCW / CW)</td></tr>
        <tr><td>Shift+W / Shift+S</td><td>Tilt toward horizon / back to top-down</td></tr>
        <tr><td>Click a body</td><td><b>Lock focus</b> (scroll then approaches it; can land directly)</td></tr>
        <tr><td>Scroll / PageUp PageDown / + −</td><td>Zoom about screen center (altitude-scaled: metre steps near ground, hover at <b>any altitude</b>)</td></tr>
        <tr><td>Scroll all the way in</td><td><b>Seamless landing</b> (auto switch to walking); oceans land on the water surface</td></tr>
        <tr><td>V</td><td>Inertial view (camera ignores rotation · pair with time-warp to watch moons orbit)</td></tr>
        <tr><td>R</td><td>Reset view (north up, top-down)</td></tr>
        <tr><td>🪐 Directory</td><td>Pick a body → fly-to animation (left, open by default)</td></tr>
        <tr><td>Double-click label / T / 1–9,0</td><td>GE-style fly-to (target centered)</td></tr>
        <tr><td>Drag (while flying)</td><td>Interrupt the fly-to animation</td></tr>
        <tr><td>G</td><td>Land and walk when near the surface</td></tr>
        <tr><td>F</td><td>Toggle free flight</td></tr>
      </table>
      <h3>🚶 Surface walk</h3>
      <table>
        <tr><td>Mouse / W S A D</td><td>Look (360°) / walk (real surface gravity)</td></tr>
        <tr><td>Scroll back / PageUp</td><td><b>Seamless takeoff</b> back to explore (view preserved)</td></tr>
        <tr><td>Scroll in at water / PageDown</td><td><b>Dive</b> — low-sensitivity rise/sink, stop to hover; surfacing restores automatically</td></tr>
        <tr><td>Shift / Space</td><td>Run / jump (6× higher on the Moon); underwater Space = ascend</td></tr>
        <tr><td>G</td><td>Return to explore mode</td></tr>
      </table>
    </div>
    <div>
      <h3>🚀 Free flight (press F)</h3>
      <table>
        <tr><td>Mouse / Q E</td><td>Pitch & yaw / roll</td></tr>
        <tr><td>W S A D R F</td><td>Six-axis translation</td></tr>
        <tr><td>Scroll / Shift</td><td>Speed gear (1 m/s→2 AU/s) / boost</td></tr>
        <tr><td>X</td><td>Full stop (hover anywhere)</td></tr>
        <tr><td>Esc</td><td>Return to explore mode</td></tr>
      </table>
      <h3>⏱ Time</h3>
      <table>
        <tr><td>[ / ]</td><td>Time warp slower / faster (can reverse)</td></tr>
        <tr><td>P / N</td><td>Pause / back to now</td></tr>
      </table>
      <h3>🖥 Display</h3>
      <table>
        <tr><td>O / L / H</td><td>Orbit lines / labels / this help</td></tr>
        <tr><td>K</td><td>Trans-Neptunian (TNO) orbit lines (off by default)</td></tr>
      </table>
    </div>
  </div>
  <p class="credit">Ephemerides: NASA JPL (Standish planetary elements + Horizons-fitted moon orbits, verified against official data)<br>
  Textures: NASA/USGS data (Solar System Scope CC-BY-4.0 / Steve Albers SOS / JPL Photojournal)</p>
`;

const HELP_TOUCH_EN = `
  <h2>Touch Controls (tap ❓ to close)</h2>
  <h3>🌐 Explore mode (default)</h3>
  <table>
    <tr><td>One-finger drag</td><td>Orbit around focus (with inertia)</td></tr>
    <tr><td>Pinch / spread</td><td>Zoom in / zoom out (spread all the way in → <b>seamless landing</b>)</td></tr>
    <tr><td>Two-finger drag</td><td>Pan the space (no rotation)</td></tr>
    <tr><td>Tap a body / label</td><td>Select / lock focus</td></tr>
    <tr><td>Double-tap label</td><td>Fly to that body (GE animation)</td></tr>
    <tr><td>＋ / － buttons</td><td>Hold to zoom in / out</td></tr>
    <tr><td>🪐 button</td><td>Toggle body directory drawer</td></tr>
    <tr><td>🎯 button</td><td>Toggle selected-body info panel</td></tr>
    <tr><td>✈ button</td><td>Fly to selected body</td></tr>
    <tr><td>🛬 button</td><td>Land (appears when near surface)</td></tr>
    <tr><td>🚀 Fly button</td><td>Enter free-flight mode</td></tr>
    <tr><td>↺ Reset button</td><td>Reset view (north up, top-down)</td></tr>
  </table>
  <h3>🚶 Surface walk</h3>
  <table>
    <tr><td>One-finger drag</td><td>Look around (360°)</td></tr>
    <tr><td>Left joystick</td><td>Walk (real surface gravity)</td></tr>
    <tr><td>↑ Jump button</td><td>Jump (6× higher on the Moon)</td></tr>
    <tr><td>⚡ Run button</td><td>Hold to sprint</td></tr>
    <tr><td>🚀 Takeoff button</td><td>Seamless takeoff back to explore</td></tr>
    <tr><td>🌐 Explore button</td><td>Return to explore mode</td></tr>
  </table>
  <h3>🚀 Free flight</h3>
  <table>
    <tr><td>One-finger drag</td><td>Pitch &amp; yaw</td></tr>
    <tr><td>Left joystick</td><td>Strafe / forward / backward</td></tr>
    <tr><td>▲ / ▼ buttons</td><td>Hold to ascend / descend</td></tr>
    <tr><td>⏹ Stop button</td><td>Full stop (hover anywhere)</td></tr>
    <tr><td>🌐 Explore button</td><td>Return to explore mode</td></tr>
  </table>
  <h3>☰ Menu</h3>
  <table>
    <tr><td>⏮ / ⏭ buttons</td><td>Time warp slower / faster</td></tr>
    <tr><td>⏸ / ⏺ buttons</td><td>Pause / reset to now</td></tr>
    <tr><td>🛤 / 🏷 buttons</td><td>Toggle orbit lines / labels</td></tr>
    <tr><td>🛰 Inertial</td><td>Camera ignores rotation (watch moons orbit)</td></tr>
  </table>
  <p class="credit">Ephemerides: NASA JPL · Textures: NASA/USGS</p>
`;

const HELP_TOUCH_ZH = `
  <h2>触摸操作说明（点 ❓ 关闭）</h2>
  <h3>🌐 探索模式（默认）</h3>
  <table>
    <tr><td>单指拖拽</td><td>环绕焦点旋转（带惯性）</td></tr>
    <tr><td>双指捏合 / 张开</td><td>缩放：张开到底 = <b>无缝降落地表</b></td></tr>
    <tr><td>双指平移</td><td>平移整个空间（无旋转）</td></tr>
    <tr><td>点击天体/标签</td><td>选中 / 锁定焦点</td></tr>
    <tr><td>双击标签</td><td>GE 式飞行动画前往</td></tr>
    <tr><td>＋ / － 按钮</td><td>长按缩放接近 / 远离</td></tr>
    <tr><td>🪐 按钮</td><td>切换天体目录抽屉</td></tr>
    <tr><td>🎯 按钮</td><td>切换目标信息面板</td></tr>
    <tr><td>✈ 前往</td><td>飞往所选天体</td></tr>
    <tr><td>🛬 降落</td><td>贴近地表时出现，点击登陆</td></tr>
    <tr><td>🚀 飞行</td><td>进入自由飞行模式</td></tr>
    <tr><td>↺ 复位</td><td>复位视角（北朝上、俯视）</td></tr>
  </table>
  <h3>🚶 地表行走</h3>
  <table>
    <tr><td>单指拖拽</td><td>环视（360° 自由，可仰望天空）</td></tr>
    <tr><td>左下摇杆</td><td>行走（真实表面重力）</td></tr>
    <tr><td>↑ 跳跃</td><td>跳跃（月球 6 倍高）</td></tr>
    <tr><td>⚡ 奔跑</td><td>长按加速奔跑</td></tr>
    <tr><td>🚀 起飞</td><td>无缝起飞回探索模式</td></tr>
    <tr><td>🌐 探索</td><td>返回探索模式</td></tr>
  </table>
  <h3>🚀 自由飞行</h3>
  <table>
    <tr><td>单指拖拽</td><td>俯仰 / 偏航视角</td></tr>
    <tr><td>左下摇杆</td><td>平移推力（前后左右）</td></tr>
    <tr><td>▲ / ▼ 按钮</td><td>长按上升 / 下降</td></tr>
    <tr><td>⏹ 急停</td><td>全停悬停</td></tr>
    <tr><td>🌐 探索</td><td>返回探索模式</td></tr>
  </table>
  <h3>☰ 菜单</h3>
  <table>
    <tr><td>⏮ / ⏭</td><td>时间倍率 减 / 加</td></tr>
    <tr><td>⏸ / ⏺</td><td>暂停 / 回到现在</td></tr>
    <tr><td>🛤 / 🏷</td><td>切换轨道线 / 标签显示</td></tr>
    <tr><td>🛰 惯性</td><td>相机不随自转，配合时间加速看卫星绕转</td></tr>
  </table>
  <p class="credit">星历：NASA JPL · 贴图：NASA/USGS</p>
`;
