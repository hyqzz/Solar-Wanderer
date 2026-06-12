// Google Earth 式地点搜索（中/英文自动补全）+ 分类天体目录侧栏。
// 选中即触发 flyTo 飞行动画，满足"输入地点动态快速到达"的探索体验。

export class SearchUI {
  /**
   * @param registry Map<id, {nameZh, nameEn, kind, phys, parentId?}>
   * @param onGo (id) => void  飞往
   * @param opts { getOrbits:()=>bool, toggleOrbits:()=>void }
   */
  constructor(registry, onGo, opts = {}) {
    this.registry = registry;
    this.onGo = onGo;
    this.opts = opts;
    this.buildSearch();
    this.buildDirectory();
  }

  entries() {
    return [...this.registry.entries()].map(([id, t]) => ({
      id, zh: t.nameZh, en: (t.nameEn ?? '').toLowerCase(), kind: t.kind, parentId: t.parentId,
    }));
  }

  buildSearch() {
    const box = document.getElementById('search-box');
    const input = document.getElementById('search-input');
    const list = document.getElementById('search-results');
    let items = [];
    let sel = -1;

    const render = () => {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'search-item' + (i === sel ? ' active' : '');
        if (it.special === 'orbits') {
          const on = this.opts.getOrbits?.() ?? true;
          div.innerHTML = `<b>🛤 轨道线</b> <span>当前：${on ? '显示' : '隐藏'}</span><em>点击切换</em>`;
          div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.opts.toggleOrbits?.();
            render(); // 刷新状态文字，保持下拉打开
          });
        } else {
          const t = this.registry.get(it.id);
          div.innerHTML = `<b>${t.nameZh}</b> <span>${t.nameEn ?? ''}</span><em>${KIND_ZH[t.kind] ?? ''}</em>`;
          div.addEventListener('mousedown', (e) => { e.preventDefault(); go(it.id); });
        }
        list.appendChild(div);
      });
      list.style.display = items.length ? '' : 'none';
    };

    // 空查询默认列表：轨道线开关 + 热门目的地（点击搜索框即见）
    const showDefault = () => {
      const hot = ['earth', 'moon', 'mars', 'jupiter', 'saturn', 'halley', 'voyager1', 'heliopause']
        .filter((id) => this.registry.has(id))
        .map((id) => ({ id }));
      items = [{ special: 'orbits' }, ...hot];
      sel = -1;
      render();
    };

    const go = (id) => {
      input.value = '';
      items = []; sel = -1;
      render();
      input.blur();
      this.onGo(id);
    };

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { showDefault(); return; }
      items = this.entries()
        .filter((e) => e.zh.includes(q) || e.en.includes(q) || e.id.includes(q))
        .map((e) => ({ id: e.id }))
        .slice(0, 8);
      sel = items.length ? 0 : -1;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && sel >= 0 && items[sel].id) { go(items[sel].id); }
      else if (e.key === 'Escape') { input.value = ''; items = []; render(); input.blur(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
    input.addEventListener('focus', () => {
      if (!input.value.trim()) showDefault();
      else if (items.length) list.style.display = '';
    });
    box.style.display = '';
  }

  buildDirectory() {
    const panel = document.getElementById('directory');
    const toggle = document.getElementById('dir-toggle');
    toggle.addEventListener('click', () => {
      panel.classList.toggle('open');
    });

    const groups = [
      { title: '☀️ 恒星', filter: (t) => t.kind === 'star' },
      { title: '🪐 行星', filter: (t) => t.kind === 'planet' && t.phys?.type !== 'dwarf' },
      { title: '🧊 矮行星', filter: (t) => t.kind === 'planet' && t.phys?.type === 'dwarf' },
      { title: '🌙 卫星', filter: (t) => t.kind === 'moon', groupByParent: true },
      { title: '☄️ 彗星', filter: (t) => t.kind === 'comet' },
      { title: '🛰 探测器', filter: (t) => t.kind === 'probe' },
      { title: '🌌 日球层边界', filter: (t) => t.kind === 'boundary' },
    ];

    const body = document.getElementById('dir-body');
    body.innerHTML = '';
    for (const g of groups) {
      const ents = [...this.registry.entries()].filter(([, t]) => g.filter(t));
      if (!ents.length) continue;
      const det = document.createElement('details');
      det.open = g.title.includes('行星') && !g.title.includes('矮');
      const sum = document.createElement('summary');
      sum.textContent = `${g.title}（${ents.length}）`;
      det.appendChild(sum);
      let lastParent = null;
      for (const [id, t] of ents) {
        if (g.groupByParent && t.parentId !== lastParent) {
          lastParent = t.parentId;
          const ph = document.createElement('div');
          ph.className = 'dir-parent';
          ph.textContent = this.registry.get(t.parentId)?.nameZh ?? t.parentId;
          det.appendChild(ph);
        }
        const btn = document.createElement('button');
        btn.className = 'dir-item';
        btn.innerHTML = `${t.nameZh} <span>${t.nameEn ?? ''}</span>`;
        btn.addEventListener('click', () => this.onGo(id));
        det.appendChild(btn);
      }
      body.appendChild(det);
    }
  }
}

const KIND_ZH = {
  star: '恒星', planet: '行星', moon: '卫星', comet: '彗星', probe: '探测器', boundary: '边界', poi: '地标',
};
