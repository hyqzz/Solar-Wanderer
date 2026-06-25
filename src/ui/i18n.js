// 界面国际化（i18n）：支持 zh/en/es/ja/fr/de/ru 七种语言（#3, #44, #45, #46）。
// LANG 来自 config.js（Node 默认 'zh'）。t(key, vars) 取本地化串并替换 {x} 占位符；
// 缺失时回退 en，再回退 zh。bodyName(entry) 取天体本地化名称。applyDomI18n() 处理 index.html 静态文本。

import { LANG } from '../config.js';
export { LANG };

const D = {
  // ── 通用单位（HUD 用）────────────────────────────────────────────────
  'u.year':   { zh: '年',   en: 'yr',  es: 'a',    ja: '年',     fr: 'an',   de: 'J',    ru: 'г' },
  'u.month':  { zh: '月',   en: 'mo',  es: 'mes',  ja: '月',     fr: 'mois', de: 'Mo',   ru: 'мес' },
  'u.week':   { zh: '周',   en: 'wk',  es: 'sem',  ja: '週',     fr: 'sem',  de: 'Wo',   ru: 'нед' },
  'u.day':    { zh: '天',   en: 'd',   es: 'd',    ja: '日',     fr: 'j',    de: 'T',    ru: 'д' },
  'u.hour':   { zh: '小时', en: 'h',   es: 'h',    ja: '時間',   fr: 'h',    de: 'Std',  ru: 'ч' },
  'u.min':    { zh: '分钟', en: 'min', es: 'min',  ja: '分',     fr: 'min',  de: 'Min',  ru: 'мин' },
  'u.days':   { zh: '天',   en: 'd',   es: 'd',    ja: '日',     fr: 'j',    de: 'T',    ru: 'д' },
  'u.years':  { zh: '年',   en: 'yr',  es: 'a',    ja: '年',     fr: 'ans',  de: 'J',    ru: 'лет' },
  'u.hours':  { zh: '小时', en: 'h',   es: 'h',    ja: '時間',   fr: 'h',    de: 'Std',  ru: 'ч' },
  'u.ms':     { zh: '毫秒', en: 'ms',  es: 'ms',   ja: 'ミリ秒',  fr: 'ms',   de: 'ms',   ru: 'мс' },
  'u.sec':    { zh: '秒',   en: 's',   es: 's',    ja: '秒',     fr: 's',    de: 's',    ru: 'с' },
  'u.perSec': { zh: '/秒',  en: '/s',  es: '/s',   ja: '/秒',    fr: '/s',   de: '/s',   ru: '/с' },
  'u.ly':     { zh: '光年', en: 'ly',  es: 'al',   ja: '光年',   fr: 'al',   de: 'Lj',   ru: 'св.год' },

  // ── 时间面板 ─────────────────────────────────────────────────────────
  'time.paused': { zh: '⏸ 已暂停', en: '⏸ Paused', es: '⏸ En pausa', ja: '⏸ 一時停止', fr: '⏸ En pause', de: '⏸ Pausiert', ru: '⏸ Пауза' },
  'time.realtime': { zh: '1×（实时）', en: '1× (real-time)', es: '1× (tiempo real)', ja: '1×（リアルタイム）', fr: '1× (temps réel)', de: '1× (Echtzeit)', ru: '1× (реальное время)' },
  'time.rate': { zh: '时间倍率', en: 'Time warp', es: 'Velocidad temporal', ja: 'タイムワープ', fr: 'Accélération temporelle', de: 'Zeitraffer', ru: 'Ускорение времени' },
  'time.k.minus': { zh: '减', en: 'slower', es: 'más lento', ja: '遅く', fr: 'plus lent', de: 'langsamer', ru: 'медленнее' },
  'time.k.plus': { zh: '加', en: 'faster', es: 'más rápido', ja: '速く', fr: 'plus vite', de: 'schneller', ru: 'быстрее' },
  'time.k.pause': { zh: '暂停', en: 'pause', es: 'pausa', ja: '一時停止', fr: 'pause', de: 'Pause', ru: 'пауза' },
  'time.k.now': { zh: '现在', en: 'now', es: 'ahora', ja: '現在', fr: 'maintenant', de: 'jetzt', ru: 'сейчас' },
  'time.outOfRange': {
    zh: '⚠ 超出星历高精度范围(1800–2050)',
    en: '⚠ Outside high-accuracy ephemeris range (1800–2050)',
    es: '⚠ Fuera del rango de efemérides de alta precisión (1800–2050)',
    ja: '⚠ 高精度星歴範囲外（1800–2050）',
    fr: '⚠ Hors de la plage d\'éphémérides de haute précision (1800–2050)',
    de: '⚠ Außerhalb des hochpräzisen Ephemeridenbereichs (1800–2050)',
    ru: '⚠ Вне диапазона высокоточных эфемерид (1800–2050)',
  },

  // ── 导航面板 ─────────────────────────────────────────────────────────
  'nav.flight': { zh: '✈ 飞行动画', en: '✈ Flying', es: '✈ Volando', ja: '✈ 飛行中', fr: '✈ En vol', de: '✈ Flug', ru: '✈ Полёт' },
  'nav.orbit': {
    zh: '🌐 探索（拖拽·滚轮·双击前往）',
    en: '🌐 Explore (drag · scroll · double-click to fly)',
    es: '🌐 Explorar (arrastrar · desplazar · doble clic para volar)',
    ja: '🌐 探索（ドラッグ・スクロール・ダブルクリックで移動）',
    fr: '🌐 Explorer (glisser · molette · double-clic pour voler)',
    de: '🌐 Erkunden (ziehen · scrollen · Doppelklick zum Fliegen)',
    ru: '🌐 Исследование (перетаскивание · прокрутка · двойной клик для полёта)',
  },
  'nav.walk': { zh: '🚶 地表行走', en: '🚶 Surface walk', es: '🚶 Caminar en superficie', ja: '🚶 地表歩行', fr: '🚶 Marche en surface', de: '🚶 Oberflächenbegehung', ru: '🚶 Ходьба по поверхности' },
  'nav.fly': { zh: '🚀 自由飞行', en: '🚀 Free flight', es: '🚀 Vuelo libre', ja: '🚀 自由飛行', fr: '🚀 Vol libre', de: '🚀 Freier Flug', ru: '🚀 Свободный полёт' },
  'nav.goingTo': { zh: '前往 {name}', en: 'To {name}', es: 'Hacia {name}', ja: '{name}へ', fr: 'Vers {name}', de: 'Nach {name}', ru: 'К {name}' },
  'nav.orbiting': { zh: '环绕焦点：{name}', en: 'Orbiting: {name}', es: 'Orbitando: {name}', ja: '軌道周回中：{name}', fr: 'En orbite : {name}', de: 'Umlaufbahn: {name}', ru: 'На орбите: {name}' },
  'nav.speed': { zh: '速度 {v}', en: 'Speed {v}', es: 'Velocidad {v}', ja: '速度 {v}', fr: 'Vitesse {v}', de: 'Geschwindigkeit {v}', ru: 'Скорость {v}' },
  'nav.gear': { zh: '　档位 {v}（滚轮调节）', en: '　gear {v} (scroll)', es: '　marcha {v} (rueda)', ja: '　ギア {v}（スクロール）', fr: '　rapport {v} (molette)', de: '　Gang {v} (Scrollen)', ru: '　передача {v} (прокрутка)' },
  'nav.nearest': { zh: '最近天体：{name}　高度 {alt}', en: 'Nearest: {name}　alt {alt}', es: 'Más cercano: {name}　alt {alt}', ja: '最寄り：{name}　高度 {alt}', fr: 'Plus proche : {name}　alt {alt}', de: 'Nächster: {name}　Höhe {alt}', ru: 'Ближайший: {name}　выс. {alt}' },
  'nav.gravity': { zh: '表面重力 {g} m/s²', en: 'Surface gravity {g} m/s²', es: 'Gravedad superficial {g} m/s²', ja: '表面重力 {g} m/s²', fr: 'Gravité de surface {g} m/s²', de: 'Oberflächengravitation {g} m/s²', ru: 'Гравитация на поверхности {g} m/s²' },
  'nav.hintFly': { zh: '自由飞行', en: 'Free flight', es: 'Vuelo libre', ja: '自由飛行', fr: 'Vol libre', de: 'Freier Flug', ru: 'Свободный полёт' },
  'nav.hintGoto': { zh: '前往所选', en: 'Go to selected', es: 'Ir al seleccionado', ja: '選択へ移動', fr: 'Aller à la sélection', de: 'Zum Ausgewählten', ru: 'К выбранному' },

  // ── 目标信息面板 ─────────────────────────────────────────────────────
  'tgt.none': {
    zh: '未选择目标 — 单击标签选中，双击/搜索/目录前往<br>数字键 1-9/0 直达行星',
    en: 'No target — click a label to select; double-click/search/directory to fly<br>Keys 1-9/0 jump to planets',
    es: 'Sin objetivo — clic en una etiqueta para seleccionar; doble clic/búsqueda/directorio para volar<br>Teclas 1-9/0 saltan a planetas',
    ja: '目標未選択 — ラベルをクリックで選択、ダブルクリック/検索/ディレクトリで移動<br>数字キー 1-9/0 で惑星へ',
    fr: 'Pas de cible — cliquez sur une étiquette pour sélectionner ; double-clic/recherche/annuaire pour voler<br>Touche 1-9/0 = planètes',
    de: 'Kein Ziel — Etikett klicken zum Auswählen; Doppelklick/Suche/Verzeichnis zum Fliegen<br>Tasten 1-9/0 springen zu Planeten',
    ru: 'Нет цели — кликните по метке для выбора; двойной клик/поиск/каталог для полёта<br>Клавиши 1-9/0 — к планетам',
  },
  'tgt.dist': { zh: '距你 {d}　<span class="dim">光行 {lt}</span>', en: 'Distance {d}　<span class="dim">light-time {lt}</span>', es: 'Distancia {d}　<span class="dim">tiempo de luz {lt}</span>', ja: '距離 {d}　<span class="dim">光到達時間 {lt}</span>', fr: 'Distance {d}　<span class="dim">temps de lumière {lt}</span>', de: 'Entfernung {d}　<span class="dim">Lichtzeit {lt}</span>', ru: 'Расстояние {d}　<span class="dim">световое время {lt}</span>' },
  'tgt.dSun': { zh: '距太阳 {au} AU', en: 'From Sun {au} AU', es: 'Del Sol {au} AU', ja: '太陽から {au} AU', fr: 'Du Soleil {au} UA', de: 'Von der Sonne {au} AE', ru: 'От Солнца {au} а.е.' },
  'tgt.radius': { zh: '半径 {r} km', en: 'Radius {r} km', es: 'Radio {r} km', ja: '半径 {r} km', fr: 'Rayon {r} km', de: 'Radius {r} km', ru: 'Радиус {r} км' },
  'tgt.gravity': { zh: '表面重力 {g} m/s²', en: 'Surface gravity {g} m/s²', es: 'Gravedad superficial {g} m/s²', ja: '表面重力 {g} m/s²', fr: 'Gravité de surface {g} m/s²', de: 'Oberflächengravitation {g} m/s²', ru: 'Гравитация на поверхности {g} m/s²' },
  'tgt.period': { zh: '公转周期 {p}', en: 'Orbital period {p}', es: 'Período orbital {p}', ja: '公転周期 {p}', fr: 'Période orbitale {p}', de: 'Umlaufperiode {p}', ru: 'Период обращения {p}' },
  'tgt.rotation': { zh: '自转周期 {p}', en: 'Rotation period {p}', es: 'Período de rotación {p}', ja: '自転周期 {p}', fr: 'Période de rotation {p}', de: 'Rotationsperiode {p}', ru: 'Период вращения {p}' },
  'tgt.fact': { zh: '📚 <b>你知道吗</b>　', en: '📚 <b>Did you know</b>　', es: '📚 <b>¿Sabías que?</b>　', ja: '📚 <b>豆知識</b>　', fr: '📚 <b>Le saviez-vous ?</b>　', de: '📚 <b>Wusstest du schon?</b>　', ru: '📚 <b>Знаете ли вы?</b>　' },
  'tgt.factNext': { zh: '换一条 ↻', en: 'Another ↻', es: 'Otra ↻', ja: '次へ ↻', fr: 'Une autre ↻', de: 'Eine andere ↻', ru: 'Ещё ↻' },
  'tgt.goto': { zh: '<span class="key">T</span> 前往（GE 式飞行）', en: '<span class="key">T</span> Fly there', es: '<span class="key">T</span> Volar allí', ja: '<span class="key">T</span> 移動（GE式飛行）', fr: '<span class="key">T</span> Y voler', de: '<span class="key">T</span> Dorthin fliegen', ru: '<span class="key">T</span> Лететь туда' },

  // ── 提示（tips）──────────────────────────────────────────────────────
  'tip.quality': { zh: '已自动降低画质以保证流畅运行', en: 'Quality lowered automatically for smooth performance', es: 'Calidad reducida automáticamente para un rendimiento fluido', ja: '快適動作のため画質を自動的に下げました', fr: 'Qualité réduite automatiquement pour des performances fluides', de: 'Qualität automatisch gesenkt für flüssige Leistung', ru: 'Качество автоматически снижено для плавной работы' },
  'tip.tnoOrbitsOn': { zh: '海外天体轨道线：开', en: 'Trans-Neptunian orbits: ON', es: 'Órbitas transneptunianas: ON', ja: '海王星以遠軌道線：ON', fr: 'Orbites transneptuniennes : ON', de: 'Transneptunische Orbits: AN', ru: 'Орбиты транснептуновых объектов: ВКЛ' },
  'tip.tnoOrbitsOff': { zh: '海外天体轨道线：关', en: 'Trans-Neptunian orbits: OFF', es: 'Órbitas transneptunianas: OFF', ja: '海王星以遠軌道線：OFF', fr: 'Orbites transneptuniennes : OFF', de: 'Transneptunische Orbits: AUS', ru: 'Орбиты транснептуновых объектов: ВЫКЛ' },
  'tip.pendingFocus': {
    zh: '🎯 已选择目标：{name}（滚动鼠标或 PageUp/Down 平滑接近/远离）',
    en: '🎯 Target set: {name} (scroll or PageUp/Down to approach/recede)',
    es: '🎯 Objetivo fijado: {name} (desplazar o RePág/AvPág para acercar/alejar)',
    ja: '🎯 目標設定：{name}（スクロールまたは PageUp/Down で接近/遠離）',
    fr: '🎯 Cible définie : {name} (molette ou PagePréc/Suiv pour approcher/s\'éloigner)',
    de: '🎯 Ziel gesetzt: {name} (scrollen oder BildAuf/Ab zum Nähern/Entfernen)',
    ru: '🎯 Цель установлена: {name} (прокрутка или PageUp/Down для приближения/отдаления)',
  },
  'tip.lockedFocus': {
    zh: '🎯 已锁定焦点：{name}（滚轮拉近可直达登陆）',
    en: '🎯 Focus locked: {name} (scroll in to land directly)',
    es: '🎯 Enfoque bloqueado: {name} (desplazar para aterrizar directamente)',
    ja: '🎯 焦点ロック：{name}（スクロールで直接着陸）',
    fr: '🎯 Cible verrouillée : {name} (molette pour atterrir directement)',
    de: '🎯 Fokus gesperrt: {name} (reinzoomen zum direkten Landen)',
    ru: '🎯 Фокус захвачен: {name} (прокрутка к себе для прямой посадки)',
  },
  'tip.flyingTo': { zh: '✈ 正在前往 {name} …（拖拽可中断）', en: '✈ Flying to {name}… (drag to cancel)', es: '✈ Volando hacia {name}… (arrastrar para cancelar)', ja: '✈ {name}へ移動中…（ドラッグで中断）', fr: '✈ En vol vers {name}… (glisser pour annuler)', de: '✈ Flug nach {name}… (ziehen zum Abbrechen)', ru: '✈ Полёт к {name}… (перетаскивание для отмены)' },
  'tip.lockHint': { zh: '单击画面锁定鼠标即可用准星瞄准天体', en: 'Click to lock the pointer and aim with the crosshair', es: 'Clic para bloquear el puntero y apuntar con la mira', ja: 'クリックでポインタをロックし、十字で天体を狙う', fr: 'Cliquez pour verrouiller le pointeur et viser avec le réticule', de: 'Klicken zum Sperren des Zeigers und Zielen mit dem Fadenkreuz', ru: 'Кликните для захвата курсора и наведения перекрестием' },
  'tip.aimHint': { zh: '移动鼠标用准星瞄准天体，单击选中', en: 'Move the mouse to aim; click to select', es: 'Mueve el ratón para apuntar; clic para seleccionar', ja: 'マウスを動かして狙い、クリックで選択', fr: 'Bougez la souris pour viser ; cliquez pour sélectionner', de: 'Maus bewegen zum Zielen; Klick zum Auswählen', ru: 'Двигайте мышь для наведения; клик для выбора' },
  'tip.landHint': { zh: '滚轮继续拉近 = 直接降落 {name}（或按 G 立即登陆）', en: 'Keep scrolling in = land on {name} (or press G to land now)', es: 'Seguir desplazando = aterrizar en {name} (o presiona G para aterrizar ahora)', ja: 'スクロールで続けて = {name}に着陸（または G キーで即着陸）', fr: 'Continuer à zoomer = atterrir sur {name} (ou G pour atterrir maintenant)', de: 'Weiter reinzoomen = auf {name} landen (oder G für sofortige Landung)', ru: 'Продолжайте прокрутку = посадка на {name} (или G для немедленной посадки)' },
  'tip.landAny': { zh: '滚轮一路拉近即可无缝降落地表', en: 'Scroll all the way in to land seamlessly', es: 'Desplazar hasta el final para aterrizar sin interrupción', ja: 'スクロールで最後まで引き寄せてシームレスに着陸', fr: 'Zoomer à fond pour atterrir sans transition', de: 'Ganz reinzoomen für nahtlose Landung', ru: 'Прокрутите до конца для бесшовной посадки' },
  'tip.enterAtmo': { zh: '☁ 正在进入 {name} 大气层（无固体表面，滚轮后退离开）', en: '☁ Entering {name} atmosphere (no solid surface; scroll out to leave)', es: '☁ Entrando en la atmósfera de {name} (sin superficie sólida; desplazar para salir)', ja: '☁ {name}の大気圏に突入（固体表面なし、スクロールで離脱）', fr: '☁ Entrée dans l\'atmosphère de {name} (pas de surface solide ; molette pour sortir)', de: '☁ Eintritt in {name} Atmosphäre (keine feste Oberfläche; rauszoomen zum Verlassen)', ru: '☁ Вход в атмосферу {name} (нет твёрдой поверхности; прокрутка от себя для выхода)' },
  'tip.gasGiant': { zh: '⚠ 气态/冰巨行星无固体表面：可下潜入大气层，无法降落', en: '⚠ Gas/ice giant has no solid surface: you can dive into the atmosphere but not land', es: '⚠ Gigante gaseoso/de hielo sin superficie sólida: puedes sumergirte en la atmósfera pero no aterrizar', ja: '⚠ ガス・氷巨星に固体表面なし：大気圏へ潜行可能ですが着陸不可', fr: '⚠ Géante gazeuse/de glace sans surface solide : plongée dans l\'atmosphère possible, atterrissage impossible', de: '⚠ Gas-/Eisriese ohne feste Oberfläche: Tauchen in die Atmosphäre möglich, keine Landung', ru: '⚠ Газовый/ледяной гигант без твёрдой поверхности: можно погрузиться в атмосферу, но не сесть' },
  'tip.sun': { zh: '⚠ 接近太阳：表面温度 5772 K', en: '⚠ Approaching the Sun: surface 5772 K', es: '⚠ Acercándose al Sol: superficie 5772 K', ja: '⚠ 太陽に接近中：表面温度 5772 K', fr: '⚠ Approche du Soleil : surface 5772 K', de: '⚠ Annäherung an die Sonne: Oberfläche 5772 K', ru: '⚠ Приближение к Солнцу: поверхность 5772 K' },
  'tip.inertial': {
    zh: '🛰 惯性观察模式：相机不随自转，加速时间（]键）可观赏 {name} 的卫星绕转 · V 切回',
    en: '🛰 Inertial view: camera ignores rotation; speed up time (]) to watch {name}\'s moons orbit · V to exit',
    es: '🛰 Vista inercial: la cámara ignora la rotación; acelera el tiempo (]) para ver las lunas de {name} orbitar · V para salir',
    ja: '🛰 慣性ビュー：カメラは自転を無視、時間加速（]）で {name} の衛星の周回を観察 · V で終了',
    fr: '🛰 Vue inertielle : la caméra ignore la rotation ; accélérer le temps (]) pour voir les lunes de {name} orbiter · V pour quitter',
    de: '🛰 Inertiale Ansicht: Kamera ignoriert Rotation; Zeit beschleunigen (]) um {name}s Monde zu sehen · V zum Beenden',
    ru: '🛰 Инерционный вид: камера игнорирует вращение; ускорьте время (]) чтобы увидеть спутники {name} · V для выхода',
  },
  'tip.walkLocked': {
    zh: '滚轮后退起飞 · G 返回探索 · Space 跳跃 · Shift 奔跑 · 抬头看看天空',
    en: 'Scroll back to take off · G to explore · Space jump · Shift run · look up at the sky',
    es: 'Desplazar atrás para despegar · G para explorar · Space saltar · Shift correr · mira al cielo',
    ja: 'スクロールで離陸 · G で探索へ · Space ジャンプ · Shift 走る · 空を見上げて',
    fr: 'Molette arrière pour décoller · G pour explorer · Espace sauter · Maj courir · regardez le ciel',
    de: 'Rauszoomen zum Abheben · G zum Erkunden · Leertaste Springen · Umschalt Rennen · schau zum Himmel',
    ru: 'Прокрутка от себя для взлёта · G к исследованию · Пробел прыжок · Shift бег · посмотрите на небо',
  },
  'tip.walkUnlocked': {
    zh: '单击画面锁定鼠标环视（或按住左键拖拽）· 滚轮后退起飞',
    en: 'Click to lock the pointer and look around (or drag) · scroll back to take off',
    es: 'Clic para bloquear el puntero y mirar alrededor (o arrastrar) · desplazar atrás para despegar',
    ja: 'クリックでポインタをロックして見回す（またはドラッグ）· スクロールで離陸',
    fr: 'Cliquez pour verrouiller le pointeur et regarder autour (ou glisser) · molette arrière pour décoller',
    de: 'Klicken zum Sperren des Zeigers und Umschauen (oder ziehen) · rauszoomen zum Abheben',
    ru: 'Кликните для захвата курсора и осмотра (или перетаскивание) · прокрутка от себя для взлёта',
  },
  'tip.landNear': { zh: '滚轮继续拉近 = 直接降落 {name}（或按 G 立即登陆）', en: 'Keep scrolling in = land on {name} (or press G to land now)', es: 'Seguir desplazando = aterrizar en {name} (o presiona G para aterrizar ahora)', ja: 'スクロールで続けて = {name}に着陸（または G キーで即着陸）', fr: 'Continuer à zoomer = atterrir sur {name} (ou G pour atterrir maintenant)', de: 'Weiter reinzoomen = auf {name} landen (oder G für sofortige Landung)', ru: 'Продолжайте прокрутку = посадка на {name} (или G для немедленной посадки)' },
  'tip.urlCopied': { zh: '🔗 链接已复制到剪贴板（Ctrl+L）', en: '🔗 Link copied to clipboard (Ctrl+L)', es: '🔗 Enlace copiado al portapapeles (Ctrl+L)', ja: '🔗 リンクをクリップボードにコピー（Ctrl+L）', fr: '🔗 Lien copié dans le presse-papiers (Ctrl+L)', de: '🔗 Link in die Zwischenablage kopiert (Strg+L)', ru: '🔗 Ссылка скопирована в буфер обмена (Ctrl+L)' },
  'tip.urlUpdated': { zh: '🔗 地址栏已更新（Ctrl+L）', en: '🔗 Address bar updated (Ctrl+L)', es: '🔗 Barra de direcciones actualizada (Ctrl+L)', ja: '🔗 アドレスバーを更新（Ctrl+L）', fr: '🔗 Barre d\'adresse mise à jour (Ctrl+L)', de: '🔗 Adressleiste aktualisiert (Strg+L)', ru: '🔗 Адресная строка обновлена (Ctrl+L)' },

  // ── HUD 面板 ─────────────────────────────────────────────────────────
  'hud.flightTo': { zh: '前往 {name}　{p}%', en: 'To {name}　{p}%', es: 'Hacia {name}　{p}%', ja: '{name}へ　{p}%', fr: 'Vers {name}　{p}%', de: 'Nach {name}　{p}%', ru: 'К {name}　{p}%' },
  'hud.orbitFocus': { zh: '环绕焦点：{name}', en: 'Orbiting: {name}', es: 'Orbitando: {name}', ja: '軌道周回中：{name}', fr: 'En orbite : {name}', de: 'Umlaufbahn: {name}', ru: 'На орбите: {name}' },
  'hud.speed': { zh: '速度 {v}', en: 'Speed {v}', es: 'Velocidad {v}', ja: '速度 {v}', fr: 'Vitesse {v}', de: 'Geschwindigkeit {v}', ru: 'Скорость {v}' },
  'hud.gear': { zh: '　档位 {v}（滚轮调节）', en: '　gear {v} (scroll)', es: '　marcha {v} (rueda)', ja: '　ギア {v}（スクロール）', fr: '　rapport {v} (molette)', de: '　Gang {v} (Scrollen)', ru: '　передача {v} (прокрутка)' },
  'hud.nearest': { zh: '最近天体：{name}　高度 {alt}', en: 'Nearest: {name}　alt {alt}', es: 'Más cercano: {name}　alt {alt}', ja: '最寄り：{name}　高度 {alt}', fr: 'Plus proche : {name}　alt {alt}', de: 'Nächster: {name}　Höhe {alt}', ru: 'Ближайший: {name}　выс. {alt}' },
  'hud.surfaceGravity': { zh: '表面重力 {g} m/s²', en: 'Surface gravity {g} m/s²', es: 'Gravedad superficial {g} m/s²', ja: '表面重力 {g} m/s²', fr: 'Gravité de surface {g} m/s²', de: 'Oberflächengravitation {g} m/s²', ru: 'Гравитация на поверхности {g} m/s²' },
  'hud.hintFly': { zh: '自由飞行', en: 'Free flight', es: 'Vuelo libre', ja: '自由飛行', fr: 'Vol libre', de: 'Freier Flug', ru: 'Свободный полёт' },
  'hud.hintGoto': { zh: '前往所选', en: 'Go to selected', es: 'Ir al seleccionado', ja: '選択へ移動', fr: 'Aller à la sélection', de: 'Zum Ausgewählten', ru: 'К выбранному' },
  'hud.lightMs': { zh: '毫秒', en: 'ms', es: 'ms', ja: 'ミリ秒', fr: 'ms', de: 'ms', ru: 'мс' },
  'hud.lightSec': { zh: '秒', en: 's', es: 's', ja: '秒', fr: 's', de: 's', ru: 'с' },
  'hud.lightMin': { zh: '分钟', en: 'min', es: 'min', ja: '分', fr: 'min', de: 'Min', ru: 'мин' },
  'hud.lightHour': { zh: '小时', en: 'h', es: 'h', ja: '時間', fr: 'h', de: 'Std', ru: 'ч' },

  'word.target': { zh: '目标', en: 'target', es: 'objetivo', ja: '目標', fr: 'cible', de: 'Ziel', ru: 'цель' },

  // ── 目录 / 搜索 ──────────────────────────────────────────────────────
  'dir.title': { zh: '🪐 天体目录', en: '🪐 Directory', es: '🪐 Directorio', ja: '🪐 天体カタログ', fr: '🪐 Annuaire', de: '🪐 Verzeichnis', ru: '🪐 Каталог' },
  'dir.sub': { zh: '点击即前往', en: 'click to fly', es: 'clic para volar', ja: 'クリックで移動', fr: 'cliquez pour voler', de: 'Klick zum Fliegen', ru: 'клик для полёта' },
  'grp.star': { zh: '☀️ 恒星', en: '☀️ Stars', es: '☀️ Estrellas', ja: '☀️ 恒星', fr: '☀️ Étoiles', de: '☀️ Sterne', ru: '☀️ Звёзды' },
  'grp.planet': { zh: '🪐 行星', en: '🪐 Planets', es: '🪐 Planetas', ja: '🪐 惑星', fr: '🪐 Planètes', de: '🪐 Planeten', ru: '🪐 Планеты' },
  'grp.dwarf': { zh: '🧊 矮行星', en: '🧊 Dwarf planets', es: '🧊 Planetas enanos', ja: '🧊 矮惑星', fr: '🧊 Planètes naines', de: '🧊 Zwergplaneten', ru: '🧊 Карликовые планеты' },
  'grp.moon': { zh: '🌙 卫星', en: '🌙 Moons', es: '🌙 Lunas', ja: '🌙 衛星', fr: '🌙 Lunes', de: '🌙 Monde', ru: '🌙 Спутники' },
  'grp.comet': { zh: '☄️ 彗星', en: '☄️ Comets', es: '☄️ Cometas', ja: '☄️ 彗星', fr: '☄️ Comètes', de: '☄️ Kometen', ru: '☄️ Кометы' },
  'grp.tno': { zh: '🌑 海外天体（TNO）', en: '🌑 Trans-Neptunian (TNO)', es: '🌑 Transneptunianos (TNO)', ja: '🌑 海外天体（TNO）', fr: '🌑 Transneptuniens (TNO)', de: '🌑 Transneptunische (TNO)', ru: '🌑 Транснептуновые (TNO)' },
  'grp.probe': { zh: '🛰 探测器', en: '🛰 Probes', es: '🛰 Sondas', ja: '🛰 探査機', fr: '🛰 Sondes', de: '🛰 Sonden', ru: '🛰 Зонды' },
  'grp.boundary': { zh: '🌌 日球层边界', en: '🌌 Heliosphere edge', es: '🌌 Borde de la heliosfera', ja: '🌌 ヘリオスフィア境界', fr: '🌌 Bord de l\'héliosphère', de: '🌌 Heliosphärengrenze', ru: '🌌 Граница гелиосферы' },
  'grp.region': { zh: '🪐 星带与全景', en: '🪐 Belts & panoramas', es: '🪐 Cinturones y panoramas', ja: '🪐 ベルトと全景', fr: '🪐 Ceintures et panoramas', de: '🪐 Gürtel & Panoramen', ru: '🪐 Пояса и панорамы' },
  'kind.star': { zh: '恒星', en: 'star', es: 'estrella', ja: '恒星', fr: 'étoile', de: 'Stern', ru: 'звезда' },
  'kind.planet': { zh: '行星', en: 'planet', es: 'planeta', ja: '惑星', fr: 'planète', de: 'Planet', ru: 'планета' },
  'kind.moon': { zh: '卫星', en: 'moon', es: 'luna', ja: '衛星', fr: 'lune', de: 'Mond', ru: 'спутник' },
  'kind.comet': { zh: '彗星', en: 'comet', es: 'cometa', ja: '彗星', fr: 'comète', de: 'Komet', ru: 'комета' },
  'kind.probe': { zh: '探测器', en: 'probe', es: 'sonda', ja: '探査機', fr: 'sonde', de: 'Sonde', ru: 'зонд' },
  'kind.boundary': { zh: '边界', en: 'boundary', es: 'frontera', ja: '境界', fr: 'frontière', de: 'Grenze', ru: 'граница' },
  'kind.poi': { zh: '地标', en: 'landmark', es: 'hito', ja: 'ランドマーク', fr: 'repère', de: 'Wahrzeichen', ru: 'ориентир' },
  'kind.tno': { zh: '海外天体', en: 'TNO', es: 'TNO', ja: '海外天体', fr: 'TNO', de: 'TNO', ru: 'ТНО' },
  'kind.region': { zh: '区域', en: 'region', es: 'región', ja: '領域', fr: 'région', de: 'Region', ru: 'регион' },
  'search.orbits': { zh: '🛤 轨道线', en: '🛤 Orbit lines', es: '🛤 Líneas orbitales', ja: '🛤 軌道線', fr: '🛤 Lignes d\'orbite', de: '🛤 Umlaufbahnen', ru: '🛤 Линии орбит' },
  'search.on': { zh: '显示', en: 'shown', es: 'visible', ja: '表示', fr: 'affiché', de: 'angezeigt', ru: 'показ.' },
  'search.off': { zh: '隐藏', en: 'hidden', es: 'oculto', ja: '非表示', fr: 'masqué', de: 'versteckt', ru: 'скрыто' },
  'search.cur': { zh: '当前', en: 'now', es: 'ahora', ja: '現在', fr: 'maintenant', de: 'jetzt', ru: 'сейчас' },
  'search.toggle': { zh: '点击切换', en: 'click to toggle', es: 'clic para alternar', ja: 'クリックで切替', fr: 'cliquez pour basculer', de: 'Klick zum Umschalten', ru: 'клик для переключения' },

  // ── 开始界面 ─────────────────────────────────────────────────────────
  'start.sub': {
    zh: '太阳系 1:1 实时模拟 · 基于 NASA JPL 星历还原此刻太阳系 · 自由探索整个太阳系',
    en: '1:1 real-time solar system · NASA JPL ephemerides recreate the system right now · explore the whole solar system',
    es: 'Sistema solar a escala 1:1 en tiempo real · Efemérides de la NASA JPL recrean el sistema ahora · explora todo el sistema solar',
    ja: '1:1 リアルタイム太陽系 · NASA JPL 星歴で今の太陽系を再現 · 太陽系全体を自由探索',
    fr: 'Système solaire 1:1 en temps réel · Les éphémérides de la NASA JPL recréent le système maintenant · explorez tout le système solaire',
    de: '1:1-Echtzeit-Sonnensystem · NASA-JPL-Ephemeriden erschaffen das System jetzt · erkunde das ganze Sonnensystem',
    ru: 'Солнечная система 1:1 в реальном времени · Эфемериды NASA JPL воссоздают систему сейчас · исследуйте всю Солнечную систему',
  },
  'start.loading': { zh: '加载中…', en: 'Loading…', es: 'Cargando…', ja: '読み込み中…', fr: 'Chargement…', de: 'Laden…', ru: 'Загрузка…' },
  'start.loadingTex': { zh: '加载真实行星贴图… {done}/{total}', en: 'Loading real planet textures… {done}/{total}', es: 'Cargando texturas reales de planetas… {done}/{total}', ja: '実惑星テクスチャを読み込み中… {done}/{total}', fr: 'Chargement des textures planétaires réelles… {done}/{total}', de: 'Echte Planetentexturen laden… {done}/{total}', ru: 'Загрузка текстур планет… {done}/{total}' },
  'start.enter': { zh: '点击进入太阳系', en: 'Enter the solar system', es: 'Entrar al sistema solar', ja: '太陽系に入る', fr: 'Entrer dans le système solaire', de: 'Sonnensystem betreten', ru: 'Войти в Солнечную систему' },
  'start.hint': {
    zh: '进入后单击画面锁定鼠标 · H 查看完整操作说明',
    en: 'Click to lock the pointer after entering · press H for full controls',
    es: 'Clic para bloquear el puntero al entrar · pulsa H para ver los controles completos',
    ja: '入場後クリックでポインタをロック · H で操作説明',
    fr: 'Cliquez pour verrouiller le pointeur après l\'entrée · H pour les contrôles complets',
    de: 'Klicken zum Sperren des Zeigers nach dem Eintritt · H für alle Steuerelemente',
    ru: 'Кликните для захвата курсора после входа · H для полного руководства',
  },
  'start.hintTouch': {
    zh: '单指旋转 · 双指缩放 · 双击标签前往',
    en: 'One-finger rotate · pinch to zoom · double-tap label to fly',
    es: 'Rotar con un dedo · pellizcar para zoom · doble toque en etiqueta para volar',
    ja: '一本指で回転 · ピンチでズーム · ラベルをダブルタップで移動',
    fr: 'Rotation à un doigt · pincer pour zoomer · double-tap sur l\'étiquette pour voler',
    de: 'Mit einem Finger drehen · pinch zum Zoomen · Doppelklick auf Etikett zum Fliegen',
    ru: 'Поворот одним пальцем · щипок для масштаба · двойное касание метки для полёта',
  },
  'start.star': { zh: 'Star on GitHub', en: 'Star on GitHub', es: 'Star en GitHub', ja: 'GitHubでスター', fr: 'Star sur GitHub', de: 'Auf GitHub starren', ru: 'Звезда на GitHub' },
  'help.toggle': { zh: '操作说明（H 关闭）', en: 'Controls (H to close)', es: 'Controles (H para cerrar)', ja: '操作説明（H で閉じる）', fr: 'Contrôles (H pour fermer)', de: 'Steuerung (H zum Schließen)', ru: 'Управление (H для закрытия)' },

  // ── 触摸操作面板 ─────────────────────────────────────────────────────
  'tc.menu':      { zh: '☰', en: '☰', es: '☰', ja: '☰', fr: '☰', de: '☰', ru: '☰' },
  'tc.zoomIn':    { zh: '＋', en: '＋', es: '＋', ja: '＋', fr: '＋', de: '＋', ru: '＋' },
  'tc.zoomOut':   { zh: '－', en: '－', es: '－', ja: '－', fr: '－', de: '－', ru: '－' },
  'tc.dir':       { zh: '🎯', en: '🎯', es: '🎯', ja: '🎯', fr: '🎯', de: '🎯', ru: '🎯' },
  'tc.target':    { zh: 'ℹ️', en: 'ℹ️', es: 'ℹ️', ja: 'ℹ️', fr: 'ℹ️', de: 'ℹ️', ru: 'ℹ️' },
  'tc.land':      { zh: '🛬 降落', en: '🛬 Land', es: '🛬 Aterrizar', ja: '🛬 着陸', fr: '🛬 Atterrir', de: '🛬 Landen', ru: '🛬 Посадка' },
  'tc.fly':       { zh: '🚀 飞行', en: '🚀 Fly', es: '🚀 Volar', ja: '🚀 飛行', fr: '🚀 Voler', de: '🚀 Fliegen', ru: '🚀 Полёт' },
  'tc.orbit':     { zh: '🌐 探索', en: '🌐 Explore', es: '🌐 Explorar', ja: '🌐 探索', fr: '🌐 Explorer', de: '🌐 Erkunden', ru: '🌐 Исслед.' },
  'tc.stop':      { zh: '⏹ 急停', en: '⏹ Stop', es: '⏹ Detener', ja: '⏹ 停止', fr: '⏹ Arrêter', de: '⏹ Stopp', ru: '⏹ Стоп' },
  'tc.goto':      { zh: '✈ 前往', en: '✈ Go', es: '✈ Ir', ja: '✈ 移動', fr: '✈ Aller', de: '✈ Fliegen', ru: '✈ Лететь' },
  'tc.reset':     { zh: '↺ 复位', en: '↺ Reset', es: '↺ Reiniciar', ja: '↺ リセット', fr: '↺ Réinitialiser', de: '↺ Zurücksetzen', ru: '↺ Сброс' },
  'tc.inertial':  { zh: '🛰 惯性', en: '🛰 Inertial', es: '🛰 Inercial', ja: '🛰 慣性', fr: '🛰 Inertiel', de: '🛰 Inertial', ru: '🛰 Инерц.' },
  'tc.jump':      { zh: '↑ 跳跃', en: '↑ Jump', es: '↑ Saltar', ja: '↑ ジャンプ', fr: '↑ Sauter', de: '↑ Springen', ru: '↑ Прыжок' },
  'tc.ascend':    { zh: '▲', en: '▲', es: '▲', ja: '▲', fr: '▲', de: '▲', ru: '▲' },
  'tc.descend':   { zh: '▼', en: '▼', es: '▼', ja: '▼', fr: '▼', de: '▼', ru: '▼' },
  'tc.sprint':    { zh: '⚡ 奔跑', en: '⚡ Run', es: '⚡ Correr', ja: '⚡ 走る', fr: '⚡ Courir', de: '⚡ Rennen', ru: '⚡ Бег' },
  'tc.takeoff':   { zh: '🚀 起飞', en: '🚀 Takeoff', es: '🚀 Despegar', ja: '🚀 離陸', fr: '🚀 Décoller', de: '🚀 Abheben', ru: '🚀 Взлёт' },
  'tc.warpSlow':  { zh: '⏮ 减速', en: '⏮ Slower', es: '⏮ Más lento', ja: '⏮ 遅く', fr: '⏮ Plus lent', de: '⏮ Langsamer', ru: '⏮ Медленнее' },
  'tc.warpFast':  { zh: '⏭ 加速', en: '⏭ Faster', es: '⏭ Más rápido', ja: '⏭ 速く', fr: '⏭ Plus vite', de: '⏭ Schneller', ru: '⏭ Быстрее' },
  'tc.pause':     { zh: '⏸ 暂停', en: '⏸ Pause', es: '⏸ Pausa', ja: '⏸ 一時停止', fr: '⏸ Pause', de: '⏸ Pause', ru: '⏸ Пауза' },
  'tc.now':       { zh: '⏺ 现在', en: '⏺ Now', es: '⏺ Ahora', ja: '⏺ 現在', fr: '⏺ Maintenant', de: '⏺ Jetzt', ru: '⏺ Сейчас' },
  'tc.orbits':    { zh: '🛤 轨道线', en: '🛤 Orbits', es: '🛤 Órbitas', ja: '🛤 軌道線', fr: '🛤 Orbites', de: '🛤 Orbits', ru: '🛤 Орбиты' },
  'tc.labels':    { zh: '🏷 标签', en: '🏷 Labels', es: '🏷 Etiquetas', ja: '🏷 ラベル', fr: '🏷 Étiquettes', de: '🏷 Etiketten', ru: '🏷 Метки' },
  'tc.help':      { zh: '❓ 帮助', en: '❓ Help', es: '❓ Ayuda', ja: '❓ ヘルプ', fr: '❓ Aide', de: '❓ Hilfe', ru: '❓ Справка' },
  'tc.timeTitle': { zh: '⏱ 时间', en: '⏱ Time', es: '⏱ Tiempo', ja: '⏱ 時間', fr: '⏱ Temps', de: '⏱ Zeit', ru: '⏱ Время' },
  'tc.dispTitle': { zh: '🖥 显示', en: '🖥 Display', es: '🖥 Pantalla', ja: '🖥 表示', fr: '🖥 Affichage', de: '🖥 Anzeige', ru: '🖥 Экран' },
  'tc.dirTitle':  { zh: '🎯 目录', en: '🎯 Directory', es: '🎯 Directorio', ja: '🎯 カタログ', fr: '🎯 Annuaire', de: '🎯 Verzeichnis', ru: '🎯 Каталог' },

  // ── 触摸专属操作提示 ─────────────────────────────────────────────────
  'tip.walkTouch': {
    zh: '拖拽屏幕环视 · 摇杆移动 · 双指后缩起飞',
    en: 'Drag to look · joystick to move · pinch-out to take off',
    es: 'Arrastrar para mirar · joystick para mover · pellizcar hacia afuera para despegar',
    ja: 'ドラッグで見回す · ジョイスティックで移動 · ピンチアウトで離陸',
    fr: 'Glisser pour regarder · joystick pour bouger · pincer vers l\'extérieur pour décoller',
    de: 'Ziehen zum Schauen · Joystick zum Bewegen · pinch-out zum Abheben',
    ru: 'Перетаскивание для осмотра · джойстик для движения · щипок наружу для взлёта',
  },
  'tip.flyTouch': {
    zh: '拖拽屏幕转向 · 摇杆平移 · 左上角切回探索',
    en: 'Drag to look · joystick to strafe · top-left to return',
    es: 'Arrastrar para girar · joystick para desplazarse · arriba a la izquierda para volver',
    ja: 'ドラッグで旋回 · ジョイスティックで移動 · 左上で探索に戻る',
    fr: 'Glisser pour tourner · joystick pour straffer · en haut à gauche pour revenir',
    de: 'Ziehen zum Drehen · Joystick zum Strafen · oben links zum Zurückkehren',
    ru: 'Перетаскивание для поворота · джойстик для смещения · вверху слева для возврата',
  },
};

/** 取本地化字符串：优先当前语言，缺失回退 en，再回退 zh，最后返回 key 本身。 */
export function t(key, vars) {
  const e = D[key];
  let s;
  if (!e) {
    s = key;
  } else if (typeof e === 'string') {
    s = e;
  } else {
    s = e[LANG] ?? e.en ?? e.zh ?? key;
  }
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/** 天体本地化名称：优先当前语言对应的 nameEn（暂用英文占位），缺失回退中文。 */
export function bodyName(entry) {
  if (!entry) return '';
  if (LANG === 'zh') return entry.nameZh;
  // 非中文界面优先用英文名（es/ja/fr/de/ru 暂用英文占位），缺失回退中文
  return entry.nameEn || entry.nameZh;
}

const isTouchDevice = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 &&
  (typeof window === 'undefined' || window.matchMedia?.('(pointer: coarse)').matches);

/** 处理 index.html 中带 data-i18n / data-i18n-html 的静态文本节点；非中文界面注入英文帮助。 */
export function applyDomI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.getAttribute('data-i18n-html'));

  // 移动端：把启动提示改为触摸说明
  if (isTouchDevice()) {
    const hint = root.querySelector('.start-inner .hint');
    if (hint) hint.textContent = t('start.hintTouch');
  }

  // 非中文界面（en/es/ja/fr/de/ru）注入英文帮助文档；es/ja/fr/de/ru 暂用英文占位（#44,#45,#46）
  if (LANG !== 'zh') {
    document.documentElement.lang = LANG;
    const inner = document.querySelector('#help .help-inner');
    if (inner) inner.innerHTML = isTouchDevice() ? HELP_TOUCH_EN : HELP_EN;
  } else {
    document.documentElement.lang = 'zh';
    if (isTouchDevice()) {
      const inner = document.querySelector('#help .help-inner');
      if (inner) inner.innerHTML = HELP_TOUCH_ZH;
    }
  }
}

const HELP_EN = `
  <h2>Controls (press H to close)</h2>
  <div class="help-cols">
    <div>
      <h3>🌐 Explore mode (default · Google Earth style)</h3>
      <table>
        <tr><td>Left-drag</td><td>Orbit around focus (inertia; auto-slows near surface)</td></tr>
        <tr><td>Ctrl+Left-drag</td><td>Rotate heading / tilt (3D look-around)</td></tr>
        <tr><td>Right/Middle-drag</td><td>Pan the whole space (no rotation; R to reset)</td></tr>
        <tr><td>W S A D / Arrows</td><td>Pan view (N/S/W/E, speed scales with altitude)</td></tr>
        <tr><td>Shift+A / Shift+D</td><td>Rotate heading (CCW / CW)</td></tr>
        <tr><td>Shift+W / Shift+S</td><td>Tilt toward horizon / back to top-down</td></tr>
        <tr><td>Click a body</td><td><b>Lock focus</b> (scroll then approaches it; can land directly)</td></tr>
        <tr><td>Scroll / PageUp PageDown / + −</td><td>Zoom about screen center (altitude-scaled: metre steps near ground, hover at <b>any altitude</b>)</td></tr>
        <tr><td>Scroll all the way in</td><td><b>Seamless landing</b> (auto switch to walking); oceans land on the water surface</td></tr>
        <tr><td>V</td><td>Inertial view (camera ignores rotation · pair with time-warp to watch moons orbit)</td></tr>
        <tr><td>R</td><td>Reset view (north up, top-down)</td></tr>
        <tr><td>🪐 Directory</td><td>Pick a body → fly-to animation (left, open by default)</td></tr>
        <tr><td>Double-click label / T / 1–9,0</td><td>GE-style fly-to (target centered)</td></tr>
        <tr><td>Drag (while flying)</td><td>Interrupt the fly-to animation</td></tr>
        <tr><td>G</td><td>Land and walk when near the surface</td></tr>
        <tr><td>F</td><td>Toggle free flight</td></tr>
      </table>
      <h3>🚶 Surface walk</h3>
      <table>
        <tr><td>Mouse / W S A D</td><td>Look (360°) / walk (real surface gravity)</td></tr>
        <tr><td>Scroll back / PageUp</td><td><b>Seamless takeoff</b> back to explore (view preserved)</td></tr>
        <tr><td>Scroll in at water / PageDown</td><td><b>Dive</b> — low-sensitivity rise/sink, stop to hover; surfacing restores automatically</td></tr>
        <tr><td>Shift / Space</td><td>Run / jump (6× higher on the Moon); underwater Space = ascend</td></tr>
        <tr><td>G</td><td>Return to explore mode</td></tr>
      </table>
    </div>
    <div>
      <h3>🚀 Free flight (press F)</h3>
      <table>
        <tr><td>Mouse / Q E</td><td>Pitch & yaw / roll</td></tr>
        <tr><td>W S A D R F</td><td>Six-axis translation</td></tr>
        <tr><td>Scroll / Shift</td><td>Speed gear (1 m/s→2 AU/s) / boost</td></tr>
        <tr><td>X</td><td>Full stop (hover anywhere)</td></tr>
        <tr><td>Esc</td><td>Return to explore mode</td></tr>
      </table>
      <h3>⏱ Time</h3>
      <table>
        <tr><td>[ / ]</td><td>Time warp slower / faster (can reverse)</td></tr>
        <tr><td>P / N</td><td>Pause / back to now</td></tr>
      </table>
      <h3>🖥 Display</h3>
      <table>
        <tr><td>O / L / H</td><td>Orbit lines / labels / this help</td></tr>
        <tr><td>K</td><td>Trans-Neptunian (TNO) orbit lines (off by default)</td></tr>
      </table>
    </div>
  </div>
  <p class="credit">Ephemerides: NASA JPL (Standish planetary elements + Horizons-fitted moon orbits, verified against official data)<br>
  Textures: NASA/USGS data (Solar System Scope CC-BY-4.0 / Steve Albers SOS / JPL Photojournal)</p>
`;

const HELP_TOUCH_EN = `
  <h2>Touch Controls (tap ❓ to close)</h2>
  <h3>🌐 Explore mode (default)</h3>
  <table>
    <tr><td>One-finger drag</td><td>Orbit around focus (with inertia)</td></tr>
    <tr><td>Pinch / spread</td><td>Zoom in / zoom out (spread all the way in → <b>seamless landing</b>)</td></tr>
    <tr><td>Two-finger drag</td><td>Pan the space (no rotation)</td></tr>
    <tr><td>Tap a body / label</td><td>Select / lock focus</td></tr>
    <tr><td>Double-tap label</td><td>Fly to that body (GE animation)</td></tr>
    <tr><td>＋ / － buttons</td><td>Hold to zoom in / out</td></tr>
    <tr><td>🪐 button</td><td>Toggle body directory drawer</td></tr>
    <tr><td>🎯 button</td><td>Toggle selected-body info panel</td></tr>
    <tr><td>✈ button</td><td>Fly to selected body</td></tr>
    <tr><td>🛬 button</td><td>Land (appears when near surface)</td></tr>
    <tr><td>🚀 Fly button</td><td>Enter free-flight mode</td></tr>
    <tr><td>↺ Reset button</td><td>Reset view (north up, top-down)</td></tr>
  </table>
  <h3>🚶 Surface walk</h3>
  <table>
    <tr><td>One-finger drag</td><td>Look around (360°)</td></tr>
    <tr><td>Left joystick</td><td>Walk (real surface gravity)</td></tr>
    <tr><td>↑ Jump button</td><td>Jump (6× higher on the Moon)</td></tr>
    <tr><td>⚡ Run button</td><td>Hold to sprint</td></tr>
    <tr><td>🚀 Takeoff button</td><td>Seamless takeoff back to explore</td></tr>
    <tr><td>🌐 Explore button</td><td>Return to explore mode</td></tr>
  </table>
  <h3>🚀 Free flight</h3>
  <table>
    <tr><td>One-finger drag</td><td>Pitch &amp; yaw</td></tr>
    <tr><td>Left joystick</td><td>Strafe / forward / backward</td></tr>
    <tr><td>▲ / ▼ buttons</td><td>Hold to ascend / descend</td></tr>
    <tr><td>⏹ Stop button</td><td>Full stop (hover anywhere)</td></tr>
    <tr><td>🌐 Explore button</td><td>Return to explore mode</td></tr>
  </table>
  <h3>☰ Menu</h3>
  <table>
    <tr><td>⏮ / ⏭ buttons</td><td>Time warp slower / faster</td></tr>
    <tr><td>⏸ / ⏺ buttons</td><td>Pause / reset to now</td></tr>
    <tr><td>🛤 / 🏷 buttons</td><td>Toggle orbit lines / labels</td></tr>
    <tr><td>🛰 Inertial</td><td>Camera ignores rotation (watch moons orbit)</td></tr>
  </table>
  <p class="credit">Ephemerides: NASA JPL · Textures: NASA/USGS</p>
`;

const HELP_TOUCH_ZH = `
  <h2>触摸操作说明（点 ❓ 关闭）</h2>
  <h3>🌐 探索模式（默认）</h3>
  <table>
    <tr><td>单指拖拽</td><td>环绕焦点旋转（带惯性）</td></tr>
    <tr><td>双指捏合 / 张开</td><td>缩放：张开到底 = <b>无缝降落地表</b></td></tr>
    <tr><td>双指平移</td><td>平移整个空间（无旋转）</td></tr>
    <tr><td>点击天体/标签</td><td>选中 / 锁定焦点</td></tr>
    <tr><td>双击标签</td><td>GE 式飞行动画前往</td></tr>
    <tr><td>＋ / － 按钮</td><td>长按缩放接近 / 远离</td></tr>
    <tr><td>🪐 按钮</td><td>切换天体目录抽屉</td></tr>
    <tr><td>🎯 按钮</td><td>切换目标信息面板</td></tr>
    <tr><td>✈ 前往</td><td>飞往所选天体</td></tr>
    <tr><td>🛬 降落</td><td>贴近地表时出现，点击登陆</td></tr>
    <tr><td>🚀 飞行</td><td>进入自由飞行模式</td></tr>
    <tr><td>↺ 复位</td><td>复位视角（北朝上、俯视）</td></tr>
  </table>
  <h3>🚶 地表行走</h3>
  <table>
    <tr><td>单指拖拽</td><td>环视（360° 自由，可仰望天空）</td></tr>
    <tr><td>左下摇杆</td><td>行走（真实表面重力）</td></tr>
    <tr><td>↑ 跳跃</td><td>跳跃（月球 6 倍高）</td></tr>
    <tr><td>⚡ 奔跑</td><td>长按加速奔跑</td></tr>
    <tr><td>🚀 起飞</td><td>无缝起飞回探索模式</td></tr>
    <tr><td>🌐 探索</td><td>返回探索模式</td></tr>
  </table>
  <h3>🚀 自由飞行</h3>
  <table>
    <tr><td>单指拖拽</td><td>俯仰 / 偏航视角</td></tr>
    <tr><td>左下摇杆</td><td>平移推力（前后左右）</td></tr>
    <tr><td>▲ / ▼ 按钮</td><td>长按上升 / 下降</td></tr>
    <tr><td>⏹ 急停</td><td>全停悬停</td></tr>
    <tr><td>🌐 探索</td><td>返回探索模式</td></tr>
  </table>
  <h3>☰ 菜单</h3>
  <table>
    <tr><td>⏮ / ⏭</td><td>时间倍率 减 / 加</td></tr>
    <tr><td>⏸ / ⏺</td><td>暂停 / 回到现在</td></tr>
    <tr><td>🛤 / 🏷</td><td>切换轨道线 / 标签显示</td></tr>
    <tr><td>🛰 惯性</td><td>相机不随自转，配合时间加速看卫星绕转</td></tr>
  </table>
  <p class="credit">星历：NASA JPL · 贴图：NASA/USGS</p>
`;
