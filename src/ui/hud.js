// 中文 HUD：仿真时间/倍率、导航状态、目标信息面板、上下文提示、帮助。

import { formatSpeed, formatDist, KM_PER_AU } from '../config.js';
import { surfaceGravity, rotationPeriodHours } from '../astro/bodies.js';
import { orbitalPeriodYears } from '../astro/planets.js';
import { factsFor } from './eduFacts.js';

const WARP_LADDER = [1, 10, 60, 600, 3600, 21600, 86400, 604800, 2592000, 31557600, 315576000];

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.elTime = document.getElementById('hud-time');
    this.elNav = document.getElementById('hud-nav');
    this.elTarget = document.getElementById('hud-target');
    this.elTip = document.getElementById('hud-tip');
    this.help = document.getElementById('help');
    this.start = document.getElementById('start');
    this.warpIndex = 0;
    this.warpSign = 1;
    // 科教知识卡片：按天体记忆当前条目索引；"换一条"事件委托
    this.factIdx = new Map();
    this.elTarget.addEventListener('click', (e) => {
      if (e.target.dataset?.nextfact !== undefined && this._curId) {
        this.factIdx.set(this._curId, (this.factIdx.get(this._curId) ?? 0) + 1);
      }
    });
  }

  warpRate(paused) {
    return paused ? 0 : this.warpSign * WARP_LADDER[this.warpIndex];
  }
  warpUp() { this.warpIndex = Math.min(WARP_LADDER.length - 1, this.warpIndex + 1); }
  warpDown() {
    if (this.warpIndex === 0 && this.warpSign > 0) this.warpSign = -1;
    else if (this.warpSign < 0) this.warpIndex = Math.min(WARP_LADDER.length - 1, this.warpIndex + 1);
    else this.warpIndex--;
  }
  warpReset() { this.warpIndex = 0; this.warpSign = 1; }

  fmtWarp(clock) {
    if (clock.paused) return '⏸ 已暂停';
    const r = this.warpSign * WARP_LADDER[this.warpIndex];
    if (r === 1) return '1×（实时）';
    const a = Math.abs(r);
    const units = [[31557600, '年'], [2592000, '月'], [604800, '周'], [86400, '天'], [3600, '小时'], [60, '分钟']];
    for (const [s, u] of units) {
      if (a >= s) return `${r < 0 ? '−' : ''}${(a / s).toFixed(a % s ? 1 : 0)} ${u}/秒`;
    }
    return `${r}×`;
  }

  updateTime(clock) {
    const d = clock.toDate();
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const warn = clock.inHighAccuracyRange() ? '' :
      '<div class="warn">⚠ 超出星历高精度范围(1800–2050)</div>';
    this.elTime.innerHTML =
      `<div class="big">${local}</div>` +
      `<div class="dim">时间倍率 ${this.fmtWarp(clock)}　<span class="key">[</span>减 <span class="key">]</span>加 <span class="key">P</span>暂停 <span class="key">N</span>现在</div>` + warn;
  }

  updateNav({ mode, flight, speed, speedSetting, focusName, nearest, gravity }) {
    const modeTxt = flight ? '✈ 飞行动画' :
      mode === 'orbit' ? '🌐 探索（拖拽·滚轮·双击前往）' :
      mode === 'walk' ? '🚶 地表行走' : '🚀 自由飞行';
    const rows = [`<div class="big">${modeTxt}</div>`];
    if (flight) {
      rows.push(`<div class="accent">前往 ${flight.toName}　${Math.round(flight.t * 100)}%</div>`);
    } else if (mode === 'orbit') {
      if (focusName) rows.push(`<div>环绕焦点：${focusName}</div>`);
    } else {
      rows.push(`<div>速度 ${formatSpeed(speed)}${mode === 'fly' ? `　档位 ${formatSpeed(speedSetting)}（滚轮调节）` : ''}</div>`);
    }
    if (nearest) {
      rows.push(`<div>最近天体：${nearest.nameZh}　高度 ${formatDist(Math.max(nearest.distSurface, 0))}</div>`);
    }
    if (mode === 'walk' && gravity != null) {
      rows.push(`<div>表面重力 ${gravity.toFixed(2)} m/s²</div>`);
    }
    if (mode === 'orbit' && !flight) {
      rows.push(`<div class="dim"><span class="key">F</span> 自由飞行　<span class="key">T</span> 前往所选</div>`);
    }
    this.elNav.innerHTML = rows.join('');
  }

  updateTarget(info) {
    if (!info) {
      this.elTarget.innerHTML = '<div class="dim">未选择目标 — 单击标签选中，双击/搜索/目录前往<br>数字键 1-9/0 直达行星</div>';
      return;
    }
    const rows = [];
    rows.push(`<div class="tname">${info.nameZh} <span class="dim">${info.nameEn}</span></div>`);
    rows.push(`<div>距你 ${formatDist(info.dist)}　<span class="dim">光行 ${lightTime(info.dist)}</span></div>`);
    if (info.dSun != null) rows.push(`<div>距太阳 ${(info.dSun / KM_PER_AU).toFixed(3)} AU</div>`);
    if (info.radiusKm) rows.push(`<div>半径 ${Math.round(info.radiusKm).toLocaleString()} km</div>`);
    if (info.gravity) rows.push(`<div>表面重力 ${info.gravity.toFixed(2)} m/s²</div>`);
    if (info.period) rows.push(`<div>公转周期 ${info.period}</div>`);
    if (info.rotation) rows.push(`<div>自转周期 ${info.rotation}</div>`);
    if (info.desc) rows.push(`<div class="desc">${info.desc}</div>`);
    // 科教知识卡片
    this._curId = info.id;
    if (info.id) {
      const facts = factsFor(info.id);
      const idx = (this.factIdx.get(info.id) ?? 0) % facts.length;
      rows.push(
        `<div class="fact">📚 <b>你知道吗</b>　${facts[idx]}` +
        (facts.length > 1 ? ` <span class="fact-next" data-nextfact>换一条 ↻</span>` : '') +
        `</div>`
      );
    }
    rows.push(`<div class="accent"><span class="key">T</span> 前往（GE 式飞行）</div>`);
    this.elTarget.innerHTML = rows.join('');
  }

  tip(text) {
    this.elTip.textContent = text ?? '';
    this.elTip.style.display = text ? '' : 'none';
  }

  toggleHelp() {
    this.help.style.display = this.help.style.display === 'none' ? '' : 'none';
  }

  hideStart() {
    if (this.start) this.start.style.display = 'none';
  }

  setLoading(done, total) {
    const el = document.getElementById('loading-progress');
    if (el) el.textContent = `加载真实行星贴图… ${done}/${total}`;
  }

  loadingDone() {
    const el = document.getElementById('loading');
    if (el) el.style.display = 'none';
    const btn = document.getElementById('start-btn');
    if (btn) btn.style.display = '';
  }
}

/** 光行时间格式化（求知向：让用户直观感受太阳系尺度） */
function lightTime(km) {
  const s = km / 299792.458;
  if (s < 1) return `${(s * 1000).toFixed(0)} 毫秒`;
  if (s < 90) return `${s.toFixed(1)} 秒`;
  if (s < 5400) return `${(s / 60).toFixed(1)} 分钟`;
  return `${(s / 3600).toFixed(1)} 小时`;
}

/** 目标信息组装 */
export function targetInfo(id, registry, dist, dSun = null) {
  const t = registry.get(id);
  if (!t) return null;
  const info = {
    id, nameZh: t.nameZh, nameEn: t.nameEn ?? '', dist, dSun,
    radiusKm: t.phys?.radiusKm > 1 ? t.phys.radiusKm : null,
    desc: t.desc ?? t.phys?.desc,
  };
  if (t.phys?.gm && t.phys?.radiusKm) info.gravity = surfaceGravity(t.phys);
  if (t.kind === 'planet') {
    const y = orbitalPeriodYears(id);
    info.period = y < 2 ? `${(y * 365.25).toFixed(1)} 天` : `${y.toFixed(1)} 年`;
    const rh = rotationPeriodHours(id);
    if (rh) info.rotation = Math.abs(rh) > 48 ? `${(rh / 24).toFixed(1)} 天` : `${rh.toFixed(1)} 小时`;
  }
  return info;
}
