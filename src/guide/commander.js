// AI 导游 · 指令层
//
// 设计原则（对应 PLAN.md §2.2）：
// - 路线 A（默认，离线可用）：中文规则解析 → 直接执行工具，零 API、零延迟
// - 路线 B（可选）：OpenAI 兼容 /chat/completions + function calling，未配置 key 自动降级
// - 对外只暴露 dispatch(text)：面板、语音、控制台共用同一入口

import { TOOL_SCHEMAS, runTool, RATE_PRESETS } from './tools.js';
import { resolveBody } from './catalog.js';

const LLM_KEY = 'solar-guide-llm';
const SYSTEM_PROMPT = [
  '你是"AI 导游"，活在浏览器端 1:1 实时太阳系模拟器里，负责陪用户探索太阳系。',
  '规则：',
  '1. 一切场景操作（飞行/时间/图层/导览）必须通过工具完成，绝不描述做不到的事；',
  '2. 讲解中的天文数字必须来自科教知识库或工具返回，绝不编造数值；',
  '3. 一次用户请求通常只需 1-2 个工具调用，先用工具再简短汇报；',
  '4. 用中文回答，亲切、简洁（不超过 3 句），像一位博学的朋友。',
].join('\n');

const CFG = loadCfg();
const history = [];

function loadCfg() {
  try { return JSON.parse(localStorage.getItem(LLM_KEY) || 'null'); } catch { return null; }
}

/** 配置 LLM（OpenAI 兼容接口）。baseUrl 示例：https://api.openai.com/v1 */
export function configureLLM({ baseUrl, apiKey, model }) {
  if (!baseUrl || !apiKey || !model) throw new Error('baseUrl / apiKey / model 均必填');
  const c = { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model };
  localStorage.setItem(LLM_KEY, JSON.stringify(c));
  CFG.baseUrl = c.baseUrl; CFG.apiKey = c.apiKey; CFG.model = c.model;
  return '已保存 LLM 配置。';
}

export function llmConfigured() { return !!(CFG?.baseUrl && CFG?.apiKey && CFG?.model); }

// ── 离线规则解析 ─────────────────────────────────────────────────────────

function parseSpeed(text) {
  const m = text.match(/([\d.]+)\s*(天|小时|周|月|年)\s*(?:每秒|\/秒|\/s|每秒钟)/) || text.match(/(?:每秒|每秒钟)\s*([\d.]+)\s*(天|小时|周|月|年)/);
  if (m) return { mult: Number(m[1]) * RATE_PRESETS[ { 天: 'day', 小时: 'hour', 周: 'week', 月: 'month', 年: 'year' }[m[2]] ] };
  if (/一秒(一|1)?天|一天一秒|1天\/秒/.test(text)) return { mult: RATE_PRESETS.day };
  if (/快进|加速|快一点/.test(text)) return { mult: text.includes('年') ? RATE_PRESETS.year : text.includes('月') ? RATE_PRESETS.month : RATE_PRESETS.day };
  if (/慢(一)?点|减速/.test(text)) return { mult: RATE_PRESETS.hour };
  return null;
}

function offlineParse(text) {
  const t = text.trim();
  if (!t) return null;
  if (/暂停|停一下时间|时间停/.test(t)) return { tool: 'pause_time', args: {} };
  if (/回到现在|现在时间|恢复实时|实时/.test(t)) return { tool: 'time_now', args: {} };
  const sp = parseSpeed(t);
  if (sp) return { tool: 'set_time_speed', args: { multiplier: sp.mult } };
  if (/轨道线.*隐藏|隐藏.*轨道线|关闭轨道/.test(t)) return { tool: 'show_orbit_lines', args: { visible: false } };
  if (/轨道线.*显示|显示.*轨道线|打开轨道/.test(t)) return { tool: 'show_orbit_lines', args: { visible: true } };
  if (/巨行星.*导览|导览.*巨行星/.test(t)) return { tool: 'start_tour', args: { tour_id: 'giants' } };
  if (/地月.*导览|导览.*地月/.test(t)) return { tool: 'start_tour', args: { tour_id: 'earth-moon' } };
  if (/导览|带我(逛|转|玩)(一)?(圈|遍)/.test(t)) return { tool: 'start_tour', args: { tour_id: 'backyard' } };
  if (/你在哪|现在在哪|状态|当前状态|where/i.test(t)) return { tool: 'get_status', args: {} };
  const introduce = t.match(/(?:介绍|讲讲|说说|介绍一下|什么是?)(.+)/);
  if (introduce) {
    const body = resolveBody(introduce[1]) ?? resolveBody(t);
    if (body) return { tool: 'introduce', args: { body: body.id } };
  }
  const fly = t.match(/(?:带我去|带我到|带我看看|去|飞到|飞往|飞向|前往|看看|跳到)\s*(.+)/);
  if (fly) {
    const body = resolveBody(fly[1]) ?? resolveBody(t);
    if (body) return { tool: 'fly_to', args: { body: body.id } };
  }
  // 全句就是一个天体名（如用户直接输入"土星"）
  const direct = resolveBody(t);
  if (direct && t.length <= direct.alias.length + 2) return { tool: 'fly_to', args: { body: direct.id } };
  return null;
}

// ── LLM 路线（OpenAI 兼容 + function calling）───────────────────────────

async function llmChat(userText) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-8),
    { role: 'user', content: userText },
  ];
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${CFG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.apiKey}` },
      body: JSON.stringify({ model: CFG.model, messages, tools: TOOL_SCHEMAS }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('LLM 返回为空');
    messages.push(msg);
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* 容错空参 */ }
        const out = await runTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
      }
      continue;
    }
    return msg.content ?? '';
  }
  return '（工具调用轮次达到上限，先到这里。）';
}

// ── 统一入口 ─────────────────────────────────────────────────────────────

/**
 * 处理一条自然语言指令。
 * @returns {Promise<{reply: string, via: 'offline'|'llm'|'error'}>}
 */
export async function dispatch(text) {
  let reply, via;
  try {
    const hit = offlineParse(text);
    if (hit) {
      reply = await runTool(hit.tool, hit.args);
      via = 'offline';
    } else if (llmConfigured()) {
      reply = (await llmChat(text)) || '（空回复）';
      via = 'llm';
    } else {
      reply = [
        '这个我还不会（离线模式）。试试：',
        '「带我去土星」「介绍月球」「快进1天每秒」「暂停时间」「回到现在」',
        '「开始导览」「显示轨道线」「你在哪」——或在面板右上角配置 LLM 解锁自由对话。',
      ].join('\n');
      via = 'offline';
    }
  } catch (e) {
    console.warn('[AI导游] 指令处理失败', e);
    reply = `出错了：${e?.message ?? e}`;
    via = 'error';
  }
  history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
  if (history.length > 20) history.splice(0, history.length - 20);
  return { reply, via };
}
