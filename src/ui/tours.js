// 教育导览系统（#39, #40）：带领用户按脚本顺序飞越太阳系关键节点，
// 配合旁白文本与 TTS 语音，将"自由探索"升级为"有引导的沉浸式学习"。
//
// 设计原则：
// - 每个检查点 = 一次 GE 式 flyTo + 停留旁白；用户可随时 next/prev/skip 脱离
// - 旁白文本为多语言数据对象（非 i18n 字典），因为内容长且具叙事性，不适合 key-value 查找
// - dist 字段为距离倍数（相对天体半径）；对半径极小的探测器/边界点设为 null，由 viewDist 接管
// - action 字段告知集成层每个检查点的意图（flyTo/land/lookAt/zoomOut），TourSystem 自身只调 flyTo

import { LANG } from './i18n.js';

// ── 导览专用 UI 文案（短标签）─────────────────────────────────────────
// 遵循 i18n.js 的同构格式 { zh, en, es, ja, fr, de, ru }，便于未来合并入主字典。
// 独立维护而非修改 i18n.js：遵守"只创建新文件"约束。
const UI = {
  'tour.start':    { zh: '🎬 开始导览', en: '🎬 Start tour', es: '🎬 Iniciar gira', ja: '🎬 ツアー開始', fr: '🎬 Démarrer la visite', de: '🎬 Tour starten', ru: '🎬 Начать тур' },
  'tour.next':     { zh: '▶ 下一站',   en: '▶ Next',        es: '▶ Siguiente',  ja: '▶ 次へ',       fr: '▶ Suivant',          de: '▶ Weiter',         ru: '▶ Далее' },
  'tour.prev':     { zh: '◀ 上一站',   en: '◀ Prev',        es: '◀ Anterior',   ja: '◀ 前へ',       fr: '◀ Précédent',        de: '◀ Zurück',         ru: '◀ Назад' },
  'tour.skip':     { zh: '⏭ 跳过导览', en: '⏭ Skip tour',   es: '⏭ Saltar',     ja: '⏭ スキップ',   fr: '⏭ Passer',           de: '⏭ Überspringen',   ru: '⏭ Пропустить' },
  'tour.done':     { zh: '🎉 导览结束', en: '🎉 Tour complete', es: '🎉 Gira completada', ja: '🎉 ツアー完了', fr: '🎉 Visite terminée', de: '🎉 Tour abgeschlossen', ru: '🎉 Тур завершён' },
  'tour.checkpoint': { zh: '第 {n}/{t} 站', en: 'Stop {n}/{t}', es: 'Parada {n}/{t}', ja: '第{n}/{t}駅', fr: 'Arrêt {n}/{t}', de: 'Station {n}/{t}', ru: 'Остановка {n}/{t}' },
};

/** 导览 UI 本地化（与 i18n.t() 同语义：当前语言 → en → zh 回退） */
function tt(key, vars) {
  const e = UI[key];
  let s = e ? (e[LANG] ?? e.en ?? e.zh ?? key) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
// 导览数据
// ═══════════════════════════════════════════════════════════════════════

/**
 * Issue #39："我们的后院有多大？"——太阳系尺度导览
 * 从地球表面出发，逐站外推至奥尔特云，让用户直观感受太阳系的层层尺度。
 * 每站旁白包含真实距离与旅行时间，结尾与最近恒星比较。
 */
const BACKYARD_TOUR = {
  id: 'backyard',
  title: { zh: '我们的后院有多大？', en: 'How Big Is Our Backyard?', es: '¿Qué tan grande es nuestro patio?', ja: '私たちの裏庭はどれくらい大きい？', fr: 'Quelle est la taille de notre arrière-cour ?', de: 'Wie groß ist unser Hinterhof ?', ru: 'Как велик наш задний двор?' },
  description: {
    zh: '从地球表面到奥尔特云，逐站感受太阳系的层层尺度。',
    en: 'From Earth\'s surface to the Oort Cloud, experience the layered scales of the Solar System.',
    es: 'Desde la superficie de la Tierra hasta la Nube de Oort, experimenta las escalas del Sistema Solar.',
    ja: '地球表面からオールト雲まで、太陽系の階層的なスケールを体験。',
    fr: 'De la surface de la Terre au nuage d\'Oort, ressentez les échelles du Système solaire.',
    de: 'Von der Erdoberfläche bis zur Oortschen Wolke — erlebe die Skalen des Sonnensystems.',
    ru: 'От поверхности Земли до облака Оорта — ощутите масштабы Солнечной системы.',
  },
  checkpoints: [
    // 1. 地球表面
    {
      bodyId: 'earth',
      dist: 1.003,
      action: 'land',
      duration: 10,
      narration: {
        zh: '让我们从脚下开始。你正站在地球表面——一颗半径 6371 公里的蓝色弹珠。人类在此繁衍了 30 万年，却直到昨天才真正离开它的怀抱。',
        en: 'Let us begin at your feet. You stand on Earth\'s surface — a blue marble 6,371 km in radius. Humanity has thrived here for 300,000 years, yet only yesterday did we truly leave its embrace.',
        es: 'Empecemos por tus pies. Estás en la superficie de la Tierra — una canica azul de 6,371 km de radio. La humanidad ha prosperado aquí 300,000 años, pero solo ayer dejamos su abrazo.',
        ja: '足元から始めよう。あなたは地球の表面に立っている——半径6371kmの青いビー玉。人類はここで30万年繁栄したが、その抱擁を離れたのはつい昨日のことだ。',
        fr: 'Commençons par vos pieds. Vous êtes à la surface de la Terre — une bille bleue de 6 371 km de rayon. L\'humanité y prospère depuis 300 000 ans, mais ce n\'est qu\'hier que nous l\'avons quittée.',
        de: 'Beginnen wir zu deinen Füßen. Du stehst auf der Erdoberfläche — eine blaue Murmel mit 6.371 km Radius. Die Menschheit gedieh hier 300.000 Jahre, doch erst gestern verließen wir ihre Umarmung.',
        ru: 'Начнём с ваших ног. Вы стоите на поверхности Земли — голубого шарика радиусом 6 371 км. Человечество процветало здесь 300 000 лет, но лишь вчера мы по-настоящему покинули её объятия.',
      },
    },
    // 2. 地球轨道
    {
      bodyId: 'earth',
      dist: 4,
      action: 'flyTo',
      duration: 9,
      narration: {
        zh: '抬升到地球轨道高度。从这里看，大气层只是一层薄纱——厚度不足地球半径的 1%。国际空间站就在这层薄纱之内，以每秒 7.8 公里绕地球飞行，90 分钟一圈。',
        en: 'Rising to Earth orbit. From here, the atmosphere is but a thin veil — less than 1% of Earth\'s radius. The International Space Station flies within this veil at 7.8 km/s, circling Earth every 90 minutes.',
        es: 'Subiendo a la órbita terrestre. Desde aquí, la atmósfera es un velo fino — menos del 1% del radio de la Tierra. La Estación Espacial Internacional vuela a 7.8 km/s, orbitando cada 90 minutos.',
        ja: '地球軌道へ上昇。ここから見ると大気は薄いベール——地球半径の1%未満。国際宇宙ステーションは7.8 km/sで90分周回している。',
        fr: 'Montée en orbite terrestre. D\'ici, l\'atmosphère n\'est qu\'un voile — moins de 1% du rayon terrestre. La Station Spatiale Internationale file à 7,8 km/s, bouclant un tour en 90 minutes.',
        de: 'Aufstieg in die Erdumlaufbahn. Von hier ist die Atmosphäre nur ein Schleier — weniger als 1% des Erdradius. Die ISS fliegt mit 7,8 km/s und umrundet die Erde in 90 Minuten.',
        ru: 'Подъём на околоземную орбиту. Отсюда атмосфера — лишь тонкая вуаль, менее 1% радиуса Земли. МКС летит со скоростью 7,8 км/с, обращаясь вокруг Земли за 90 минут.',
      },
    },
    // 3. 月球
    {
      bodyId: 'moon',
      dist: 4,
      action: 'flyTo',
      duration: 9,
      narration: {
        zh: '月球——地球唯一的天然卫星，平均距离 38 万 4 千公里。阿波罗宇航员用了 3 天才飞到这里，光只需 1.3 秒。潮汐锁定让它永远以同一面朝向我们。',
        en: 'The Moon — Earth\'s only natural satellite, 384,000 km away on average. Apollo astronauts took 3 days to fly here; light makes the journey in 1.3 seconds. Tidal locking forever turns the same face toward us.',
        es: 'La Luna — el único satélite natural de la Tierra, a 384,000 km de distancia. Los astronautas del Apolo tardaron 3 días; la luz solo 1.3 segundos. El acoplamiento de mareas siempre nos muestra la misma cara.',
        ja: '月——地球唯一の天然衛星、平均38万4千km。アポロ宇宙飛行士は3日かけて到着、光は1.3秒。潮汐ロックで常に同じ面を向けている。',
        fr: 'La Lune — le seul satellite naturel de la Terre, à 384 000 km en moyenne. Les astronautes d\'Apollo ont mis 3 jours ; la lumière 1,3 seconde. Le verrouillage maréal lui fait toujours montrer la même face.',
        de: 'Der Mond — der einzige natürliche Satellit der Erde, 384.000 km entfernt. Apollo-Astronauten brauchten 3 Tage; Licht 1,3 Sekunden. Die Gezeitenbindung zeigt uns immer dieselbe Seite.',
        ru: 'Луна — единственный естественный спутник Земли, в среднем 384 000 км. Астронавты «Аполлона» летели 3 дня; свет — 1,3 секунды. Приливный захват навсегда развернул к нам одну сторону.',
      },
    },
    // 4. 火星
    {
      bodyId: 'mars',
      dist: 4,
      action: 'flyTo',
      duration: 9,
      narration: {
        zh: '火星，红色行星。最近时距地球约 5460 万公里，最远时超过 4 亿公里。以现有火箭技术到达这里需要 6 到 9 个月。它是人类下一个踏足的目标。',
        en: 'Mars, the Red Planet. At closest approach, 54.6 million km from Earth; at farthest, over 400 million km. With current rocket technology, the journey takes 6 to 9 months. It is humanity\'s next destination.',
        es: 'Marte, el Planeta Rojo. En su máxima aproximación, 54.6 millones de km; en su lejanía, más de 400 millones. Con cohetes actuales, el viaje dura de 6 a 9 meses. Es el próximo destino de la humanidad.',
        ja: '火星、赤い惑星。最接近時は5460万km、最遠時は4億km超。現在のロケット技術で6〜9ヶ月。人類の次なる目的地。',
        fr: 'Mars, la planète rouge. Au plus près, 54,6 millions de km ; au plus loin, plus de 400 millions. Avec les fusées actuelles, le voyage dure 6 à 9 mois. C\'est la prochaine destination de l\'humanité.',
        de: 'Mars, der Rote Planet. In Erdnähe 54,6 Millionen km; in Erdferne über 400 Millionen. Mit heutigen Raketen dauert die Reise 6 bis 9 Monate. Er ist das nächste Ziel der Menschheit.',
        ru: 'Марс, Красная планета. В ближайшей точке 54,6 млн км; в дальней — более 400 млн. С современными ракетами путь занимает 6–9 месяцев. Это следующая цель человечества.',
      },
    },
    // 5. 木星
    {
      bodyId: 'jupiter',
      dist: 4,
      action: 'flyTo',
      duration: 10,
      narration: {
        zh: '木星——太阳系的巨人。半径是地球的 11 倍，距太阳 7.8 亿公里。旅行者号探测器用了 13 个月才飞掠此处。它的引力像清道夫一样保护着内太阳系。',
        en: 'Jupiter — the giant of the Solar System. Eleven times Earth\'s radius, 780 million km from the Sun. The Voyager probes took 13 months to fly past. Its gravity acts as a sweeper, shielding the inner Solar System.',
        es: 'Júpiter — el gigante del Sistema Solar. Once veces el radio de la Tierra, a 780 millones de km del Sol. Las sondas Voyager tardaron 13 meses en sobrevolarlo. Su gravedad protege el Sistema Solar interior.',
        ja: '木星——太陽系の巨人。地球半径の11倍、太陽から7.8億km。ボイジャー探査機は13ヶ月かけて飛掠。その重力は内太陽系を守る掃除屋。',
        fr: 'Jupiter — le géant du Système solaire. Onze fois le rayon terrestre, à 780 millions de km du Soleil. Les sondes Voyager ont mis 13 mois pour le survoler. Sa gravité protège le Système solaire intérieur.',
        de: 'Jupiter — der Riese des Sonnensystems. Elfmal der Erdradius, 780 Millionen km von der Sonne. Die Voyager-Sonden brauchten 13 Monate. Seine Schwerkraft schützt das innere Sonnensystem.',
        ru: 'Юпитер — великан Солнечной системы. В 11 раз больше Земли по радиусу, 780 млн км от Солнца. «Вояджеры» летели 13 месяцев. Его гравитация защищает внутреннюю Солнечную систему.',
      },
    },
    // 6. 土星
    {
      bodyId: 'saturn',
      dist: 4,
      action: 'flyTo',
      duration: 10,
      narration: {
        zh: '土星及其壮丽的环系。距太阳 14 亿公里，卡西尼号探测器花了 7 年才到达。环宽 28 万公里却只有几十米厚——按比例比一张纸还薄。',
        en: 'Saturn and its magnificent rings. 1.4 billion km from the Sun; the Cassini spacecraft took 7 years to arrive. The rings span 280,000 km yet are only tens of meters thick — proportionally thinner than a sheet of paper.',
        es: 'Saturno y sus magníficos anillos. A 1,400 millones de km del Sol; la sonda Cassini tardó 7 años. Los anillos abarcan 280,000 km pero solo decenas de metros de grosor — más finos que una hoja de papel.',
        ja: '土星と壮大な環。太陽から14億km；カッシーニ探査機は7年かけて到着。環は28万kmの幅だが厚さ数十m——紙より薄い。',
        fr: 'Saturne et ses anneaux magnifiques. À 1,4 milliard de km du Soleil ; la sonde Cassini a mis 7 ans. Les anneaux s\'étendent sur 280 000 km mais ne font que des dizaines de mètres d\'épaisseur — plus fins qu\'une feuille de papier.',
        de: 'Saturn und seine magnifischen Ringe. 1,4 Milliarden km von der Sonne; die Cassini-Sonde brauchte 7 Jahre. Die Ringe spannen 280.000 km, sind aber nur Dutzende Meter dick — dünner als ein Papierblatt.',
        ru: 'Сатурн и его великолепные кольца. 1,4 млрд км от Солнца; зонд «Кассини» летел 7 лет. Кольца простираются на 280 000 км при толщине в десятки метров — тоньше листа бумаги.',
      },
    },
    // 7. 海王星
    {
      bodyId: 'neptune',
      dist: 4,
      action: 'flyTo',
      duration: 10,
      narration: {
        zh: '海王星——最遥远的行星。距太阳 45 亿公里，是地球到太阳距离的 30 倍。旅行者 2 号用了 12 年才飞抵此处。阳光到这里需要 4 小时。',
        en: 'Neptune — the most distant planet. 4.5 billion km from the Sun, 30 times Earth\'s orbital distance. Voyager 2 took 12 years to reach here. Sunlight takes 4 hours to arrive.',
        es: 'Neptuno — el planeta más distante. A 4,500 millones de km del Sol, 30 veces la distancia de la Tierra. Voyager 2 tardó 12 años. La luz solar tarda 4 horas en llegar.',
        ja: '海王星——最遠の惑星。太陽から45億km、地球の30倍。ボイジャー2号は12年かけて到着。太陽光は4時間かかる。',
        fr: 'Neptune — la planète la plus éloignée. À 4,5 milliards de km du Soleil, 30 fois la distance terrestre. Voyager 2 a mis 12 ans. La lumière du soleil met 4 heures.',
        de: 'Neptun — der am weitesten entfernte Planet. 4,5 Milliarden km von der Sonne, 30-mal die Erdentfernung. Voyager 2 brauchte 12 Jahre. Das Sonnenlicht braucht 4 Stunden.',
        ru: 'Нептун — самая дальняя планета. 4,5 млрд км от Солнца, в 30 раз дальше Земли. «Вояджер-2» летел 12 лет. Свет Солнца идёт 4 часа.',
      },
    },
    // 8. 旅行者1号
    {
      bodyId: 'voyager1',
      dist: null,
      action: 'flyTo',
      duration: 11,
      narration: {
        zh: '旅行者 1 号——人类制造的最远物体。1977 年发射，已飞行 47 年，距太阳约 240 亿公里（160 AU）。它携带的金唱片记录着地球的问候，将在星际空间漂流数十亿年。',
        en: 'Voyager 1 — the farthest human-made object. Launched in 1977, it has flown for 47 years and now lies 24 billion km (160 AU) from the Sun. Its Golden Record carries Earth\'s greetings, drifting through interstellar space for billions of years to come.',
        es: 'Voyager 1 — el objeto humano más lejano. Lanzado en 1977, ha volado 47 años y está a 24,000 millones de km (160 UA). Su Disco de Oro lleva saludos de la Tierra, a la deriva eones en el espacio interestelar.',
        ja: 'ボイジャー1号——人類最遠の物体。1977年打ち上げ、47年飛行し、太陽から約240億km（160 AU）。金色のレコードが地球の挨拶を運び、数十億年漂流する。',
        fr: 'Voyager 1 — l\'objet humain le plus lointain. Lancé en 1977, il a volé 47 ans et se trouve à 24 milliards de km (160 UA). Son Disque d\'Or porte les saluts de la Terre, dérivant des milliards d\'années dans l\'espace interstellaire.',
        de: 'Voyager 1 — das am weitesten entfernte menschliche Objekt. 1977 gestartet, 47 Jahre geflogen, nun 24 Milliarden km (160 AE) von der Sonne. Die Goldene Schallplatte trägt die Grüße der Erde, Milliarden Jahre durch den interstellaren Raum treibend.',
        ru: '«Вояджер-1» — самый дальний рукотворный объект. Запущен в 1977 году, летит 47 лет, сейчас в 24 млрд км (160 а.е.) от Солнца. Золотая пластинка несёт приветствия Земли, дрейфуя миллиарды лет в межзвёздном пространстве.',
      },
    },
    // 9. 日球层顶
    {
      bodyId: 'heliopause',
      dist: null,
      action: 'flyTo',
      duration: 11,
      narration: {
        zh: '日球层顶——太阳风的尽头。距太阳约 121 AU（180 亿公里）。旅行者 1 号于 2012 年穿越此处，成为首个进入星际空间的人造物体。太阳的势力范围到此为止。',
        en: 'The Heliopause — where the solar wind ends. About 121 AU (18 billion km) from the Sun. Voyager 1 crossed here in 2012, becoming the first human-made object to enter interstellar space. The Sun\'s domain ends here.',
        es: 'La Heliopausa — donde termina el viento solar. A unas 121 UA (18,000 millones de km). Voyager 1 la cruzó en 2012, siendo el primer objeto humano en el espacio interestelar. El dominio del Sol termina aquí.',
        ja: 'ヘリオポーズ——太陽風の終着点。太陽から約121 AU（180億km）。ボイジャー1号が2012年に通過し、初の星間空間到達物体に。太陽の領域はここまで。',
        fr: 'L\'Héliopause — là où s\'arrête le vent solaire. À environ 121 UA (18 milliards de km). Voyager 1 l\'a franchie en 2012, devenant le premier objet humain dans l\'espace interstellaire. Le domaine du Soleil s\'arrête ici.',
        de: 'Die Heliopause — wo der Sonnenwind endet. Etwa 121 AE (18 Milliarden km). Voyager 1 durchquerte sie 2012 als erstes menschliches Objekt im interstellaren Raum. Die Herrschaft der Sonne endet hier.',
        ru: 'Гелиопауза — где заканчивается солнечный ветер. Около 121 а.е. (18 млрд км). «Вояджер-1» пересёк её в 2012 году, став первым рукотворным объектом в межзвёздном пространстве. Власть Солнца заканчивается здесь.',
      },
    },
    // 10. 奥尔特云
    {
      bodyId: 'oortcloud',
      dist: null,
      action: 'zoomOut',
      duration: 14,
      narration: {
        zh: '奥尔特云——太阳系的最后疆界。这是一个距太阳 2000 到 10 万 AU 的球状彗星云团。10 万 AU 约等于 1.6 光年。而最近的恒星比邻星在 4.24 光年之外——我们的后院，在宇宙尺度上不过是后院的一角。',
        en: 'The Oort Cloud — the Solar System\'s final frontier. A spherical comet cloud 2,000 to 100,000 AU from the Sun. 100,000 AU is about 1.6 light-years. The nearest star, Proxima Centauri, lies 4.24 light-years away — our backyard, on the cosmic scale, is but a corner of it.',
        es: 'La Nube de Oort — la frontera final del Sistema Solar. Una nube esférica de cometas a 2,000–100,000 UA del Sol. 100,000 UA son 1.6 años luz. La estrella más cercana, Próxima Centauri, está a 4.24 años luz — nuestro patio es solo una esquina del cosmos.',
        ja: 'オールト雲——太陽系の最終境界。太陽から2000〜10万AUの球状彗星雲。10万AUは約1.6光年。最近の恒星プロキシマ・ケンタウリは4.24光年先——宇宙規模では裏庭の一角に過ぎない。',
        fr: 'Le Nuage d\'Oort — la frontière finale du Système solaire. Un nuage sphérique de comètes à 2 000–100 000 UA. 100 000 UA font environ 1,6 année-lumière. L\'étoile la plus proche, Proxima Centauri, est à 4,24 années-lumière — notre arrière-cour n\'est qu\'un coin du cosmos.',
        de: 'Die Oortsche Wolke — die letzte Grenze des Sonnensystems. Eine kugelförmige Kometenwolke 2.000–100.000 AE von der Sonne. 100.000 AE sind 1,6 Lichtjahre. Der nächste Stern, Proxima Centauri, ist 4,24 Lichtjahre entfernt — unser Hinterhof ist nur ein Eck des Kosmos.',
        ru: 'Облако Оорта — последняя граница Солнечной системы. Сферическое облако комет 2 000–100 000 а.е. от Солнца. 100 000 а.е. — около 1,6 светового года. Ближайшая звезда, Проксима Центавра, в 4,24 светового года — наш задний двор лишь уголок космоса.',
      },
    },
  ],
};

/**
 * Issue #40："站在月球上看地球"——地月系统导览
 * 从地球轨道飞向月球、着陆、转身看地球升起，解释潮汐锁定与"暗淡蓝点"。
 */
const EARTH_MOON_TOUR = {
  id: 'earth-moon',
  title: { zh: '站在月球上看地球', en: 'Standing on the Moon, Looking at Earth', es: 'De pie en la Luna, mirando la Tierra', ja: '月に立って地球を見る', fr: 'Sur la Lune, regardant la Terre', de: 'Auf dem Mond, die Erde betrachtend', ru: 'На Луне, глядя на Землю' },
  description: {
    zh: '飞向月球、着陆、转身看地球升起——感受潮汐锁定与"暗淡蓝点"。',
    en: 'Fly to the Moon, land, turn around to watch Earth rise — feel tidal locking and the "Pale Blue Dot".',
    es: 'Vuela a la Luna, aterriza, gira para ver salir la Tierra — siente el acoplamiento de mareas y el "Punto Azul Pálido".',
    ja: '月へ飛び、着陸し、振り返って地球の昇りを見る——潮汐ロックと「青い点」を感じる。',
    fr: 'Volez vers la Lune, atterrissez, retournez-vous pour voir la Terre se lever — ressentez le verrouillage maréal et le « Point Bleu Pâle ».',
        de: 'Fliege zum Mond, lande, drehe dich um und sieh die Erde aufgehen — fühle die Gezeitenbindung und den „Blassen Blauen Punkt“.',
        ru: 'Лети на Луну, сядь, обернись и увидь восход Земли — ощути приливный захват и «Бледно-голубую точку».',
  },
  checkpoints: [
    // 1. 地球轨道
    {
      bodyId: 'earth',
      dist: 4,
      action: 'flyTo',
      duration: 9,
      narration: {
        zh: '我们从地球轨道出发。看看这颗蓝色星球——它是已知宇宙中唯一孕育生命的世界。大气、海洋、陆地，一切生命所需恰到好处地存在于此。',
        en: 'We begin in Earth orbit. Look at this blue planet — the only world in the known universe to harbor life. Atmosphere, oceans, land — everything life needs exists here in perfect measure.',
        es: 'Comenzamos en órbita terrestre. Mira este planeta azul — el único mundo conocido con vida. Atmósfera, océanos, tierra — todo lo que la vida necesita está aquí en perfecta medida.',
        ja: '地球軌道から始める。この青い惑星を見て——既知の宇宙で唯一生命を宿す世界。大気、海、陸、生命に必要なすべてが完璧な均衡で存在する。',
        fr: 'Nous commençons en orbite terrestre. Regardez cette planète bleue — le seul monde connu abritant la vie. Atmosphère, océans, terres — tout ce dont la vie a besoin est ici en parfaite mesure.',
        de: 'Wir beginnen in der Erdumlaufbahn. Schau auf diesen blauen Planeten — die einzige bekannte Welt mit Leben. Atmosphäre, Ozeane, Land — alles, was das Leben braucht, ist hier in perfektem Maß.',
        ru: 'Начинаем на околоземной орбите. Посмотрите на эту голубую планету — единственный известный мир с жизнью. Атмосфера, океаны, суша — всё, что нужно жизни, здесь в идеальной мере.',
      },
    },
    // 2. 月球接近
    {
      bodyId: 'moon',
      dist: 4,
      action: 'flyTo',
      duration: 10,
      narration: {
        zh: '现在飞向月球。38 万 4 千公里的旅程。注意月球表面——那些暗色区域是古代玄武岩平原，称为"月海"；亮色区域是古老的高地，布满撞击坑。',
        en: 'Now we fly to the Moon. A journey of 384,000 km. Note the lunar surface — the dark areas are ancient basalt plains called "maria"; the bright areas are ancient highlands, covered in impact craters.',
        es: 'Ahora volamos a la Luna. Un viaje de 384,000 km. Observa la superficie — las zonas oscuras son llanuras de basalto antiguo llamadas "maria"; las zonas brillantes son tierras altas llenas de cráteres.',
        ja: '月へ飛ぶ。38万4千kmの旅。月面に注目——暗い領域は古代玄武岩平原「海」、明るい領域はクレーターだらけの古老した高地。',
        fr: 'Maintenant nous volons vers la Lune. Un voyage de 384 000 km. Notez la surface — les zones sombres sont d\'anciennes plaines basaltiques appelées « mers » ; les zones claires sont de anciennes hautes terres, couvertes de cratères.',
        de: 'Nun fliegen wir zum Mond. Eine Reise von 384.000 km. Beachte die Oberfläche — die dunklen Gebiete sind alte Basaltebenen, die „Mare“; die hellen sind alte Hochländer, voller Krater.',
        ru: 'Теперь летим к Луне. Путешествие 384 000 км. Отметьте поверхность — тёмные области это древние базальтовые равнины, «моря»; светлые — древние возвышенности, усыпанные кратерами.',
      },
    },
    // 3. 月面着陆
    {
      bodyId: 'moon',
      dist: 1.003,
      action: 'land',
      duration: 11,
      narration: {
        zh: '降落在月球表面。月球重力只有地球的六分之一。阿波罗宇航员形容在这里行走像"慢动作蹦床"。看看四周——没有大气，天空永远是漆黑的，即使太阳高挂。',
        en: 'Landing on the lunar surface. The Moon\'s gravity is one-sixth of Earth\'s. Apollo astronauts described walking here as a "slow-motion trampoline." Look around — no atmosphere means an eternally black sky, even with the Sun overhead.',
        es: 'Aterrizando en la superficie lunar. La gravedad es un sexto de la terrestre. Los astronautas del Apolo lo describieron como un «trampolín a cámara lenta». Mira alrededor — sin atmósfera, el cielo es eternamente negro, incluso con el Sol encima.',
        ja: '月面に着陸。月の重力は地球の6分の1。アポロ宇宙飛行士は「スローモーションのトランポリン」と形容。周囲を見て——大気がないため、太陽が頭上でも空は永遠に漆黒。',
        fr: 'Atterrissage sur la surface lunaire. La gravité est le sixième de celle de la Terre. Les astronautes d\'Apollo décrivaient la marche comme un « trampoline au ralenti ». Regardez autour — pas d\'atmosphère, le ciel est éternellement noir, même avec le Soleil au zénith.',
        de: 'Landung auf der Mondoberfläche. Die Schwerkraft ist ein Sechstel der Erde. Apollo-Astronauten nannten das Gehen einen „Zeitlupen-Trampolin“. Schau dich um — keine Atmosphäre bedeutet ewig schwarzen Himmel, selbst bei Sonne.',
        ru: 'Посадка на поверхность Луны. Гравитация — одна шестая земной. Астронавты «Аполлона» описывали ходьбу как «замедленный батут». Оглянитесь — без атмосферы небо вечно чёрное, даже при солнце.',
      },
    },
    // 4. 转身
    {
      bodyId: 'moon',
      dist: 1.003,
      action: 'lookAt',
      duration: 10,
      narration: {
        zh: '现在转身，面向地球。由于潮汐锁定，从月球正面看，地球几乎悬停在天空中的同一位置，不像地球上的月亮会东升西落。这就是为什么我们永远看不到月球的背面。',
        en: 'Now turn around, face the Earth. Because of tidal locking, from the Moon\'s near side, Earth hangs nearly motionless in the sky — unlike the Moon as seen from Earth, which rises and sets. This is why we can never see the Moon\'s far side.',
        es: 'Ahora date la vuelta, mira la Tierra. Por el acoplamiento de mareas, desde el lado cercano de la Luna, la Tierra cuelga casi inmóvil en el cielo — a diferencia de la Luna vista desde la Tierra, que sale y se pone. Por eso nunca vemos el lado oculto.',
        ja: 'さあ振り返り、地球を向け。潮汐ロックのため、月の表側からは地球がほぼ空中に静止して見える——地球から見る月のように昇降しない。だから月の裏側は永遠に見えない。',
        fr: 'Maintenant retournez-vous, face à la Terre. À cause du verrouillage maréal, depuis la face visible de la Lune, la Terre est presque immobile dans le ciel — contrairement à la Lune vue de la Terre, qui se lève et se couche. C\'est pourquoi nous ne voyons jamais la face cachée.',
        de: 'Nun drehe dich um, schau zur Erde. Wegen der Gezeitenbindung hängt die Erde vom nahen Mond aus fast unbeweglich am Himmel — anders als der Mond von der Erde, der auf- und untergeht. Deshalb sehen wir nie die Rückseite des Mondes.',
        ru: 'Теперь обернитесь, посмотрите на Землю. Из-за приливного захвата с ближней стороны Луны Земля почти неподвижно висит в небе — в отличие от Луны, которую с Земли видно восходящей и заходящей. Поэтому мы никогда не видим обратную сторону Луны.',
      },
    },
    // 5. 看到地球升起
    {
      bodyId: 'moon',
      dist: 1.003,
      action: 'lookAt',
      duration: 13,
      narration: {
        zh: '看那颗升起的蓝色弹珠——这就是阿波罗 8 号宇航员在月球轨道上拍下的"地出"。比尔·安德斯说："我们大老远来探索月球，最重要的是我们发现了地球。"卡尔·萨根称它为"暗淡蓝点"——我们唯一的家园。',
        en: 'Behold the rising blue marble — this is the "Earthrise" captured by Apollo 8 astronauts in lunar orbit. Bill Anders said: "We came all this way to explore the Moon, and the most important thing is that we discovered the Earth." Carl Sagan called it the "Pale Blue Dot" — our only home.',
        es: 'Contempla la canica azul que sale — este es el «Salida de la Tierra» capturado por los astronautas del Apolo 8. Bill Anders dijo: «Vinimos a explorar la Luna, y lo más importante fue que descubrimos la Tierra». Carl Sagan la llamó «Punto Azul Pálido» — nuestro único hogar.',
        ja: '昇る青いビー玉を見よ——これがアポロ8号が月軌道で撮った「地出」。ビル・アンダースは言った。「月を探索に来たが、最も重要だったのは地球を発見したことだ」。カール・セーガンは「青い点」と呼んだ——我々唯一の家。',
        fr: 'Contemplez la bille bleue qui se lève — c\'est le « lever de Terre » capturé par les astronautes d\'Apollo 8. Bill Anders a dit : « Nous sommes venus si loin pour explorer la Lune, et le plus important fut que nous découvrîmes la Terre. » Carl Sagan l\'a appelée le « Point Bleu Pâle » — notre unique foyer.',
        de: 'Schaue die aufgehende blaue Murmel — dies ist der „Earthrise“, den Apollo-8-Astronauten aus der Mondumlaufbahn aufnahmen. Bill Anders sagte: „Wir kamen, um den Mond zu erforschen, und das Wichtigste war, dass wir die Erde entdeckten.“ Carl Sagan nannte sie den „Blassen Blauen Punkt“ — unser einziges Zuhause.',
        ru: 'Взгляните на восходящий голубой шарик — это «Восход Земли», снятый астронавтами «Аполлона-8» с лунной орбиты. Билл Андерс сказал: «Мы летели так далеко, чтобы исследовать Луну, а самое важное — мы открыли Землю». Карл Саган назвал её «Бледно-голубой точкой» — наш единственный дом.',
      },
    },
  ],
};

/** 所有导览的注册表（按 id 索引） */
export const TOURS = {
  [BACKYARD_TOUR.id]: BACKYARD_TOUR,
  [EARTH_MOON_TOUR.id]: EARTH_MOON_TOUR,
};

// ═══════════════════════════════════════════════════════════════════════
// TourSystem
// ═══════════════════════════════════════════════════════════════════════

/**
 * 导览播放器：按检查点序列驱动 flyTo + 旁白展示。
 *
 * @param {Object}   opts
 * @param {Function} opts.flyTo    (bodyId, fromId?) => void — GE 式飞行动画
 * @param {Function} opts.select   (bodyId) => void — 选中天体（更新信息面板）
 * @param {Function} opts.getMode  () => 'orbit'|'fly'|'walk' — 当前相机模式
 * @param {Function} opts.setMode  (mode) => void — 切换相机模式（集成层提供）
 * @param {Object}   opts.hud      HUD 实例（用于 tip() 显示旁白）
 */
export class TourSystem {
  constructor({ flyTo, select, getMode, setMode, hud }) {
    this.flyTo = flyTo;
    this.select = select;
    this.getMode = getMode;
    this.setMode = setMode;
    this.hud = hud;
    this._activeTourId = null;
    this._checkpointIndex = -1;
    this._timer = null;
    // 旁白回调：集成层可注册以驱动 TTS（Narrator）
    this.onNarration = null;
  }

  /**
   * 开始一个导览。会切换到探索模式（flyTo 依赖 orbit 相机）。
   * @param {string} tourId 'backyard' | 'earth-moon'
   * @returns {boolean} 是否成功启动
   */
  start(tourId) {
    const tour = TOURS[tourId];
    if (!tour) return false;
    // 确保处于探索模式——flyTo 内部也会处理，但提前切换可避免从 walk 起飞时的姿态跳变
    if (this.getMode && this.getMode() !== 'orbit' && this.setMode) {
      this.setMode('orbit');
    }
    this._activeTourId = tourId;
    this._checkpointIndex = -1;
    this.next();
    return true;
  }

  /** 前进到下一个检查点。到达末尾时自动结束导览。 */
  next() {
    if (!this._activeTourId) return false;
    const tour = TOURS[this._activeTourId];
    this._checkpointIndex++;
    if (this._checkpointIndex >= tour.checkpoints.length) {
      this._finish();
      return false;
    }
    this._gotoCheckpoint(tour.checkpoints[this._checkpointIndex]);
    return true;
  }

  /** 返回上一个检查点。 */
  prev() {
    if (!this._activeTourId) return false;
    this._checkpointIndex = Math.max(0, this._checkpointIndex - 1);
    const tour = TOURS[this._activeTourId];
    this._gotoCheckpoint(tour.checkpoints[this._checkpointIndex]);
    return true;
  }

  /** 跳过导览（停止播放，清理状态）。 */
  skip() {
    this._activeTourId = null;
    this._checkpointIndex = -1;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.hud) this.hud.tip(null);
  }

  /**
   * 当前检查点信息。
   * @returns {{id:string, title:string, narration:string, checkpoint:Object}|null}
   */
  get current() {
    if (!this._activeTourId) return null;
    const tour = TOURS[this._activeTourId];
    const cp = tour.checkpoints[this._checkpointIndex];
    if (!cp) return null;
    return {
      id: cp.bodyId,
      title: tour.title[LANG] ?? tour.title.en ?? tour.title.zh,
      narration: cp.narration[LANG] ?? cp.narration.en ?? cp.narration.zh,
      checkpoint: cp,
    };
  }

  /** 可用导览列表（元数据，不含完整旁白）。 */
  get tours() {
    return Object.values(TOURS).map((t) => ({
      id: t.id,
      title: t.title[LANG] ?? t.title.en ?? t.title.zh,
      description: t.description[LANG] ?? t.description.en ?? t.description.zh,
      checkpointCount: t.checkpoints.length,
    }));
  }

  /** 导览是否正在播放。 */
  get isActive() {
    return this._activeTourId !== null;
  }

  /** 当前检查点序号（0-based），未播放时为 -1。 */
  get checkpointIndex() {
    return this._checkpointIndex;
  }

  // ── 内部 ──────────────────────────────────────────────────────────

  _gotoCheckpoint(cp) {
    // 执行飞行动画：所有 action 都先 flyTo 到目标天体；
    // 'land'/'lookAt'/'zoomOut' 的额外行为由集成层根据 action 字段决定
    this.flyTo(cp.bodyId);
    this.select(cp.bodyId);

    // 显示旁白（HUD tip）
    const text = cp.narration[LANG] ?? cp.narration.en ?? cp.narration.zh;
    if (this.hud) {
      const progress = tt('tour.checkpoint', {
        n: this._checkpointIndex + 1,
        t: TOURS[this._activeTourId].checkpoints.length,
      });
      this.hud.tip(`${progress}　${text}`);
    }

    // 通知旁白回调（驱动 TTS）
    if (this.onNarration) this.onNarration(text, cp);

    // 自动前进
    if (this._timer) clearTimeout(this._timer);
    if (cp.duration > 0) {
      this._timer = setTimeout(() => this.next(), cp.duration * 1000);
    }
  }

  _finish() {
    const wasActive = this._activeTourId;
    this._activeTourId = null;
    this._checkpointIndex = -1;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.hud) this.hud.tip(tt('tour.done'));
  }
}
