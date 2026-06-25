// 英文界面内容（天体描述 + 科教知识卡片）。中文数据散落在各 astro/scene 数据文件中，
// 此处按 id 集中提供英文版，在 LANG==='en' 时于显示点（targetInfo / factsFor）覆盖，
// 保持中文数据文件不变。缺失键回退中文。

/** 天体描述（信息面板 desc 行）英文版，按 id。 */
export const DESC_EN = {
  // ── 行星 / 矮行星 ──
  sun: 'A G2V main-sequence star holding 99.86% of the Solar System\'s mass. Surface ~5772 K; its core fuses hydrogen, releasing 3.8×10²⁶ watts every second.',
  mercury: 'The innermost planet, locked in a 3:2 spin–orbit resonance. Airless, with a 600 °C day–night swing and a heavily cratered surface.',
  venus: 'Earth\'s near-twin in size, but smothered by a CO₂ atmosphere 92× Earth\'s pressure and sulfuric-acid clouds. Surface 465 °C; it spins backwards, and a day lasts longer than its year.',
  earth: 'The only world known to harbor life. 71% of its surface is liquid water, with a nitrogen–oxygen atmosphere and a large moon that steadies its axis. Your home.',
  mars: 'The Red Planet. Home to the tallest volcano (Olympus Mons, 21.9 km) and longest canyon (Valles Marineris, 4000 km) in the Solar System. Thin CO₂ air; dust storms can engulf the globe.',
  jupiter: 'The largest planet — 2.5× the mass of all the others combined. The Great Red Spot is an anticyclone raging for centuries, ringed by a strong magnetic field and lethal radiation belts.',
  saturn: 'A gas giant with a magnificent icy ring system, and a density lower than water. The rings average just ~20 m thick yet span tens of thousands of km.',
  uranus: 'An ice giant tipped on its side (98° axial tilt). Methane absorbs red light, giving its cyan hue; its atmosphere is the coldest in the Solar System (−224 °C).',
  neptune: 'The most distant planet, discovered through mathematics. It has the fastest winds in the Solar System (2100 km/h); its deep blue comes from methane and an unknown absorber.',
  pluto: 'A Kuiper Belt dwarf planet, mutually tidally locked with Charon. New Horizons flew by in 2015 and revealed the nitrogen-ice heart, Sputnik Planitia.',
  // ── 卫星 ──
  moon: 'Earth\'s only natural satellite, tidally locked to always show the same face. The only world beyond Earth humans have walked on.',
  phobos: 'Mars\'s larger moon, potato-shaped (27×22×18 km) on a very low orbit (9376 km), spiraling inward by 1.8 m per century.',
  deimos: 'Mars\'s smaller, more distant moon — irregular, blanketed in fine dust.',
  io: 'The most volcanically active body in the Solar System; Jupiter\'s tidal heating coats it in sulfur volcanoes, giving it a pizza-like yellow-orange hue.',
  europa: 'Beneath its ice shell hides an ocean holding more liquid water than all of Earth\'s — a prime target in the search for extraterrestrial life.',
  ganymede: 'The largest moon in the Solar System, bigger than Mercury, and the only moon with its own magnetic field.',
  callisto: 'The most heavily cratered body in the Solar System; its ancient surface, layered with impact scars, is 4 billion years old.',
  mimas: 'Its enormous Herschel crater makes it look strikingly like the "Death Star".',
  enceladus: 'South-polar "tiger stripe" fractures jet ice plumes that feed Saturn\'s E ring; its subsurface ocean holds organic molecules. With an albedo near 1, it is the whitest body in the Solar System.',
  tethys: 'Made almost entirely of water ice, with a density of just 0.98 g/cm³.',
  dione: 'An icy moon crisscrossed by bright ice cliffs across its trailing hemisphere.',
  rhea: 'Saturn\'s second-largest moon — an ancient, heavily cratered iceball.',
  titan: 'The only moon with a thick atmosphere (1.5× Earth\'s pressure), with lakes and rivers of liquid methane beneath a global orange haze.',
  iapetus: 'The yin-yang moon: its leading hemisphere is coal-black, its trailing hemisphere snow-white, with a mysterious ridge running along its equator.',
  miranda: 'The most geologically chaotic moon, home to Verona Rupes — the tallest cliff in the Solar System (20 km).',
  ariel: 'Uranus\'s brightest moon, with young canyons and plains.',
  umbriel: 'Uranus\'s darkest large moon — ancient and enigmatic.',
  titania: 'Uranus\'s largest moon, scored by huge rift canyons.',
  oberon: 'Uranus\'s outermost large moon, with mysterious dark material on its crater floors.',
  triton: 'The only large moon in a retrograde orbit — a captured Kuiper Belt object. At −235 °C, its nitrogen geysers erupt 8 km high.',
  charon: 'The largest moon relative to its primary (half Pluto\'s radius); mutually tidally locked with Pluto, with a dark-red "Mordor" cap at its north pole.',
  // ── 彗星 ──
  halley: 'The most famous periodic comet, returning every 75–76 years. Last seen in 1986, next in 2061.',
  halebopp: 'The great comet of 1997, naked-eye visible for 18 months; orbital period ~2500 years.',
  cg67p: 'The "rubber duck" comet orbited and studied by the Rosetta spacecraft in 2014–2016.',
  encke: 'The comet with the shortest orbital period (3.3 years), parent body of the Taurid meteor shower.',
  // ── 探测器 ──
  voyager1: 'Launched 1977; crossed the heliopause into interstellar space in 2012 — the most distant human-made object.',
  voyager2: 'The only probe to have visited Uranus and Neptune; entered interstellar space in 2018.',
  // ── 日球层边界 ──
  termshock: 'The boundary where the solar wind abruptly drops from supersonic to subsonic (~90 AU). Voyager 1 crossed it in 2004.',
  heliopause: 'The boundary where solar-wind pressure balances the interstellar medium — the edge of the Sun\'s domain (~121 AU). Beyond it lies interstellar space.',
  // ── 区域 ──
  asteroidbelt: 'The main asteroid belt (2.1–3.4 AU): a flattened disk of hundreds of thousands of small bodies between Mars and Jupiter.',
  kuiperbelt: 'The Kuiper Belt (30–50 AU): a disk of icy bodies beyond Neptune, home to Pluto, Haumea, Makemake and countless smaller Kuiper Belt objects.',
  oortcloud: 'The Solar System\'s outermost spherical comet cloud, ~2,000–100,000 AU from the Sun — the home of long-period comets.',
  // ── 海外天体（TNO）──
  eris: 'The largest known dwarf planet (~2326 km across), slightly bigger than Pluto. Its discovery directly triggered Pluto\'s reclassification. A high-albedo scattered-disk object coated in nitrogen ice and methane frost; orbital period ~559 years.',
  sedna: 'One of the reddest known bodies, rich in organic tholins. Orbital period ~11,400 years with a perihelion of 76 AU, far beyond the Kuiper Belt — an inner-Oort / extended-orbit (ETNO) object. Reaches perihelion around 2076.',
  makemake: 'One of the brightest Kuiper Belt objects, named after the creator god of Rapa Nui (Easter Island). Deep-red surface of methane and ethane ice, albedo ~77%, with one faint moon (MK2).',
  haumea: 'The fastest-spinning large body in the Solar System (rotation just 3.9 hours), flung into a football shape (1000×750×500 km). Crystalline water ice, a thin ring, and two moons (Hiʻiaka and Namaka). Named for the Hawaiian goddess of fertility.',
  quaoar: 'A classical cold Kuiper Belt object with methane, ethane and crystalline water ice. In 2023 it was found to host a dense ring beyond the Roche limit, challenging ring-formation theory. Named for the Tongva creator god.',
  gonggong: 'One of the reddest known bodies, rich in organics. A scattered-disk object (perihelion 33 AU, aphelion 101 AU) on a steeply inclined orbit (30°). Named after the Chinese water god who unleashed floods; it has a moon, Xiangliu.',
  orcus: 'A plutino in 3:2 resonance with Neptune, on a Pluto-like but anti-phased orbit. Ice-rich and high-albedo, with a large moon Vanth (~280 km) in mutual tidal lock.',
  varuna: 'A dimmer Kuiper Belt object; its 6.3-hour spin produces marked brightness variations. Named for the Hindu god of oceans and cosmic order.',
  ixion: 'A plutino in 3:2 resonance, reddish in color. Named for the Greek king condemned by Zeus to spin forever on a fiery wheel.',
  huya: 'A plutino in 3:2 resonance. Named for the rain god of the Venezuelan Wayuu people; it has a small moon in mutual tidal lock.',
  salacia: 'A cold classical Kuiper Belt object with an unusually high albedo (~12%) and a water-ice-rich surface. Has a moon, Actaea. Named for the Roman sea goddess, wife of Neptune.',
  ms4: 'A large unnamed Kuiper Belt object (~800 km across), nearly spherical. Not yet formally named; a possible dwarf-planet candidate.',
  chaos: 'A cold classical Kuiper Belt object, named for the primordial void at the origin of the world in Greek myth.',
  varda: 'A Kuiper Belt object with a relatively large moon, Ilmarë. Named for the Vala queen of the stars in Tolkien\'s legendarium.',
  typhon: 'A scattered-disk object with a perihelion of ~17 AU (inside Neptune\'s orbit) on a highly elliptical path. Named for the most fearsome monster of Greek myth; has a moon, Echidna.',
  tx300: 'A Kuiper Belt object with an extremely high albedo (88%) and a water-ice-rich surface, much like Enceladus. Occultations confirm a near-spherical shape.',
  ux25: 'A Kuiper Belt object with a moon. Its density of ~0.82 g/cm³ implies a water-ice-dominated, rock-poor interior — unusually low among known trans-Neptunian objects.',
  uk126: 'A scattered-disk object (perihelion ~37 AU, aphelion ~109 AU). Reddish, organic-rich surface, with one moon.',
  fy27: 'A scattered-disk object (perihelion ~30 AU, inclination 33°). Occultations show a high albedo and an estimated diameter of ~740 km — a possible dwarf-planet candidate.',
  ceto: 'A scattered-disk object (perihelion ~17 AU, aphelion ~187 AU, period ~1032 years). Has a moon, Phorcys. Named for the Greek sea goddess Ceto.',
  az84: 'A plutino in 3:2 resonance, close to a slightly oblate spheroid (axial ratio ~1:0.7:0.6). Precisely measured by occultations — one of the better-characterized Kuiper Belt objects.',
  gv9: 'A cold classical Kuiper Belt object on a near-circular orbit; thermal measurements estimate a diameter of ~530 km. Its 22° inclination places it in the hotter classical group.',
  rhadamanthus: 'A plutino in 3:2 resonance. Named for Rhadamanthus, the just judge of the underworld in Greek myth, a son of Zeus renowned for fairness.',
  qu182: 'A Kuiper Belt object of the intermediate-period group (~364 years). Thermal measurements estimate a diameter of ~416 km — a possible dwarf-planet candidate.',
  goblin: 'An extreme trans-Neptunian object (ETNO) with perihelion ~65 AU and aphelion beyond 2100 AU (period ~35,600 years). Discovered in 2015; its clustered orbit is among the hints for a possible Planet Nine.',
  vp113: 'An extended scattered-disk object with perihelion ~80 AU — at discovery the most distant perihelion of any known Solar System body (later surpassed by Sedna). Its clustered orbit is key evidence for the "Planet Nine" hypothesis. Nicknamed "Biden" (V and P resemble VP).',
  farout: 'At its 2018 discovery, the most distant known Solar System body (~124 AU), nicknamed "Farout". Estimated ~620 km across, with a pink surface suggesting ice; period ~5645 years.',
  farfarout: 'Confirmed in 2021 as a new record — the most distant known Solar System body at discovery (~132 AU). Nicknamed "FarFarOut". Perihelion ~50 AU, aphelion ~575 AU, period ~5515 years.',
};

/** 科教知识卡片英文版，按 id（与 eduFacts.js 的 FACTS 键一致）。
 *  每条事实为 { text, source } 对象，source 与中文版一一对应（NASA/IAU 来源 URL）。
 *  非中文界面（es/ja/fr/de/ru）暂用英文占位，缺失键回退中文（见 eduFacts.js 的 factsFor）。 */
export const FACTS_EN = {
  sun: [
    { text: 'The Sun fuses ~600 million tonnes of hydrogen into helium every second; the 4 million tonnes of lost mass become light and heat via E=mc².', source: 'https://science.nasa.gov/sun/' },
    { text: 'Light takes tens of thousands of years to crawl from the Sun\'s core to its surface (absorbed and re-emitted endlessly), but only 8 min 20 s to reach Earth.', source: 'https://science.nasa.gov/sun/' },
    { text: 'Solar activity follows an ~11-year cycle; at its peak, sunspots, flares and coronal mass ejections surge and can disrupt Earth\'s power grids and satellites.', source: 'https://science.nasa.gov/sun/solar-cycles/' },
    { text: 'The Sun has burned for ~4.6 billion years and will keep burning stably for another ~5 billion, after which it will swell into a red giant and engulf the inner planets.', source: 'https://science.nasa.gov/sun/' },
  ],
  mercury: [
    { text: 'From Mercury the Sun looks only 2.4–3.2× larger than from Earth (1.1°–1.7° across, varying over its very elliptical orbit) — but 6–10× brighter, dazzlingly so. The Sun in space is far "smaller" than you\'d imagine.', source: 'https://science.nasa.gov/mercury/' },
    { text: 'A "day" on Mercury (sunrise to sunrise) lasts 176 Earth days — twice its year (88 days)! This stems from its 3:2 spin–orbit resonance.', source: 'https://science.nasa.gov/mercury/' },
    { text: 'Permanently shadowed polar craters on Mercury hold water ice — even though it is the planet closest to the Sun.', source: 'https://science.nasa.gov/mercury/' },
    { text: 'The precession of Mercury\'s perihelion baffled astronomers for decades, until Einstein\'s general relativity explained it perfectly.', source: 'https://science.nasa.gov/mercury/' },
  ],
  venus: [
    { text: 'Venus\'s surface pressure equals being 900 m underwater on Earth, and 465 °C is hot enough to melt lead — the textbook case of a runaway greenhouse.', source: 'https://science.nasa.gov/venus/' },
    { text: 'Venus spins backwards relative to other planets (the Sun rises in the west), and one rotation (243 days) takes longer than its year (225 days).', source: 'https://science.nasa.gov/venus/' },
    { text: 'About 50 km up, at the top of Venus\'s sulfuric-acid clouds, temperature and pressure resemble Earth\'s surface — once proposed as a "cloud colony" site.', source: 'https://science.nasa.gov/venus/' },
    { text: 'Venus has no magnetic field, but it does have an induced magnetosphere generated by the solar wind, which still partially deflects it.', source: 'https://science.nasa.gov/venus/' },
  ],
  earth: [
    { text: 'Earth is the only known planet with long-lived surface liquid water — the zone where it can exist is the "habitable zone" (Goldilocks Zone).', source: 'https://science.nasa.gov/earth/' },
    { text: 'Earth\'s magnetic field, generated by the convective dynamo of liquid iron in its outer core, deflects the solar wind and shields the atmosphere from being stripped away.', source: 'https://science.nasa.gov/earth/' },
    { text: 'Seen from the Moon, Earth\'s "phases" are exactly complementary to the Moon\'s: at new moon it is a "full Earth".', source: 'https://science.nasa.gov/earth/' },
    { text: 'Earth\'s rotation is slowing by ~1.8 milliseconds per century from lunar tidal friction — and the Moon drifts 3.8 cm farther away each year as a result.', source: 'https://science.nasa.gov/earth/' },
  ],
  moon: [
    { text: 'The Moon recedes from Earth by 3.8 cm per year — laser retroreflectors left by the Apollo missions still measure this precisely today.', source: 'https://science.nasa.gov/moon/' },
    { text: 'Tidal locking keeps the Moon\'s same face toward Earth, but thanks to libration we actually see 59% of its surface.', source: 'https://science.nasa.gov/moon/' },
    { text: 'The Moon likely formed 4.5 billion years ago in a giant impact between the primordial Earth and a Mars-sized body, "Theia".', source: 'https://science.nasa.gov/moon/' },
    { text: 'Try jumping right now — the Moon\'s gravity is only 1/6 of Earth\'s; Apollo astronauts said walking felt like a "slow-motion trampoline".', source: 'https://science.nasa.gov/moon/' },
  ],
  mars: [
    { text: 'Olympus Mons rises 21.9 km — 2.5× Everest — because Mars has no plate tectonics, so a volcano can keep growing over a hotspot.', source: 'https://science.nasa.gov/mars/' },
    { text: 'Mars once had oceans and rivers: Curiosity and Perseverance hunt for traces of ancient life in old riverbeds and lakebed sediments.', source: 'https://science.nasa.gov/mars/' },
    { text: 'Mars\'s atmosphere is 95% carbon dioxide at under 1% of Earth\'s pressure; surface liquid water would instantly boil or freeze.', source: 'https://science.nasa.gov/mars/' },
    { text: 'Sunsets on Mars are blue — iron-oxide dust forward-scatters blue light about 3.5× more strongly than red, casting a cyan halo around the Sun. Curiosity and Perseverance have both photographed it.', source: 'https://science.nasa.gov/mars/' },
  ],
  phobos: [
    { text: 'Phobos orbits below the synchronous altitude, and tidal forces are slowly dragging it toward Mars; in ~50 million years it will break into a ring or crash down.', source: 'https://science.nasa.gov/mars/moons/' },
    { text: 'The most striking feature on Phobos is Stickney crater, 9 km across — nearly a third of the moon\'s own diameter.', source: 'https://science.nasa.gov/mars/moons/' },
    { text: 'Phobos is covered in parallel grooves, likely cracks from tidal stress or the Stickney impact.', source: 'https://science.nasa.gov/mars/moons/' },
  ],
  deimos: [
    { text: 'Deimos may be a captured asteroid, its surface buried under a thick layer of dust.', source: 'https://science.nasa.gov/mars/moons/' },
    { text: 'Deimos has an unusually smooth surface — a dust layer tens of metres thick masks its craters.', source: 'https://science.nasa.gov/mars/moons/' },
    { text: 'Deimos orbits in about 30 hours and, like Phobos, is tidally locked, always showing the same face to Mars.', source: 'https://science.nasa.gov/mars/moons/' },
  ],
  jupiter: [
    { text: 'Jupiter\'s mass is 2.5× that of the other seven planets combined; its gravity acts like a "cosmic vacuum cleaner", shielding the inner Solar System from comet impacts.', source: 'https://science.nasa.gov/jupiter/' },
    { text: 'The Great Red Spot is an anticyclonic storm raging for at least 350 years — large enough to swallow 1–2 Earths, though it is slowly shrinking.', source: 'https://science.nasa.gov/jupiter/' },
    { text: 'Jupiter\'s radiation belts are deadly: a single day\'s dose at Europa\'s surface would kill a human.', source: 'https://science.nasa.gov/jupiter/' },
    { text: 'Jupiter is a failed star — at 80× its current mass its core could ignite hydrogen fusion and become a red dwarf.', source: 'https://science.nasa.gov/jupiter/' },
  ],
  io: [
    { text: 'Io has over 400 active volcanoes — the most volcanically active body in the Solar System, powered by Jupiter\'s relentless tidal kneading.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/io/' },
    { text: 'Io\'s eruptions fling sulfur and sulfur dioxide into space, forming a plasma torus around Jupiter.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/io/' },
    { text: 'Sulfur compounds give Io its yellow-orange-red "pizza" look, with almost no impact craters — eruptions constantly resurface it.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/io/' },
  ],
  europa: [
    { text: 'The ocean beneath Europa\'s ice shell holds about twice the water of all Earth\'s oceans combined. NASA\'s "Europa Clipper" is on its way to probe its habitability.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/europa/' },
    { text: 'Europa\'s surface is laced with intersecting ice ridges and fractures — scars of the ice shell cracking and refreezing under tidal stress.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/europa/' },
    { text: 'The Hubble telescope has detected possible water plumes erupting from Europa; if confirmed, they would offer a shortcut to sample its subsurface ocean.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/europa/' },
  ],
  ganymede: [
    { text: 'Ganymede is bigger than Mercury and the only moon with its own magnetic field, hiding a salty ocean beneath its ice shell.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/' },
    { text: 'Ganymede\'s surface splits into dark ancient terrain and bright younger grooved terrain, recording distinct geological histories.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/' },
    { text: 'The Galileo probe first detected an independent magnetic field around Ganymede — direct evidence that a moon can have its own magnetism.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/' },
  ],
  callisto: [
    { text: 'Callisto is the most heavily cratered body in the Solar System, geologically nearly dead for 4 billion years — a "living fossil" of the Solar System.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/callisto/' },
    { text: 'Callisto lies far from Jupiter\'s fierce radiation belts, making it the safest base candidate for future crewed exploration of the Jovian system.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/callisto/' },
    { text: 'Beneath Callisto\'s ice shell may lie a salty ocean up to 100 km deep, separated from the rocky core by layers of high-pressure ice.', source: 'https://science.nasa.gov/jupiter/jupiter-moons/callisto/' },
  ],
  saturn: [
    { text: 'Over 99% of Saturn\'s rings are water-ice particles (micrometres to metres); the pale gold-brown tint comes from trace silicates and organics mixed in.', source: 'https://science.nasa.gov/saturn/' },
    { text: 'Saturn\'s rings span 280,000 km yet average only ~10–20 m thick — proportionally a hundred times thinner than a sheet of paper.', source: 'https://science.nasa.gov/saturn/' },
    { text: 'Saturn is less dense than water (0.687 g/cm³) — in theory it would float in a large enough pool.', source: 'https://science.nasa.gov/saturn/' },
    { text: 'Saturn\'s rings are "young" — perhaps only 10–100 million years old — and are raining down onto Saturn as "ring rain", possibly vanishing within 300 million years.', source: 'https://science.nasa.gov/saturn/' },
  ],
  mimas: [
    { text: 'Mimas\'s Herschel crater is 139 km across — a third of its diameter; a slightly larger impact would have shattered it.', source: 'https://science.nasa.gov/saturn/saturn-moons/mimas/' },
    { text: 'Mimas looks strikingly like the "Death Star" of Star Wars — the giant Herschel crater makes it one of the most recognizable moons in the Solar System.', source: 'https://science.nasa.gov/saturn/saturn-moons/mimas/' },
    { text: 'Mimas\'s orbit is in 2:1 resonance with Saturn\'s Cassini Division, which its gravity "sweeps" clean.', source: 'https://science.nasa.gov/saturn/saturn-moons/mimas/' },
  ],
  enceladus: [
    { text: 'Cassini flew through Enceladus\'s icy plumes and sampled hydrogen molecules and organics — its subsurface ocean has the chemical energy life needs.', source: 'https://science.nasa.gov/saturn/saturn-moons/enceladus/' },
    { text: 'Enceladus has an albedo near 1.0, the whitest body in the Solar System — fresh ice plumes constantly coat its surface.', source: 'https://science.nasa.gov/saturn/saturn-moons/enceladus/' },
    { text: 'The "tiger stripes" at Enceladus\'s south pole continuously jet ice particles and water vapor, which feed Saturn\'s E ring.', source: 'https://science.nasa.gov/saturn/saturn-moons/enceladus/' },
  ],
  tethys: [
    { text: 'Tethys is made almost entirely of water ice, with a density of just 0.98 g/cm³ — lighter than pure water.', source: 'https://science.nasa.gov/saturn/saturn-moons/tethys/' },
    { text: 'Tethys has a giant canyon called Ithaca Chasma, about 2000 km long, stretching nearly across the whole moon.', source: 'https://science.nasa.gov/saturn/saturn-moons/tethys/' },
    { text: 'Tethys has two Trojan moons (Telesto and Calypso) sitting at its L4 and L5 Lagrange points, 60° ahead and behind on its orbit.', source: 'https://science.nasa.gov/saturn/saturn-moons/tethys/' },
  ],
  dione: [
    { text: 'Dione\'s trailing hemisphere is crisscrossed by bright ice cliffs — cliffs hundreds of metres high left by fractures in its ice shell.', source: 'https://science.nasa.gov/saturn/saturn-moons/dione/' },
    { text: 'Dione\'s surface has long, bright ice chasmata recording a history of geological activity driven by tidal stress.', source: 'https://science.nasa.gov/saturn/saturn-moons/dione/' },
    { text: 'Like Enceladus, Dione may harbor a subsurface ocean, though the evidence is less conclusive.', source: 'https://science.nasa.gov/saturn/saturn-moons/dione/' },
  ],
  rhea: [
    { text: 'Rhea is Saturn\'s second-largest moon — an ancient, heavily cratered iceball with a surface density of only ~1.24 g/cm³.', source: 'https://science.nasa.gov/saturn/saturn-moons/rhea/' },
    { text: 'Rhea\'s surface has two giant fracture belts (Inktomi chasmata and near the Odysseus crater), hinting at early geological activity.', source: 'https://science.nasa.gov/saturn/saturn-moons/rhea/' },
    { text: 'In 2008 a tenuous oxygen atmosphere was detected around Rhea — the first time oxygen was found around a moon.', source: 'https://science.nasa.gov/saturn/saturn-moons/rhea/' },
  ],
  titan: [
    { text: 'Titan is the only moon with a thick atmosphere (1.5× Earth\'s pressure), with methane rain, methane rivers and methane lakes on its surface.', source: 'https://science.nasa.gov/saturn/saturn-moons/titan/' },
    { text: 'NASA\'s nuclear-powered "Dragonfly" rotorcraft will land on Titan in the 2030s to fly and survey its low-gravity, thick-atmosphere world.', source: 'https://science.nasa.gov/mission/dragonfly/' },
    { text: 'The Huygens probe landed on Titan in 2005 — humanity\'s first soft landing on a body in the outer Solar System.', source: 'https://science.nasa.gov/mission/cassini/' },
  ],
  iapetus: [
    { text: 'Iapetus is half coal-black, half snow-white, with a mysterious 13-km-high ridge along its equator — possibly the remains of an ancient fallen ring system.', source: 'https://science.nasa.gov/saturn/saturn-moons/iapetus/' },
    { text: 'The dark material on Iapetus\'s leading hemisphere may be dust ejected from other moons and slowly accreted by its gravity.', source: 'https://science.nasa.gov/saturn/saturn-moons/iapetus/' },
    { text: 'Iapetus\'s equatorial ridge stretches 1300 km — one of the most unique landforms in the Solar System, with no agreed-upon origin.', source: 'https://science.nasa.gov/saturn/saturn-moons/iapetus/' },
  ],
  miranda: [
    { text: 'Miranda is the most geologically chaotic moon, home to Verona Rupes — the tallest cliff in the Solar System (~20 km high).', source: 'https://science.nasa.gov/uranus/uranus-moons/miranda/' },
    { text: 'Miranda\'s surface has three huge "coronae" tilted at different angles — possibly the result of being shattered by an impact and reassembled.', source: 'https://science.nasa.gov/uranus/uranus-moons/miranda/' },
    { text: 'Jump off the top of Verona Rupes and, thanks to Miranda\'s tiny gravity, it would take about 10 minutes to fall to the floor.', source: 'https://science.nasa.gov/uranus/uranus-moons/miranda/' },
  ],
  ariel: [
    { text: 'Ariel is Uranus\'s brightest moon, with young canyons and smooth ice plains.', source: 'https://science.nasa.gov/uranus/uranus-moons/ariel/' },
    { text: 'Ariel\'s surface is crossed by smooth valleys hundreds of kilometres long, filled by cryovolcanic ice lava.', source: 'https://science.nasa.gov/uranus/uranus-moons/ariel/' },
    { text: 'Ariel\'s albedo is about 0.35, the highest among Uranus\'s five major moons, with a surface dominated by water ice.', source: 'https://science.nasa.gov/uranus/uranus-moons/ariel/' },
  ],
  umbriel: [
    { text: 'Umbriel is Uranus\'s darkest large moon, with an albedo of just 0.16 — ancient and enigmatic.', source: 'https://science.nasa.gov/uranus/uranus-moons/umbriel/' },
    { text: 'Umbriel has a mysterious bright ring-shaped feature called the "fluorescent halo", whose origin is still unknown.', source: 'https://science.nasa.gov/uranus/uranus-moons/umbriel/' },
    { text: 'Umbriel shows almost no signs of geological activity; its 4-billion-year-old surface is packed with craters — a "frozen" moon.', source: 'https://science.nasa.gov/uranus/uranus-moons/umbriel/' },
  ],
  titania: [
    { text: 'Titania is Uranus\'s largest moon, scored by huge rift canyon systems up to 1500 km long.', source: 'https://science.nasa.gov/uranus/uranus-moons/titania/' },
    { text: 'Titania\'s canyons formed when its ice shell cracked as internal water froze and expanded — totally unlike Earth\'s plate tectonics.', source: 'https://science.nasa.gov/uranus/uranus-moons/titania/' },
    { text: 'Titania has few craters, most reshaped by later geology, showing it once had an active internal evolution.', source: 'https://science.nasa.gov/uranus/uranus-moons/titania/' },
  ],
  oberon: [
    { text: 'Oberon is Uranus\'s outermost large moon, with mysterious dark material on crater floors — possibly ice-rock mixtures seeping up from within.', source: 'https://science.nasa.gov/uranus/uranus-moons/oberon/' },
    { text: 'Oberon\'s surface has several giant fault scarps, hinting at early geological activity.', source: 'https://science.nasa.gov/uranus/uranus-moons/oberon/' },
    { text: 'Because Oberon sits at the edge of Uranus\'s magnetosphere, its surface is bombarded by solar-wind particles that darken its ice.', source: 'https://science.nasa.gov/uranus/uranus-moons/oberon/' },
  ],
  uranus: [
    { text: 'Uranus rotates on its side (98° axial tilt), probably from an ancient planet-scale collision; each of its seasons lasts 21 years.', source: 'https://science.nasa.gov/uranus/' },
    { text: 'Uranus has the coldest planetary atmosphere in the Solar System (−224 °C), even though Neptune is farther from the Sun.', source: 'https://science.nasa.gov/uranus/' },
    { text: 'Uranus\'s rotation axis is nearly perpendicular to its orbital motion, tilting its magnetic field ~60° and placing the magnetic poles far from the geographic ones.', source: 'https://science.nasa.gov/uranus/' },
    { text: 'Uranus has 13 faint rings, first clearly imaged during the Voyager 2 flyby in 1986.', source: 'https://science.nasa.gov/uranus/' },
  ],
  neptune: [
    { text: 'Neptune was the first planet "calculated" into existence — in 1846 Le Verrier predicted its position with pen and paper from anomalies in Uranus\'s orbit.', source: 'https://science.nasa.gov/neptune/' },
    { text: 'Winds on Neptune reach 2100 km/h, the fastest in the Solar System — their energy source remains a mystery.', source: 'https://science.nasa.gov/neptune/' },
    { text: 'Neptune\'s Great Dark Spot is an anticyclonic storm about the size of Earth, similar to Jupiter\'s Great Red Spot but shorter-lived.', source: 'https://science.nasa.gov/neptune/' },
    { text: 'Neptune was flown past by Voyager 2 in 1989 and remains visited by only that one spacecraft.', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
  ],
  triton: [
    { text: 'Triton orbits backwards — a captured Kuiper Belt object; its nitrogen-ice geysers spray 8 km high.', source: 'https://science.nasa.gov/neptune/neptune-moons/triton/' },
    { text: 'Triton\'s surface is about −235 °C, one of the coldest in the Solar System, covered in frozen nitrogen, methane and carbon monoxide.', source: 'https://science.nasa.gov/neptune/neptune-moons/triton/' },
    { text: 'Triton\'s retrograde orbit is slowly pulling it toward Neptune; in ~3.6 billion years it will cross the Roche limit and be torn apart, possibly forming a Neptune ring.', source: 'https://science.nasa.gov/neptune/neptune-moons/triton/' },
  ],
  pluto: [
    { text: 'Pluto\'s heart-shaped Sputnik Planitia is a flowing glacier of nitrogen ice that resurfaces every few hundred thousand years.', source: 'https://science.nasa.gov/dwarf-planets/pluto/' },
    { text: 'Pluto and Charon are mutually tidally locked — forever facing each other, like an eternal pair dancing.', source: 'https://science.nasa.gov/dwarf-planets/pluto/' },
    { text: 'In 2006 the IAU redefined "planet", and Pluto was reclassified as a dwarf planet for not having "cleared its orbital neighborhood".', source: 'https://iau.org/news/pressreleases/detail/iau0603/' },
    { text: 'New Horizons flew by Pluto in 2015, revealing a complex surface of ice mountains, glaciers and red organic regions for the first time.', source: 'https://science.nasa.gov/mission/new-horizons/' },
  ],
  charon: [
    { text: 'Charon\'s radius is half of Pluto\'s, and their center of mass lies outside Pluto — making them more of a "double dwarf planet" system.', source: 'https://science.nasa.gov/dwarf-planets/pluto/charon/' },
    { text: 'Charon\'s north pole has a dark-red patch called "Mordor Macula", likely methane escaping from Pluto\'s atmosphere that condenses at the pole and is darkened by radiation.', source: 'https://science.nasa.gov/dwarf-planets/pluto/charon/' },
    { text: 'Charon\'s surface has giant canyons and fractures, suggesting its ice shell cracked as an internal ocean froze and expanded.', source: 'https://science.nasa.gov/dwarf-planets/pluto/charon/' },
  ],
  halley: [
    { text: 'Halley was the first comet predicted to return (by Halley in 1705). Its tail debris feeds the annual Orionid meteor shower.', source: 'https://science.nasa.gov/solar-system/comets/1p-halley/' },
    { text: 'During its 1986 return, ESA\'s Giotto probe flew through the coma and imaged the nucleus — a 15-km-long "dirty snowball".', source: 'https://sci.esa.int/web/giotto' },
    { text: 'Halley returns every 75–76 years; its next pass through the inner Solar System will be in July 2061.', source: 'https://science.nasa.gov/solar-system/comets/1p-halley/' },
  ],
  halebopp: [
    { text: 'Comet Hale–Bopp was naked-eye visible for a record 18 consecutive months in 1997; its next return is ~2500 years away.', source: 'https://science.nasa.gov/resource/comet-hale-bopp/' },
    { text: 'Hale–Bopp\'s nucleus is estimated at 40–60 km across — more than twice Halley\'s — a true "giant comet".', source: 'https://science.nasa.gov/resource/comet-hale-bopp/' },
    { text: 'Hale–Bopp simultaneously displayed a blue ion tail and a yellow dust tail, making it the most spectacular comet of the 20th century.', source: 'https://science.nasa.gov/resource/comet-hale-bopp/' },
  ],
  cg67p: [
    { text: 'Rosetta orbited 67P in 2014 and dropped the Philae lander — humanity\'s first soft landing on a comet nucleus, finding glycine and other life-building molecules.', source: 'https://science.nasa.gov/mission/rosetta/' },
    { text: '67P\'s nucleus looks like a "rubber duck", formed by the low-speed merger of two separate bodies.', source: 'https://science.nasa.gov/mission/rosetta/' },
    { text: 'Rosetta found water ice, carbon monoxide and complex organic molecules on 67P, providing key samples for studying the Solar System\'s origin.', source: 'https://science.nasa.gov/mission/rosetta/' },
  ],
  encke: [
    { text: 'Comet Encke loops the Sun every 3.3 years, the shortest period of any comet; the Taurid meteor shower comes from the dust it sheds.', source: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
    { text: 'Observed more than 60 times since its discovery in 1819, Encke is one of the best samples for studying comet evolution.', source: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
    { text: 'Encke is gradually losing mass and may fully disintegrate or become an inert asteroid within the next few thousand years.', source: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
  ],
  voyager1: [
    { text: 'Voyager 1 carries the "Golden Record" with sounds of Earth and greetings in 55 languages — it will drift through interstellar space for billions of years.', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
    { text: 'In 1990 Voyager 1 looked back from 6 billion km to capture the "Pale Blue Dot" — Carl Sagan: that is our only home.', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
    { text: 'Voyager 1 crossed the heliopause in 2012, becoming the first human-made object to enter interstellar space.', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
  ],
  voyager2: [
    { text: 'Voyager 2 used a once-in-176-years planetary alignment for its "Grand Tour" — the only probe to have visited all four outer planets.', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
    { text: 'Voyager 2 crossed the heliopause in 2018, becoming the second human-made object to enter interstellar space.', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
    { text: 'Voyager 2 is the only probe to have flown past Uranus (1986) and Neptune (1989), and remains the main source of data on both planets.', source: 'https://science.nasa.gov/mission/voyager/voyager-2/' },
  ],
  termshock: [
    { text: 'Here the solar wind abruptly drops from supersonic (~400 km/s) to subsonic — like the circular standing wave where a faucet\'s stream hits the sink.', source: 'https://science.nasa.gov/heliophysics/' },
    { text: 'Voyager 1 crossed the termination shock in December 2004, with Voyager 2 following in 2007.', source: 'https://science.nasa.gov/mission/voyager/voyager-1/' },
    { text: 'The termination shock sits about 80–90 AU from the Sun and expands and contracts with the 11-year solar cycle.', source: 'https://science.nasa.gov/heliophysics/' },
  ],
  heliopause: [
    { text: 'The heliopause is where solar-wind pressure balances the interstellar medium. Crossing it, the Voyagers detected plasma density jump 40-fold — the moment they truly left the Sun\'s embrace.', source: 'https://science.nasa.gov/heliophysics/' },
    { text: 'The heliopause lies about 121 AU from the Sun — the limit of the Sun\'s "domain"; beyond it lies true interstellar space.', source: 'https://science.nasa.gov/heliophysics/' },
    { text: 'The heliosphere is not a perfect sphere — it is shaped like a "comet", with a long tail drawn out by the interstellar wind.', source: 'https://science.nasa.gov/heliophysics/' },
  ],
  // ── Trans-Neptunian Objects (TNOs) ──────────────────────────────────
  eris: [
    { text: 'Eris is ~2326 km across, slightly bigger than Pluto. Its discovery directly triggered the IAU to redefine "planet", demoting Pluto.', source: 'https://science.nasa.gov/dwarf-planets/eris/' },
    { text: 'Eris has a moon named Dysnomia, whose orbit allowed Eris\'s mass to be precisely measured.', source: 'https://science.nasa.gov/dwarf-planets/eris/' },
    { text: 'Eris is coated in nitrogen ice and methane frost with a very high albedo (~0.96); it is currently near aphelion and its atmosphere has frozen out.', source: 'https://science.nasa.gov/dwarf-planets/eris/' },
  ],
  sedna: [
    { text: 'Sedna is one of the reddest known bodies, rich in organic tholins, with an orbital period of ~11,400 years.', source: 'https://science.nasa.gov/resource/sedna/' },
    { text: 'Sedna\'s perihelion of 76 AU lies far beyond the Kuiper Belt; it is an inner-Oort / extended-orbit (ETNO) object, reaching perihelion around 2076.', source: 'https://science.nasa.gov/resource/sedna/' },
    { text: 'Sedna\'s extreme orbit (aphelion ~937 AU) makes it a key sample for studying the outer Solar System and the Oort Cloud.', source: 'https://science.nasa.gov/resource/sedna/' },
  ],
  makemake: [
    { text: 'Makemake is one of the brightest Kuiper Belt objects, named after the creator god of Rapa Nui (Easter Island).', source: 'https://science.nasa.gov/dwarf-planets/makemake/' },
    { text: 'Makemake has a deep-red surface of methane and ethane ice, albedo ~77%, with one faint moon (MK2).', source: 'https://science.nasa.gov/dwarf-planets/makemake/' },
    { text: 'A stellar occultation in April 2015 revealed Makemake may have a localized thin atmosphere — but it soon freezes out near aphelion.', source: 'https://science.nasa.gov/dwarf-planets/makemake/' },
  ],
  haumea: [
    { text: 'Haumea is the fastest-spinning large body in the Solar System (rotation just 3.9 hours), flung into a football shape.', source: 'https://science.nasa.gov/dwarf-planets/haumea/' },
    { text: 'Haumea\'s surface is rich in crystalline water ice, with a thin ring and two moons (Hiʻiaka and Namaka). Named for the Hawaiian goddess of fertility.', source: 'https://science.nasa.gov/dwarf-planets/haumea/' },
    { text: 'Haumea\'s rapid spin gives it a pronounced triaxial ellipsoid shape (~1000×750×500 km) — the most "squashed" large body in the Solar System.', source: 'https://science.nasa.gov/dwarf-planets/haumea/' },
  ],
  quaoar: [
    { text: 'Quaoar is a classical cold Kuiper Belt object. In 2023 it was found to host a dense ring beyond the Roche limit, challenging ring-formation theory.', source: 'https://www.nature.com/articles/s41586-022-05629-6' },
    { text: 'Quaoar\'s surface has methane, ethane and crystalline water ice. Named for the Tongva creator god.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Quaoar has a moon, Weywot, whose orbit allowed Quaoar\'s mass and density to be estimated.', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  gonggong: [
    { text: 'Gonggong is one of the reddest known bodies, rich in organics. Named after the Chinese water god who unleashed floods.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Gonggong is a scattered-disk object (perihelion 33 AU, aphelion 101 AU, inclination 30°) with a moon, Xiangliu.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Gonggong\'s deep-red surface likely comes from tholins formed as methane is irradiated by cosmic rays.', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  orcus: [
    { text: 'Orcus is a plutino in 3:2 resonance with Neptune, on a Pluto-like but anti-phased orbit.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Orcus is ice-rich and high-albedo, with a large moon Vanth (~280 km) in mutual tidal lock.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Because Orcus\'s orbit is "mirror-symmetric" to Pluto\'s (one at aphelion when the other is at perihelion), it is called the "anti-Pluto".', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  varuna: [
    { text: 'Varuna is a dimmer Kuiper Belt object; its 6.3-hour spin produces marked brightness variations.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Varuna\'s rapid spin likely gives it an elongated ellipsoid shape. Named for the Hindu god of oceans and cosmic order.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Varuna\'s surface is reddish, rich in amorphous carbon and organics, making it a representative for studying KBO surface evolution.', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  ixion: [
    { text: 'Ixion is a plutino in 3:2 resonance with Neptune, with a reddish surface.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Ixion is named for the Greek king condemned by Zeus to spin forever on a fiery wheel — echoing its resonant orbit.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Ixion is about 650 km across, one of the larger plutinos, but has not yet been officially recognized as a dwarf planet.', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  huya: [
    { text: 'Huya is a plutino in 3:2 resonance, named for the rain god of the Venezuelan Wayuu people.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Huya has a small moon in mutual tidal lock, allowing its density to be precisely measured.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Huya\'s surface is dark and reddish, rich in organics — a typical plutino surface.', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  salacia: [
    { text: 'Salacia is a cold classical Kuiper Belt object with an unusually high albedo (~12%) and a water-ice-rich surface.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Salacia has a moon, Actaea. Named for the Roman sea goddess, wife of Neptune.', source: 'https://science.nasa.gov/dwarf-planets/' },
    { text: 'Salacia\'s density of ~1.16 g/cm³ implies a water-ice-dominated interior, making it a sample for studying KBO internal structure.', source: 'https://science.nasa.gov/dwarf-planets/' },
  ],
  ms4: [
    { text: '2002 MS4 is a large unnamed Kuiper Belt object (~800 km across), nearly spherical — a possible dwarf-planet candidate.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 MS4 has not yet been formally named; its surface is neutral to slightly dark, making it a typical large classical KBO.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 MS4\'s rotation period and density remain uncertain; future occultations may reveal more physical parameters.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  chaos: [
    { text: 'Chaos is a cold classical Kuiper Belt object, named for the primordial void at the origin of the world in Greek myth.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Chaos is about 600 km across on a near-circular orbit, a representative of the unexcited cold classical belt.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Chaos\'s dark surface preserves primitive material from the Solar System\'s formation.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  varda: [
    { text: 'Varda is a Kuiper Belt object with a relatively large moon, Ilmarë.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Varda is named for the Vala queen of the stars in Tolkien\'s legendarium — the lady of light in the Lord of the Rings universe.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Varda has a fairly high albedo (~0.4) with a water-ice-rich surface, a representative of high-albedo KBOs.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  typhon: [
    { text: 'Typhon is a scattered-disk object with a perihelion of ~17 AU (inside Neptune\'s orbit) on a highly elliptical path.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Typhon has a moon, Echidna. Named for the most fearsome monster of Greek myth.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Because Typhon\'s orbit dips inside Neptune, it is a special sample for studying the link between scattered-disk objects and Jupiter-family comets.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  tx300: [
    { text: '2002 TX300 is a Kuiper Belt object with an extremely high albedo (88%) and a water-ice-rich surface, much like Enceladus.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Occultations confirm 2002 TX300 is nearly spherical, ~286 km across, one of the brightest KBOs.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 TX300 is a member of the Haumea family, likely a fragment of an ancient collision with Haumea.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  ux25: [
    { text: '2002 UX25 is a Kuiper Belt object whose density of ~0.82 g/cm³ implies a water-ice-dominated, rock-poor interior — unusually low among known trans-Neptunian objects.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 UX25 has a moon, whose orbit allowed its mass and density to be measured.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2002 UX25\'s low density challenges models of TBO internal structure — larger bodies usually have higher density from self-compression.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  uk126: [
    { text: '2007 UK126 is a scattered-disk object (perihelion ~37 AU, aphelion ~109 AU) with a reddish, organic-rich surface.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2007 UK126 has one moon, allowing its mass and density to be estimated.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2007 UK126 is about 600 km across, one of the larger scattered-disk objects — a possible dwarf-planet candidate.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  fy27: [
    { text: '2013 FY27 is a scattered-disk object (perihelion ~30 AU, inclination 33°); occultations show a high albedo.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2013 FY27 is estimated at ~740 km across, one of the largest known scattered-disk objects — a possible dwarf-planet candidate.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2013 FY27 has a moon, whose orbit can further constrain its physical parameters.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  ceto: [
    { text: 'Ceto is a scattered-disk object (perihelion ~17 AU, aphelion ~187 AU, period ~1032 years).', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Ceto has a moon, Phorcys; the two form a binary system. Named for the Greek sea goddess Ceto.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Ceto and Phorcys are close in size, making them a rare near-equal-mass binary among trans-Neptunian objects.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  az84: [
    { text: '2003 AZ84 is a plutino in 3:2 resonance, close to a slightly oblate spheroid (axial ratio ~1:0.7:0.6).', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2003 AZ84 was precisely measured by occultations — one of the better-characterized Kuiper Belt objects.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2003 AZ84\'s surface shows water-ice absorption bands, making it an ice-rich representative among plutinos.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  gv9: [
    { text: '2004 GV9 is a cold classical Kuiper Belt object on a near-circular orbit; thermal measurements estimate a diameter of ~530 km.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2004 GV9\'s 22° inclination places it in the hotter classical group, with a neutral surface color.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2004 GV9 is one of the larger unnamed KBOs and may eventually be named and classified as a dwarf planet.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  rhadamanthus: [
    { text: 'Rhadamanthus is a plutino in 3:2 resonance, named for the just judge of the underworld in Greek myth.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Rhadamanthus is about 136 km across, a smaller plutino with a reddish surface.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Rhadamanthus shares Pluto\'s 3:2 resonance, making it a small sample for studying Neptune\'s resonant capture mechanism.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  qu182: [
    { text: '2005 QU182 is a Kuiper Belt object of the intermediate-period group (~364 years); thermal measurements estimate a diameter of ~416 km.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2005 QU182 is a possible dwarf-planet candidate with a reddish, organic-rich surface.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2005 QU182 has a fairly large inclination (~14°), placing it between the scattered disk and the classical belt.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  goblin: [
    { text: 'The Goblin (2015 TG387) is an extreme trans-Neptunian object (ETNO) with perihelion ~65 AU and aphelion beyond 2100 AU (period ~35,600 years).', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'The Goblin\'s clustered orbit is among the hints for a possible Planet Nine — its aphelion direction aligns with other ETNOs.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'The Goblin was nicknamed for being discovered around Halloween; it is about 300 km across.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  vp113: [
    { text: '2012 VP113 is an extended scattered-disk object with perihelion ~80 AU — at discovery the most distant perihelion of any known Solar System body.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2012 VP113\'s clustered orbit is key evidence for the "Planet Nine" hypothesis — several ETNOs have anomalously clustered perihelia.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: '2012 VP113 is nicknamed "Biden" (V and P resemble VP, the US Vice President); it is about 300 km across.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  farout: [
    { text: 'Farout (2018 VG18) was at its 2018 discovery the most distant known Solar System body (~124 AU), nicknamed "Farout".', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Farout is estimated at ~620 km across, with a pink surface suggesting ice; period ~5645 years.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'Farout\'s discovery further expanded the known boundary of the Solar System, offering clues for finding even more distant bodies.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  farfarout: [
    { text: 'FarFarOut (2018 AG37) was confirmed in 2021 as a new record — the most distant known Solar System body at discovery (~132 AU).', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'FarFarOut has perihelion ~50 AU, aphelion ~575 AU, period ~5515 years, and is influenced by Neptune\'s gravity.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    { text: 'FarFarOut is about 350 km across; being so distant, each orbit takes over 5000 years.', source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
  ],
  // ── Belts and regions ───────────────────────────────────────────────
  asteroidbelt: [
    { text: 'The main asteroid belt (2.1–3.4 AU) between Mars and Jupiter holds hundreds of thousands of small bodies, but its total mass is less than 4% of the Moon\'s.', source: 'https://science.nasa.gov/solar-system/asteroids/' },
    { text: 'Ceres is the only dwarf planet in the asteroid belt, ~940 km across — a third of the belt\'s total mass.', source: 'https://science.nasa.gov/dwarf-planets/ceres/' },
    { text: 'The belt is not debris from an exploded planet — Jupiter\'s gravity prevented these materials from ever coalescing into one.', source: 'https://science.nasa.gov/solar-system/asteroids/' },
  ],
  kuiperbelt: [
    { text: 'The Kuiper Belt (30–50 AU) beyond Neptune is a disk of icy bodies, home to Pluto, Haumea and many others.', source: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
    { text: 'The Kuiper Belt is the main source of short-period comets; gravitational perturbations beyond Neptune push icy bodies into the inner Solar System as comets.', source: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
    { text: 'Kuiper Belt objects preserve primitive material from the Solar System\'s formation — "time capsules" for studying planetary origins.', source: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
  ],
  oortcloud: [
    { text: 'The Oort Cloud is the Solar System\'s outermost spherical comet cloud, ~2,000–100,000 AU from the Sun — the home of long-period comets.', source: 'https://science.nasa.gov/solar-system/oort-cloud/' },
    { text: 'The Oort Cloud has not been directly observed; its existence is inferred from the orbital distribution of long-period comets.', source: 'https://science.nasa.gov/solar-system/oort-cloud/' },
    { text: 'The Oort Cloud\'s outer edge is about 1 light-year from the Sun, near the boundary of the Sun\'s gravitational reach — beyond it lies interstellar space.', source: 'https://science.nasa.gov/solar-system/oort-cloud/' },
  ],
  _generic: [
    { text: 'All the planets in the Solar System together hold just 0.14% of the Sun\'s mass.', source: 'https://science.nasa.gov/sun/' },
    { text: 'Shrink the Solar System to the size of a coin (Neptune\'s orbit) and the nearest star, Proxima Centauri, would be ~140 m away.', source: 'https://science.nasa.gov/solar-system/' },
    { text: 'All starlight you see is from the "past": Jupiter\'s light took tens of minutes, Proxima Centauri\'s took 4.2 years.', source: 'https://science.nasa.gov/solar-system/' },
    { text: 'The Solar System orbits the galactic center at 230 km/s, taking 230 million years per lap — last time it was here, the dinosaurs were just appearing.', source: 'https://science.nasa.gov/solar-system/' },
  ],
};
