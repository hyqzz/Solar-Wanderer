// 语音旁白系统（#41）：基于 Web Speech API (speechSynthesis) 朗读导览旁白文本。
//
// 设计原则：
// - 浏览器原生 API，零依赖；不支持时优雅降级为纯文本（TourSystem 的 HUD tip 已覆盖）
// - 多语言语音选择：根据 LANG 匹配 BCP-47 语音标签（zh→zh-CN, en→en-US 等）
// - 移动端兼容：iOS Safari 要求 speak() 在用户交互事件链内首次调用；
//   Chrome 移动版 voices 异步加载，需监听 voiceschanged 事件
// - 速率可调（0.1–10），默认 1.0；导览旁白建议 0.9（稍慢，便于理解）

import { LANG } from './i18n.js';

/** 项目语言代码 → BCP-47 语音标签（speechSynthesis 约定） */
const LANG_TO_BCP47 = {
  zh: 'zh-CN',
  en: 'en-US',
  es: 'es-ES',
  ja: 'ja-JP',
  fr: 'fr-FR',
  de: 'de-DE',
  ru: 'ru-RU',
};

/**
 * 语音旁白播放器：封装 speechSynthesis，提供 speak/stop/pause/resume 控制。
 *
 * 使用方式：
 *   const narrator = new Narrator();
 *   if (narrator.supported) narrator.speak('你好，世界', 'zh');
 *
 * 移动端注意：首次 speak() 必须在用户手势（click/touchend）的事件链内调用，
 * 否则 iOS Safari 会静默拒绝。后续 speak 调用无此限制。
 */
export class Narrator {
  constructor() {
    // 在 Node/SSR 环境下 window 不存在，安全降级
    this._synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this._utteranceCtor = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null;
    this._voices = [];
    this._rate = 1;
    this._volume = 1;
    this._pitch = 1;
    this._currentUtterance = null;
    this._paused = false;

    if (this._synth) {
      this._loadVoices();
      // Chrome / Edge 异步加载语音列表：首次 getVoices() 返回空，
      // 浏览器就绪后触发 voiceschanged 事件。必须监听才能拿到完整列表。
      this._synth.onvoiceschanged = () => this._loadVoices();
    }
  }

  /** 浏览器是否支持 Web Speech API。 */
  get supported() {
    return !!this._synth && !!this._utteranceCtor;
  }

  /** 是否正在朗读。 */
  get speaking() {
    return this._synth ? this._synth.speaking && !this._synth.paused : false;
  }

  /** 是否已暂停。 */
  get paused() {
    return this._paused;
  }

  /** 可用语音列表。 */
  get voices() {
    return this._voices;
  }

  /**
   * 朗读文本。
   * @param {string} text 朗读内容
   * @param {string} [lang] 语言代码（zh/en/es/ja/fr/de/ru），默认取当前界面语言
   */
  speak(text, lang = LANG) {
    if (!this.supported || !text) return;
    // 先取消正在进行的朗读（speechSynthesis 不支持队列插队，必须 cancel 重来）
    this.stop();

    const utterance = new this._utteranceCtor(text);
    utterance.lang = LANG_TO_BCP47[lang] || lang || 'en-US';
    utterance.rate = this._rate;
    utterance.volume = this._volume;
    utterance.pitch = this._pitch;

    // 匹配语音：优先精确匹配 BCP-47，退而求其次匹配语言前缀
    const voice = this._findVoice(utterance.lang);
    if (voice) utterance.voice = voice;

    // 朗读结束清理状态
    utterance.onend = () => {
      if (this._currentUtterance === utterance) this._currentUtterance = null;
      this._paused = false;
    };
    utterance.onerror = () => {
      if (this._currentUtterance === utterance) this._currentUtterance = null;
      this._paused = false;
    };

    this._currentUtterance = utterance;
    this._paused = false;
    this._synth.speak(utterance);
  }

  /** 停止朗读并清空队列。 */
  stop() {
    if (this._synth) this._synth.cancel();
    this._currentUtterance = null;
    this._paused = false;
  }

  /** 暂停朗读（可 resume 恢复）。 */
  pause() {
    if (this._synth && this._synth.speaking && !this._synth.paused) {
      this._synth.pause();
      this._paused = true;
    }
  }

  /** 恢复暂停的朗读。 */
  resume() {
    if (this._synth && this._synth.paused) {
      this._synth.resume();
      this._paused = false;
    }
  }

  /**
   * 设置朗读速率。
   * @param {number} rate 0.1（极慢）– 10（极快），默认 1.0。导览旁白建议 0.85–1.0。
   */
  setRate(rate) {
    this._rate = Math.max(0.1, Math.min(10, rate));
  }

  /**
   * 设置音量。
   * @param {number} volume 0（静音）– 1（最大），默认 1.0。
   */
  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 设置音调。
   * @param {number} pitch 0（极低）– 2（极高），默认 1.0。
   */
  setPitch(pitch) {
    this._pitch = Math.max(0, Math.min(2, pitch));
  }

  // ── 内部 ──────────────────────────────────────────────────────────

  _loadVoices() {
    if (this._synth) {
      this._voices = this._synth.getVoices() || [];
    }
  }

  /**
   * 查找匹配语言的语音。
   * 策略：先精确匹配 BCP-47（如 zh-CN），再按语言前缀（如 zh）模糊匹配。
   * @param {string} langTag BCP-47 标签，如 'zh-CN'
   * @returns {SpeechSynthesisVoice|null}
   */
  _findVoice(langTag) {
    if (!this._voices.length) return null;
    const tag = langTag.toLowerCase();
    // 精确匹配（zh-CN == zh-cn）
    let voice = this._voices.find((v) => v.lang.toLowerCase() === tag);
    if (voice) return voice;
    // 语言前缀匹配（zh-CN → zh）
    const prefix = tag.split('-')[0];
    voice = this._voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    return voice || null;
  }
}
