// 教师工具包（#42）：为课堂场景提供课程计划生成、课堂模式同步、Q&A 高亮。
//
// 设计原则：
// - 课程计划：纯文本大纲，可复制粘贴到教案/课件，无需联网
// - 课堂模式：基于现有 URL 书签功能（main.js 的 #focusId,lat,lon,dist,jd），
//   附加 tour 参数让全班同步跟随导览
// - Q&A 模式：教师提问 → select + flyTo 高亮目标天体，学生视觉聚焦
// - 离线包说明：文档化如何打包离线版本（Vite 构建产物为纯静态文件）

import { LANG } from './i18n.js';
import { TOURS } from './tours.js';

// ── 教师工具 UI 文案 ──────────────────────────────────────────────────
const UI = {
  'teacher.lessonTitle': { zh: '课程计划', en: 'Lesson Plan', es: 'Plan de lección', ja: 'レッスンプラン', fr: 'Plan de cours', de: 'Unterrichtsplan', ru: 'План урока' },
  'teacher.duration':   { zh: '停留', en: 'Duration', es: 'Duración', ja: '滞在', fr: 'Durée', de: 'Dauer', ru: 'Длительность' },
  'teacher.action':     { zh: '动作', en: 'Action', es: 'Acción', ja: 'アクション', fr: 'Action', de: 'Aktion', ru: 'Действие' },
  'teacher.totalDuration': { zh: '总时长', en: 'Total duration', es: 'Duración total', ja: '総時間', fr: 'Durée totale', de: 'Gesamtdauer', ru: 'Общая длительность' },
  'teacher.checkpoints': { zh: '检查点', en: 'Checkpoints', es: 'Puntos de control', ja: 'チェックポイント', fr: 'Points de contrôle', de: 'Kontrollpunkte', ru: 'Контрольные точки' },
  'teacher.classroomUrl': { zh: '课堂同步链接', en: 'Classroom sync URL', es: 'URL de sincronización', ja: 'クラス同期URL', fr: 'URL de synchronisation', de: 'Sync-URL', ru: 'URL синхронизации' },
  'teacher.classroomCopied': { zh: '📋 课堂同步链接已复制到剪贴板', en: '📋 Classroom sync URL copied to clipboard', es: '📋 URL copiada', ja: '📋 同期URLをコピー', fr: '📋 URL copiée', de: '📋 URL kopiert', ru: '📋 URL скопирован' },
  'teacher.askHighlight': { zh: '🎯 高亮：{name}', en: '🎯 Highlight: {name}', es: '🎯 Destacar: {name}', ja: '🎯 ハイライト：{name}', fr: '🎯 Surligner : {name}', de: '🎯 Hervorheben: {name}', ru: '🎯 Подсветить: {name}' },
  'teacher.offlineTitle': { zh: '离线使用说明', en: 'Offline usage', es: 'Uso sin conexión', ja: 'オフライン使用', fr: 'Utilisation hors ligne', de: 'Offline-Nutzung', ru: 'Автономное использование' },
};

function tt(key, vars) {
  const e = UI[key];
  let s = e ? (e[LANG] ?? e.en ?? e.zh ?? key) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/** action 类型本地化标签 */
const ACTION_LABELS = {
  flyTo:   { zh: '飞往', en: 'Fly to', es: 'Volar a', ja: '飛行', fr: 'Vol vers', de: 'Flug zu', ru: 'Полёт к' },
  land:    { zh: '降落', en: 'Land', es: 'Aterrizar', ja: '着陸', fr: 'Atterrir', de: 'Landen', ru: 'Посадка' },
  lookAt:  { zh: '注视', en: 'Look at', es: 'Mirar', ja: '注視', fr: 'Regarder', de: 'Betrachten', ru: 'Смотреть' },
  zoomOut: { zh: '拉远', en: 'Zoom out', es: 'Alejar', ja: 'ズームアウト', fr: 'Dézoomer', de: 'Herauszoomen', ru: 'Отдалить' },
};

/**
 * 教师工具包：课程计划生成、课堂模式同步、Q&A 高亮。
 *
 * @param {Object}   opts
 * @param {Object}   opts.tours   TourSystem 实例（用于查询导览列表与当前状态）
 * @param {Function} opts.select  (bodyId) => void — 选中天体
 * @param {Function} opts.flyTo   (bodyId) => void — 飞往天体
 * @param {Object}   [opts.hud]   HUD 实例（用于显示提示，可选）
 */
export class TeacherToolkit {
  constructor({ tours, select, flyTo, hud }) {
    this.tours = tours;
    this.select = select;
    this.flyTo = flyTo;
    this.hud = hud;
  }

  /**
   * 生成课程计划文本大纲。
   * 输出为纯文本，可直接粘贴到教案或打印分发。
   * @param {string} tourId 'backyard' | 'earth-moon'
   * @returns {string|null} 课程大纲文本，导览不存在时返回 null
   */
  generateLessonPlan(tourId) {
    const tour = TOURS[tourId];
    if (!tour) return null;

    const title = tour.title[LANG] ?? tour.title.en ?? tour.title.zh;
    const desc = tour.description[LANG] ?? tour.description.en ?? tour.description.zh;
    const lines = [];

    lines.push(`═══════════════════════════════════════════════════════════`);
    lines.push(`  ${tt('teacher.lessonTitle')}: ${title}`);
    lines.push(`═══════════════════════════════════════════════════════════`);
    lines.push('');
    lines.push(desc);
    lines.push('');
    lines.push(`${tt('teacher.checkpoints')}: ${tour.checkpoints.length}`);
    const totalDur = tour.checkpoints.reduce((s, c) => s + (c.duration || 0), 0);
    lines.push(`${tt('teacher.totalDuration')}: ${totalDur} ${LANG === 'zh' ? '秒' : 's'}`);
    lines.push('');

    tour.checkpoints.forEach((cp, i) => {
      const narration = cp.narration[LANG] ?? cp.narration.en ?? cp.narration.zh;
      const actionLabel = ACTION_LABELS[cp.action]?.[LANG]
        ?? ACTION_LABELS[cp.action]?.en
        ?? cp.action;
      const distText = cp.dist != null
        ? `${cp.dist}× ${LANG === 'zh' ? '半径' : 'R'}`
        : (LANG === 'zh' ? '默认' : 'default');

      lines.push(`─── ${tt('teacher.checkpoints')} ${i + 1}/${tour.checkpoints.length} ───`);
      lines.push(`  ${LANG === 'zh' ? '天体' : 'Body'}: ${cp.bodyId}`);
      lines.push(`  ${LANG === 'zh' ? '距离' : 'Distance'}: ${distText}`);
      lines.push(`  ${tt('teacher.action')}: ${actionLabel}`);
      lines.push(`  ${tt('teacher.duration')}: ${cp.duration}${LANG === 'zh' ? '秒' : 's'}`);
      lines.push(`  ${LANG === 'zh' ? '旁白' : 'Narration'}:`);
      // 旁白按 60 字宽折行，保持可读性
      lines.push(this._wrapText(narration, 60, '    '));
      lines.push('');
    });

    // 离线使用说明
    lines.push(`─── ${tt('teacher.offlineTitle')} ───`);
    lines.push(this._offlineInstructions());

    return lines.join('\n');
  }

  /**
   * 生成课堂同步 URL。
   * 基于现有书签功能（地址栏 #hash）附加 tour 参数，
   * 教师分享后学生打开即自动进入同一导览。
   * @param {string} [tourId] 要同步的导览 ID；省略时使用当前活跃导览
   * @returns {string|null} 同步 URL，无法生成时返回 null
   */
  startClassroomMode(tourId) {
    if (typeof window === 'undefined' || !window.location) return null;

    // 优先使用传入的 tourId，否则取当前活跃导览
    let finalTourId = tourId;
    if (!finalTourId && this.tours?.isActive) {
      finalTourId = this.tours._activeTourId;
    }
    if (!finalTourId || !TOURS[finalTourId]) return null;

    // 保留现有 hash（视图状态书签），追加 tour 查询参数
    const url = new URL(window.location.href);
    url.searchParams.set('tour', finalTourId);

    const syncUrl = url.toString();

    // 尝试复制到剪贴板
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(syncUrl).catch(() => {});
    }

    if (this.hud) this.hud.tip(tt('teacher.classroomCopied'));

    return syncUrl;
  }

  /**
   * Q&A 模式：高亮指定天体。
   * 教师提问后调用此方法，应用自动飞往并选中目标天体，学生视觉聚焦。
   * @param {string} bodyId 要高亮的天体 ID
   */
  askQuestion(bodyId) {
    this.select(bodyId);
    this.flyTo(bodyId);
    if (this.hud) {
      this.hud.tip(tt('teacher.askHighlight', { name: bodyId }));
    }
  }

  // ── 内部 ──────────────────────────────────────────────────────────

  /** 文本折行（用于课程计划的旁白排版）。 */
  _wrapText(text, width, indent = '') {
    if (!text) return '';
    const chars = [...text]; // 正确处理 Unicode（中文/日文等）
    const lines = [];
    for (let i = 0; i < chars.length; i += width) {
      lines.push(indent + chars.slice(i, i + width).join(''));
    }
    return lines.join('\n');
  }

  /** 离线使用说明文本。 */
  _offlineInstructions() {
    if (LANG === 'zh') {
      return [
        '  1. 运行 npm run build 生成纯静态文件（dist/ 目录）',
        '  2. 将 dist/ 复制到任意离线设备/U盘/局域网服务器',
        '  3. 用浏览器直接打开 index.html 即可离线使用',
        '  4. 星历数据已内置于代码中，无需联网',
        '  5. 贴图资产位于 public/textures/，需一并复制',
      ].join('\n');
    }
    return [
      '  1. Run `npm run build` to produce static files (dist/)',
      '  2. Copy dist/ to any offline device / USB / LAN server',
      '  3. Open index.html in a browser — works fully offline',
      '  4. Ephemeris data is bundled in the code; no network needed',
      '  5. Texture assets are in public/textures/ — copy them too',
    ].join('\n');
  }
}
