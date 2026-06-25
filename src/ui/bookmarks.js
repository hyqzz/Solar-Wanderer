// 本地书签管理（#52）：将当前位置 / 时间 / 焦点持久化到 localStorage，
// 支持命名书签列表、加载 / 删除、导出 / 导入 JSON。
//
// 设计原则：
// - 纯数据层，不依赖 DOM / Three.js，方便测试与复用。
// - state 格式与 main.js 的 URL hash 书签（applyLocationHash / copyShareUrl）对齐，
//   额外保留 posKm 与 mode 以覆盖 fly / walk 模式（URL hash 仅编码 orbit 状态）。
// - localStorage 不可用时静默降级（内存模式），不抛异常阻断应用。

const STORAGE_KEY = 'solar-wanderer:bookmarks';
const SCHEMA_VERSION = 1;

/** 生成短唯一 ID（时间 + 随机，无外部依赖） */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class Bookmarks {
  constructor() {
    /** @type {Array<{id,name,state,created}>} */
    this._items = [];
    this._load();
  }

  // ── 持久化 ──────────────────────────────────────────────────────────

  /** 从 localStorage 加载；失败时降级为空列表（不阻断应用） */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      // 兼容：直接是数组（旧格式）或 { version, items }（新格式）
      const items = Array.isArray(data) ? data : data?.items;
      if (Array.isArray(items)) this._items = items;
    } catch {
      // JSON 解析失败或 localStorage 不可用 → 空列表
      this._items = [];
    }
  }

  /** 写入 localStorage；失败时静默（内存模式仍可用） */
  _persist() {
    try {
      const payload = JSON.stringify({ version: SCHEMA_VERSION, items: this._items });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      // 配额超限 / 隐私模式 → 仅保留内存副本
    }
  }

  // ── 公开 API ────────────────────────────────────────────────────────

  /**
   * 保存当前状态为命名书签。
   * @param {string} name 书签名称
   * @param {{posKm:number[], focusId:string, lat:number, lon:number, dist:number, jdTT:number, mode:string}} state
   * @returns {string} 新书签 ID
   */
  save(name, state) {
    // posKm 可能是 Float64Array → 转普通数组以便 JSON 序列化
    const cleanState = {
      ...state,
      posKm: state.posKm
        ? Array.from(state.posKm)
        : undefined,
    };
    const bookmark = {
      id: genId(),
      name: name || `Bookmark ${this._items.length + 1}`,
      state: cleanState,
      created: Date.now(),
    };
    this._items.push(bookmark);
    this._persist();
    return bookmark.id;
  }

  /**
   * 按 ID 加载书签。
   * @param {string} id
   * @returns {{id,name,state,created}|null}
   */
  load(id) {
    return this._items.find((b) => b.id === id) ?? null;
  }

  /** 返回所有书签（按创建时间降序，最新的在前） */
  list() {
    return [...this._items].sort((a, b) => b.created - a.created);
  }

  /**
   * 按 ID 删除书签。
   * @returns {boolean} 是否删除成功
   */
  delete(id) {
    const idx = this._items.findIndex((b) => b.id === id);
    if (idx < 0) return false;
    this._items.splice(idx, 1);
    this._persist();
    return true;
  }

  /** 清空所有书签 */
  clear() {
    this._items = [];
    this._persist();
  }

  /**
   * 导出全部书签为 JSON 字符串（可用于文件下载 / 分享）。
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(
      { version: SCHEMA_VERSION, exported: Date.now(), items: this._items },
      null,
      2,
    );
  }

  /**
   * 从 JSON 字符串导入书签（合并，跳过 ID 重复项）。
   * @param {string} json exportJSON() 产生的字符串
   * @returns {number} 实际导入的书签数
   * @throws {Error} 格式无效时抛出
   */
  importJSON(json) {
    const data = JSON.parse(json);
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) {
      throw new Error('Invalid bookmark JSON: expected array or {items:[]}');
    }
    let count = 0;
    for (const b of items) {
      // 基本字段校验
      if (!b || !b.id || !b.state) continue;
      // 跳过已存在的 ID
      if (this._items.some((e) => e.id === b.id)) continue;
      this._items.push({
        id: b.id,
        name: b.name || 'Imported',
        state: b.state,
        created: b.created || Date.now(),
      });
      count++;
    }
    this._persist();
    return count;
  }
}
