// AI 导游 · 天体目录（别名 → bodyId）
//
// 设计原则：
// - 基于 astro/bodies.js 的权威 ID 表 + i18n 的本地化名，零硬编码重复
// - 中文口语别名（如"月亮""土星环""我们的星球"）手动补充，越长优先级越高
// - 供离线指令解析与 LLM 工具参数校验共用

import { BODIES } from '../astro/bodies.js';

/** 天体中文名：先查静态 BODIES（主天体），再查运行时注册表（卫星等），最后回退 id */
const RUNTIME_NAMES = new Map();

export function nameOf(id) {
  const e = BODIES[id];
  if (e) return e.nameZh ?? e.nameEn ?? id;
  return RUNTIME_NAMES.get(id) ?? id;
}

/** 手工补充的口语别名（id → 额外别名数组） */
const EXTRA_ALIASES = {
  sun: ['太阳', '恒星'],
  earth: ['地球', '我们的星球', '蓝色弹珠', '家园'],
  moon: ['月亮', '月球'],
  mars: ['火星', '红色星球', '荧惑'],
  jupiter: ['木星', '岁星'],
  saturn: ['土星', '土星环', '带环的'],
  mercury: ['水星'],
  venus: ['金星', '启明星', '长庚星'],
  uranus: ['天王星'],
  neptune: ['海王星'],
  pluto: ['冥王星'],
  io: ['木卫一', '艾奥'],
  europa: ['木卫二', '欧罗巴'],
  ganymede: ['木卫三', '盖尼米德'],
  callisto: ['木卫四', '卡利斯托'],
  titan: ['土卫六', '泰坦'],
  enceladus: ['土卫二', '恩克拉多斯'],
  triton: ['海卫一', '特里同'],
  charon: ['冥卫一', '卡戎'],
  phobos: ['火卫一'],
  deimos: ['火卫二'],
};

/** bodyId → 别名数组（本地化名在前，附加别名在后），并建"别名 → id"反查表 */
const NAME_TO_ID = new Map();
export const CATALOG = [];

for (const id of Object.keys(BODIES)) {
  const names = new Set();
  const localized = nameOf(id);
  if (localized && localized !== id) names.add(localized);
  for (const a of EXTRA_ALIASES[id] ?? []) names.add(a);
  if (!names.size) names.add(id);
  const list = [...names];
  CATALOG.push({ id, names: list });
  for (const n of list) {
    if (!NAME_TO_ID.has(n) || n.length > NAME_TO_ID.get(n).alias.length) {
      NAME_TO_ID.set(n, { id, alias: n });
    }
  }
}

/** 从自然语言片段中解析天体（最长别名优先），找不到返回 null */
export function resolveBody(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  let best = null;
  for (const [alias, hit] of NAME_TO_ID) {
    if (t.includes(alias.toLowerCase()) && (!best || alias.length > best.alias.length)) {
      best = { ...hit };
    }
  }
  return best ? { id: best.id, alias: best.alias } : null;
}

/** 全部天体 id（供 LLM 枚举校验） */
export const BODY_IDS = Object.keys(BODIES);

/**
 * 用运行时注册表补全目录（卫星/彗星/探测器不在静态 BODIES 表里）。
 * 在应用就绪后由装配层调用一次：window.__game.registry 是 Map<id, {nameZh, nameEn, ...}>
 */
export function hydrateCatalog(registry) {
  if (!registry || typeof registry.entries !== 'function') return 0;
  let added = 0;
  for (const [id, e] of registry.entries()) {
    if (CATALOG.some((c) => c.id === id)) continue;
    RUNTIME_NAMES.set(id, e?.nameZh ?? e?.nameEn ?? id);
    const names = new Set();
    for (const n of [e?.nameZh, e?.nameEn, id]) if (n) names.add(n);
    for (const a of EXTRA_ALIASES[id] ?? []) names.add(a);
    const list = [...names];
    CATALOG.push({ id, names: list, runtime: true });
    for (const n of list) {
      if (!NAME_TO_ID.has(n) || n.length > NAME_TO_ID.get(n).alias.length) {
        NAME_TO_ID.set(n, { id, alias: n });
      }
    }
    added++;
  }
  return added;
}
