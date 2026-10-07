// AI 导游 · 悬浮面板（字幕条 + 指令输入 + 话筒）
//
// 设计原则：
// - 原生 DOM，风格与应用一致（深色玻璃 + 青蓝描边），不引入任何框架
// - 左下角放置，避开右侧仪表盘与底部导览条；可折叠
// - 输入框内按键 stopPropagation，避免触发应用全局快捷键（KeyT 等）

const STYLE = `
#guide-panel { position: fixed; left: 16px; bottom: 16px; z-index: 60; width: min(460px, calc(100vw - 32px));
  font-family: inherit; color: #d7ecf7; border-radius: 14px; padding: 12px 14px;
  background: rgba(2, 12, 24, .58); border: 1px solid rgba(140, 220, 255, .18);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, .45); font-size: 13px; }
#guide-panel.collapsed { width: auto; padding: 8px 12px; }
#guide-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#guide-panel.collapsed #guide-head { margin-bottom: 0; }
#guide-title { font-weight: 700; letter-spacing: .08em; font-size: 12.5px; color: #9fdcff; }
#guide-head .spacer { flex: 1; }
.guide-btn { cursor: pointer; border: 1px solid rgba(159, 220, 255, .3); background: rgba(159, 220, 255, .07);
  color: #bfeaff; border-radius: 8px; font: inherit; font-size: 12px; padding: 3px 9px; }
.guide-btn:hover { background: rgba(159, 220, 255, .16); }
.guide-btn.active { background: rgba(159, 220, 255, .28); box-shadow: 0 0 12px rgba(159, 220, 255, .45); }
#guide-sub { display: none; white-space: pre-wrap; line-height: 1.75; margin: 0 0 9px; max-height: 132px; overflow-y: auto;
  padding-right: 4px; }
#guide-sub.show { display: block; }
#guide-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
#guide-form { display: flex; gap: 6px; }
#guide-input { flex: 1; min-width: 0; font: inherit; font-size: 13px; color: #eaf7ff;
  background: rgba(4, 20, 36, .6); border: 1px solid rgba(140, 220, 255, .25); border-radius: 9px; padding: 7px 10px; outline: none; }
#guide-input:focus { border-color: rgba(159, 220, 255, .55); box-shadow: 0 0 0 3px rgba(159, 220, 255, .1); }
#guide-input::placeholder { color: rgba(160, 205, 226, .5); }
#guide-mic { flex: none; width: 36px; border-radius: 9px; font-size: 15px; }
#guide-panel.collapsed #guide-chips, #guide-panel.collapsed #guide-form, #guide-panel.collapsed #guide-sub { display: none !important; }
`;

const CHIPS = [
  ['带我去土星', '🪐 土星'],
  ['介绍月球', '🌕 讲讲月球'],
  ['快进1天每秒', '⏩ 1天/秒'],
  ['回到现在', '⏱ 现在'],
  ['开始导览', '🎬 导览'],
  ['你在哪', '🧭 状态'],
];

export function buildPanel({ dispatch, mic, onCollapse } = {}) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'guide-panel';
  root.innerHTML = `
    <div id="guide-head">
      <span id="guide-title">🛰 AI 导游</span>
      <span class="spacer"></span>
      <button class="guide-btn" id="guide-llm" title="配置 LLM（可选，解锁自由对话）">⚙︎ LLM</button>
      <button class="guide-btn" id="guide-fold" title="收起/展开">—</button>
    </div>
    <p id="guide-sub"></p>
    <div id="guide-chips"></div>
    <form id="guide-form">
      <input id="guide-input" placeholder="用嘴逛太阳系：带我去土星 / 快进1天每秒…" autocomplete="off" />
      <button type="button" class="guide-btn" id="guide-mic" title="语音输入">🎙</button>
    </form>
  `;
  document.body.appendChild(root);

  const sub = root.querySelector('#guide-sub');
  const chips = root.querySelector('#guide-chips');
  const input = root.querySelector('#guide-input');
  const micBtn = root.querySelector('#guide-mic');
  const llmBtn = root.querySelector('#guide-llm');

  for (const [cmd, label] of CHIPS) {
    const b = document.createElement('button');
    b.className = 'guide-btn';
    b.textContent = label;
    b.addEventListener('click', () => dispatch(cmd));
    chips.appendChild(b);
  }

  function show(text) {
    sub.textContent = text;
    sub.classList.add('show');
    sub.scrollTop = sub.scrollHeight;
    clearTimeout(show._t);
    show._t = setTimeout(() => { if (!sub.textContent.startsWith('🎧')) sub.classList.remove('show'); }, 15000);
  }

  if (!mic.supported) { micBtn.style.display = 'none'; }
  micBtn.addEventListener('click', () => mic.toggle());

  root.querySelector('#guide-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    dispatch(v);
  });
  // 阻止输入框按键冒泡到应用全局快捷键
  for (const type of ['keydown', 'keyup']) {
    input.addEventListener(type, (e) => e.stopPropagation());
  }

  root.querySelector('#guide-fold').addEventListener('click', (e) => {
    root.classList.toggle('collapsed');
    e.target.textContent = root.classList.contains('collapsed') ? '🛰' : '—';
    onCollapse?.(root.classList.contains('collapsed'));
  });

  llmBtn.addEventListener('click', () => {
    const hint = '配置 OpenAI 兼容接口（可选，留空取消）\n格式：baseUrl,apiKey,model\n例如：https://api.openai.com/v1,sk-xxx,gpt-4o-mini';
    const raw = window.prompt(hint, '');
    if (!raw) return;
    const [baseUrl, apiKey, model] = raw.split(',').map((s) => s.trim());
    try {
      // eslint-disable-next-line no-loss-of-precision
      window.__guide.configureLLM({ baseUrl, apiKey, model });
      show('✅ LLM 已配置，现在可以自由对话了。');
    } catch (e) {
      show(`⚠️ 配置失败：${e.message}`);
    }
  });

  return {
    root,
    show,
    setListening(on) {
      micBtn.classList.toggle('active', on);
      if (on) show('🎧 正在聆听…');
    },
  };
}
