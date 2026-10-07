// AI 导游 · 装配入口
//
// 设计原则（对应 PLAN.md M1）：
// - 依赖 window.__game 暴露的官方接口，轮询就绪后装配，对上游零侵入
//   （唯一改动：index.html 多加载本脚本一行）
// - 所有回复经字幕条显示 + TTS 朗读（工具层只操作场景，不发声）
// - 控制台调试口 window.__guide：dispatch / runTool / status / configureLLM

import { dispatch, configureLLM, llmConfigured } from './commander.js';
import { runTool, TOOLS } from './tools.js';
import { CATALOG, resolveBody, hydrateCatalog } from './catalog.js';
import { GuideMic } from './voice.js';
import { buildPanel } from './panel.js';

function whenAppReady(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    (function check() {
      if (window.__game?.flyTo && window.__game?.simClock && window.__game?.tourSystem) return resolve(window.__game);
      if (performance.now() - t0 > timeoutMs) return reject(new Error('等待应用就绪超时'));
      requestAnimationFrame(check);
    })();
  });
}

function speak(text) {
  const n = window.__game?.narrator;
  if (n?.supported && text && text.length <= 180) {
    try { n.speak(text, 'zh'); } catch { /* TTS 失败不影响功能 */ }
  }
}

async function boot() {
  try {
    await whenAppReady();
    const n = hydrateCatalog(window.__game.registry);
    console.info(`[AI导游] 天体目录已补全：+${n} 个运行时天体`);
  } catch (e) {
    console.warn('[AI导游]', e.message);
    return;
  }

  const mic = new GuideMic();
  const panel = buildPanel({
    mic,
    onCollapse: () => {},
  });
  mic._onResult = (text) => handle(text);
  mic._onState = (s) => {
    if (s === 'listening') panel.setListening(true);
    else if (s === 'mic-denied') panel.show('⚠️ 麦克风权限被拒绝，请在浏览器地址栏授权后重试。');
    else panel.setListening(false);
  };

  let busy = false;
  async function handle(text) {
    if (busy) return { reply: '导游正忙，稍等一句。', via: 'busy' };
    busy = true;
    panel.show(`🧑‍🚀 ${text}`);
    const r = await dispatch(text);
    panel.show(r.reply);
    speak(r.reply);
    busy = false;
    return r;
  }

  window.__guide = {
    dispatch: handle,
    runTool,
    configureLLM,
    llmConfigured,
    tools: TOOLS.map((t) => t.name),
    catalogSize: CATALOG.length,
    resolve: resolveBody,
    status() {
      const g = window.__game;
      return {
        mode: g.getMode?.(),
        focusId: g.orbitCam?.focusId,
        simDate: g.simClock.toDate().toISOString(),
        rateTarget: g.simClock.rateTarget,
        paused: g.simClock.paused,
        llm: llmConfigured(),
      };
    },
  };

  console.info('[AI导游] 就绪 —— 试试 window.__guide.dispatch("带我去土星")');
}

boot();
