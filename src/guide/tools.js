// AI 导游 · 工具层
//
// 设计原则（对应 PLAN.md §2.1）：
// - LLM / 离线解析器只能通过这套白名单工具操作场景，不直接碰渲染代码
// - 每个工具 = { name, description, parameters(JSON Schema), run(args) → string }
// - run 返回字符串：既是给用户的回执，也是回喂 LLM 的 tool result
// - 只依赖 window.__game 暴露的官方接口，对上游零侵入

import { resolveBody, BODY_IDS, nameOf, hydrateCatalog } from './catalog.js';
import { factsFor } from '../ui/eduFacts.js';

const RATE_PRESETS = {
  real: 1,
  hour: 3600,        // 1 秒 = 1 小时
  day: 86400,        // 1 秒 = 1 天
  week: 604800,
  month: 2592000,    // 1 秒 = 30 天
  year: 31536000,    // 1 秒 = 1 年
};

function g() { return window.__game; }

function fmtDate(d) {
  try {
    return d.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
}

export const TOOLS = [
  {
    name: 'fly_to',
    description: '飞向指定天体并聚焦。body 必须是目录中的天体 id。',
    parameters: {
      type: 'object',
      properties: { body: { type: 'string', description: `天体 id，可选值：${BODY_IDS.join(', ')}` } },
      required: ['body'],
    },
    run({ body }) {
      const reg = g().registry;
      const hit = resolveBody(body) ?? (BODY_IDS.includes(body) || reg?.has?.(body) ? { id: body } : null);
      if (!hit) return `未找到天体"${body}"。可用：${BODY_IDS.join(', ')} 等（含全部卫星）。`;
      g().select(hit.id);
      g().flyTo(hit.id);
      return `正在飞向${nameOf(hit.id)}（${hit.id}）。`;
    },
  },
  {
    name: 'introduce',
    description: '语音+字幕介绍指定天体的科普知识（来自科教知识库，含 NASA 来源）。body 缺省时介绍当前聚焦天体。',
    parameters: {
      type: 'object',
      properties: { body: { type: 'string', description: '天体 id，可省略' } },
    },
    run({ body } = {}) {
      const id = (resolveBody(body)?.id) ?? g().orbitCam?.focusId ?? 'earth';
      const facts = factsFor(id);
      if (!facts?.length) return `暂时没有${nameOf(id)}的资料。`;
      // 朗读由装配层统一处理（index.js speak()），工具层只负责取材
      return `${nameOf(id)}：${facts[Math.floor(Math.random() * facts.length)]}`;
    },
  },
  {
    name: 'set_time_speed',
    description: '设置时间流速。multiplier 为"1 现实秒 = multiplier 仿真秒"，如 86400 表示 1 秒 = 1 天。',
    parameters: {
      type: 'object',
      properties: { multiplier: { type: 'number', description: '倍率，1=实时，86400=1秒1天，最大 31536000' } },
      required: ['multiplier'],
    },
    run({ multiplier }) {
      const m = Math.max(-31536000, Math.min(31536000, Number(multiplier) || 1));
      const c = g().simClock;
      c.paused = false;
      c.rateTarget = m;
      const desc = Math.abs(m) < 2 ? '实时' : `1 秒 ≈ ${Math.abs(m) >= 86400 ? (Math.abs(m) / 86400).toFixed(m % 86400 ? 1 : 0) + ' 天' : Math.round(Math.abs(m)) + ' 秒'}`;
      return `时间流速已设为${desc}。`;
    },
  },
  {
    name: 'pause_time',
    description: '暂停时间流动。',
    parameters: { type: 'object', properties: {} },
    run() { g().simClock.paused = true; return '时间已暂停。'; },
  },
  {
    name: 'time_now',
    description: '时间回到此刻，并恢复实时流速。',
    parameters: { type: 'object', properties: {} },
    run() { const c = g().simClock; c.setNow(); c.rateTarget = 1; c.paused = false; return '已回到现在，流速恢复实时。'; },
  },
  {
    name: 'start_tour',
    description: '播放内置导览剧本。可选：backyard（太阳系尺度之旅）、earth-moon（地月之间）、giants（巨行星）。',
    parameters: {
      type: 'object',
      properties: { tour_id: { type: 'string', enum: ['backyard', 'earth-moon', 'giants'], description: '导览 id，默认 backyard' } },
    },
    run({ tour_id } = {}) {
      const id = tour_id || 'backyard';
      g().tourSystem?.start(id);
      return `已开始导览：${id}。`;
    },
  },
  {
    name: 'show_orbit_lines',
    description: '显示或隐藏轨道线。',
    parameters: {
      type: 'object',
      properties: { visible: { type: 'boolean' } },
      required: ['visible'],
    },
    run({ visible }) { g().setOrbitLinesVisible(!!visible); return visible ? '轨道线已显示。' : '轨道线已隐藏。'; },
  },
  {
    name: 'get_status',
    description: '获取当前状态：模式、聚焦天体、仿真时刻、时间流速。',
    parameters: { type: 'object', properties: {} },
    run() {
      const g_ = g();
      const mode = { orbit: '轨道视角', fly: '自由飞行', walk: '地表行走' }[g_.getMode?.()] ?? '未知';
      const focus = g_.orbitCam?.focusId ? nameOf(g_.orbitCam.focusId) : '——';
      const rate = g_.simClock.rateTarget;
      const speed = rate === 1 ? '实时' : `1 秒 ≈ ${Math.round(Math.abs(rate)).toLocaleString('zh-CN')} 仿真秒`;
      return `当前模式：${mode}；聚焦：${focus}；仿真时刻：${fmtDate(g_.simClock.toDate())}；流速：${g_.simClock.paused ? '已暂停' : speed}。`;
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** 按名执行工具，异常安全；返回字符串回执 */
export async function runTool(name, args = {}) {
  const t = BY_NAME.get(name);
  if (!t) return `未知工具：${name}`;
  try {
    return await t.run(args);
  } catch (e) {
    console.warn('[AI导游] 工具执行失败', name, e);
    return `工具 ${name} 执行失败：${e?.message ?? e}`;
  }
}

/** OpenAI function-calling 格式的工具定义 */
export const TOOL_SCHEMAS = TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export { RATE_PRESETS };
