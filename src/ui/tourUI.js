// 导览 UI（#39/#40 接通层）：目录面板中的导览入口 + 播放中的底部控制条。
// TourSystem/Narrator 早已实现但无界面入口，本模块负责把它们接到 DOM。

import { LANG } from './i18n.js';

const UI = {
  'tour.group': { zh: '🎬 导览', en: '🎬 Tours', es: '🎬 Visitas', ja: '🎬 ツアー', fr: '🎬 Visites', de: '🎬 Touren', ru: '🎬 Туры' },
  'tour.exit':  { zh: '退出导览', en: 'Exit tour', es: 'Salir', ja: '終了', fr: 'Quitter', de: 'Beenden', ru: 'Выйти' },
  'tour.prev':  { zh: '上一站', en: 'Previous', es: 'Anterior', ja: '前へ', fr: 'Précédent', de: 'Zurück', ru: 'Назад' },
  'tour.next':  { zh: '下一站', en: 'Next', es: 'Siguiente', ja: '次へ', fr: 'Suivant', de: 'Weiter', ru: 'Далее' },
  'tour.stops': { zh: '{n} 站', en: '{n} stops', es: '{n} paradas', ja: '{n} 箇所', fr: '{n} arrêts', de: '{n} Stopps', ru: '{n} остановок' },
};

function tt(key, vars) {
  const e = UI[key];
  let s = e ? (e[LANG] ?? e.en ?? e.zh ?? key) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/**
 * 构建导览 UI。
 * @param {Object} tourSystem TourSystem 实例
 * @param {Object} narrator   Narrator 实例（TTS；不支持时隐藏朗读按钮）
 * @returns {{ ttsOn: boolean }} 可被外部读取的开关状态
 */
export function buildTourUI(tourSystem, narrator) {
  const state = { ttsOn: true };

  // ── 目录面板：导览入口分组 ──
  const dirBody = document.getElementById('dir-body');
  if (dirBody) {
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = tt('tour.group');
    det.appendChild(sum);
    for (const tour of tourSystem.tours) {
      const btn = document.createElement('button');
      btn.className = 'dir-item';
      btn.innerHTML = `${tour.title} <span>${tt('tour.stops', { n: tour.checkpointCount })}</span>`;
      btn.addEventListener('click', () => {
        // 首次点击在用户手势链内，满足 iOS Safari 的 TTS 手势要求
        tourSystem.start(tour.id);
        refreshBar();
      });
      det.appendChild(btn);
    }
    dirBody.appendChild(det);
  }

  // ── 底部控制条（仅导览播放中显示）──
  const bar = document.createElement('div');
  bar.id = 'tour-bar';
  bar.style.display = 'none';
  bar.innerHTML = `
    <span id="tour-bar-title"></span>
    <button id="tour-bar-prev" title="${tt('tour.prev')}">⏮</button>
    <button id="tour-bar-next" title="${tt('tour.next')}">⏭</button>
    ${narrator?.supported ? '<button id="tour-bar-tts" title="TTS">🔊</button>' : ''}
    <button id="tour-bar-exit" title="${tt('tour.exit')}">✕</button>`;
  document.body.appendChild(bar);

  bar.querySelector('#tour-bar-prev').addEventListener('click', () => { tourSystem.prev(); refreshBar(); });
  bar.querySelector('#tour-bar-next').addEventListener('click', () => { tourSystem.next(); refreshBar(); });
  bar.querySelector('#tour-bar-exit').addEventListener('click', () => {
    tourSystem.skip();
    narrator?.stop?.();
    refreshBar();
  });
  bar.querySelector('#tour-bar-tts')?.addEventListener('click', (e) => {
    state.ttsOn = !state.ttsOn;
    e.target.textContent = state.ttsOn ? '🔊' : '🔇';
    if (!state.ttsOn) narrator?.stop?.();
  });

  function refreshBar() {
    const cur = tourSystem.current;
    if (!tourSystem.isActive || !cur) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const total = cur.checkpoint ? tourSystem.tours.find((x) => x.title === cur.title)?.checkpointCount : null;
    bar.querySelector('#tour-bar-title').textContent =
      `${cur.title} · ${tourSystem.checkpointIndex + 1}${total ? '/' + total : ''}`;
  }

  // 导览自动前进/结束无用户事件，低频轮询保持控制条同步
  setInterval(refreshBar, 800);
  return state;
}
