// 中文 HUD：仿真时间/倍率、导航状态、目标信息面板、上下文提示、帮助。

import { formatSpeed, formatDist, KM_PER_AU } from '../config.js';
import { surfaceGravity, rotationPeriodHours } from '../astro/bodies.js';
import { orbitalPeriodYears } from '../astro/planets.js';
import { factsFor } from './eduFacts.js';
import { t, bodyName, LANG } from './i18n.js';
import { DESC_EN } from './contentEn.js';

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
  // 倍率阶梯按符号对称：… −10x ← −1x ← +1x → +10x …
  // ] 恒向正方向走（负倍率时先降档，到 −1x 再按翻回 +1x）；[ 恒向负方向走
  warpUp() {
    if (this.warpSign < 0) {
      if (this.warpIndex === 0) this.warpSign = 1;
      else this.warpIndex--;
    } else {
      this.warpIndex = Math.min(WARP_LADDER.length - 1, this.warpIndex + 1);
    }
  }
  warpDown() {
    if (this.warpIndex === 0 && this.warpSign > 0) this.warpSign = -1;
    else if (this.warpSign < 0) this.warpIndex = Math.min(WARP_LADDER.length - 1, this.warpIndex + 1);
    else this.warpIndex--;
  }
  warpReset() { this.warpIndex = 0; this.warpSign = 1; }

  fmtWarp(clock) {
    if (clock.paused) return t('time.paused');
    const r = this.warpSign * WARP_LADDER[this.warpIndex];
    if (r === 1) return t('time.realtime');
    const a = Math.abs(r);
    const units = [
      [31557600, t('u.year')], [2592000, t('u.month')], [604800, t('u.week')],
      [86400, t('u.day')], [3600, t('u.hour')], [60, t('u.min')],
    ];
    for (const [s, u] of units) {
      if (a >= s) return `${r < 0 ? '−' : ''}${(a / s).toFixed(a % s ? 1 : 0)} ${u}${t('u.perSec')}`;
    }
    return `${r}×`;
  }

  updateTime(clock) {
    const d = clock.toDate();
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const warn = clock.inHighAccuracyRange() ? '' :
      `<div class="warn">${t('time.outOfRange')}</div>`;
    this.elTime.innerHTML =
      `<div class="big">${local}</div>` +
      `<div class="dim">${t('time.rate')} ${this.fmtWarp(clock)}　<span class="key">[</span>${t('time.k.minus')} <span class="key">]</span>${t('time.k.plus')} <span class="key">P</span>${t('time.k.pause')} <span class="key">N</span>${t('time.k.now')}</div>` + warn;
    const tcTimeEl = document.getElementById('tc-time-val');
    if (tcTimeEl) tcTimeEl.textContent = local;
  }

  updateNav({ mode, flight, speed, speedSetting, focusName, nearest, gravity }) {
    const modeTxt = flight ? t('nav.flight') :
      mode === 'orbit' ? t('nav.orbit') :
      mode === 'walk' ? t('nav.walk') : t('nav.fly');
    const rows = [`<div class="big">${modeTxt}</div>`];
    if (flight) {
      rows.push(`<div class="accent">${t('hud.flightTo', { name: flight.toName, p: Math.round(flight.t * 100) })}</div>`);
    } else if (mode === 'orbit') {
      if (focusName) rows.push(`<div>${t('hud.orbitFocus', { name: focusName })}</div>`);
    } else {
      rows.push(`<div>${t('hud.speed', { v: formatSpeed(speed) })}${mode === 'fly' ? t('hud.gear', { v: formatSpeed(speedSetting) }) : ''}</div>`);
    }
    if (nearest) {
      rows.push(`<div>${t('hud.nearest', { name: nearest.name, alt: formatDist(Math.max(nearest.distSurface, 0)) })}</div>`);
    }
    if (mode === 'walk' && gravity != null) {
      rows.push(`<div>${t('hud.surfaceGravity', { g: gravity.toFixed(2) })}</div>`);
    }
    if (mode === 'orbit' && !flight) {
      rows.push(`<div class="dim"><span class="key">F</span> ${t('hud.hintFly')}　<span class="key">T</span> ${t('hud.hintGoto')}</div>`);
    }
    this.elNav.innerHTML = rows.join('');
  }

  updateTarget(info) {
    if (!info) {
      this.elTarget.innerHTML = `<div class="dim">${t('tgt.none')}</div>`;
      return;
    }
    const rows = [];
    rows.push(`<div class="tname">${info.nameZh} <span class="dim">${info.nameEn}</span></div>`);
    rows.push(`<div>${t('tgt.dist', { d: formatDist(info.dist), lt: lightTime(info.dist) })}</div>`);
    if (info.dSun != null) rows.push(`<div>${t('tgt.dSun', { au: (info.dSun / KM_PER_AU).toFixed(3) })}</div>`);
    if (info.radiusKm) rows.push(`<div>${t('tgt.radius', { r: Math.round(info.radiusKm).toLocaleString() })}</div>`);
    if (info.gravity) rows.push(`<div>${t('tgt.gravity', { g: info.gravity.toFixed(2) })}</div>`);
    if (info.period) rows.push(`<div>${t('tgt.period', { p: info.period })}</div>`);
    if (info.rotation) rows.push(`<div>${t('tgt.rotation', { p: info.rotation })}</div>`);
    if (info.desc) rows.push(`<div class="desc">${info.desc}</div>`);
    // 科教知识卡片
    this._curId = info.id;
    if (info.id) {
      const facts = factsFor(info.id);
      const idx = (this.factIdx.get(info.id) ?? 0) % facts.length;
      rows.push(
        `<div class="fact">${t('tgt.fact')}${facts[idx]}` +
        (facts.length > 1 ? ` <span class="fact-next" data-nextfact>${t('tgt.factNext')}</span>` : '') +
        `</div>`
      );
    }
    rows.push(`<div class="accent">${t('tgt.goto')}</div>`);
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
    const fill = document.getElementById('start-btn-fill');
    const text = document.getElementById('start-btn-text');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (text) text.textContent = t('start.loading') + ' ' + pct + '%';
    if (fill) fill.style.width = pct + '%';
  }

  loadingDone() {
    const fill = document.getElementById('start-btn-fill');
    const text = document.getElementById('start-btn-text');
    const btn = document.getElementById('start-btn');
    if (fill) fill.style.width = '100%';
    if (text) text.textContent = t('start.enter');
    if (btn) {
      btn.disabled = false;
      btn.style.cursor = 'pointer';
    }
  }
}

/** 光行时间格式化（求知向：让用户直观感受太阳系尺度） */
function lightTime(km) {
  const s = km / 299792.458;
  if (s < 1) return `${(s * 1000).toFixed(0)} ${t('hud.lightMs')}`;
  if (s < 90) return `${s.toFixed(1)} ${t('hud.lightSec')}`;
  if (s < 5400) return `${(s / 60).toFixed(1)} ${t('hud.lightMin')}`;
  return `${(s / 3600).toFixed(1)} ${t('hud.lightHour')}`;
}

/** 目标信息组装 */
export function targetInfo(id, registry, dist, dSun = null) {
  const e = registry.get(id);
  if (!e) return null;
  // 英文界面：主名用英文、副名用中文；中文界面反之。
  const primary = bodyName(e);
  const secondary = LANG === 'zh' ? (e.nameEn ?? '') : e.nameZh;
  const descZh = e.desc ?? e.phys?.desc;
  const info = {
    id, nameZh: primary, nameEn: secondary, dist, dSun,
    radiusKm: e.phys?.radiusKm > 1 ? e.phys.radiusKm : null,
    desc: LANG === 'en' ? (DESC_EN[id] ?? descZh) : descZh,
  };
  if (e.phys?.gm && e.phys?.radiusKm) info.gravity = surfaceGravity(e.phys);
  if (e.kind === 'planet') {
    const y = orbitalPeriodYears(id);
    info.period = y < 2 ? `${(y * 365.25).toFixed(1)} ${t('u.day')}` : `${y.toFixed(1)} ${t('u.year')}`;
    const rh = rotationPeriodHours(id);
    if (rh) info.rotation = Math.abs(rh) > 48 ? `${(rh / 24).toFixed(1)} ${t('u.day')}` : `${rh.toFixed(1)} ${t('u.hour')}`;
  }
  return info;
}
