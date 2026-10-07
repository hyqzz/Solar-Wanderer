// AI 导游 · 语音输入（ASR）
//
// 设计原则：
// - 基于 webkitSpeechRecognition（Chrome/Edge），zh-CN 连续识别
// - 不支持的环境优雅降级：supported=false，面板隐藏话筒
// - 说话期间面板显示"正在聆听…"，结果回调解给 commander

export class GuideMic {
  constructor({ onResult, onState } = {}) {
    this._onResult = onResult;
    this._onState = onState;
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    this.supported = !!SR;
    if (!this.supported) return;
    this._rec = new SR();
    this._rec.lang = 'zh-CN';
    this._rec.interimResults = true;
    this._rec.continuous = false;
    this._rec.maxAlternatives = 1;
    this._listening = false;
    this._rec.onresult = (e) => {
      let finalText = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) this._onState?.(`🎧 ${interim}`);
      if (finalText.trim()) this._onResult?.(finalText.trim());
    };
    this._rec.onend = () => { this._listening = false; this._onState?.('idle'); };
    this._rec.onerror = (e) => {
      this._listening = false;
      this._onState?.('idle');
      if (e.error === 'not-allowed') this._onState?.('mic-denied');
    };
  }

  get listening() { return this._listening; }

  toggle() {
    if (!this.supported) return false;
    if (this._listening) { this._rec.stop(); this._listening = false; this._onState?.('idle'); return false; }
    try {
      this._rec.start(); // iOS/Chrome 要求在用户手势事件链内首次调用
      this._listening = true;
      this._onState?.('listening');
      return true;
    } catch { /* 已在运行等瞬态错误 */ return false; }
  }
}
