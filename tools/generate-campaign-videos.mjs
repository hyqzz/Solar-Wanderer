import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ASSETS = 'campaign/assets';
const OUT = 'campaign/assets/videos';
const SEQ = path.join(ASSETS, 'video-sequences');
const MUSIC = path.join(ASSETS, 'music', 'bgm-space-ambient-stasis.mp3');
const FONTS = path.join(ASSETS, 'fonts');

fs.mkdirSync(OUT, { recursive: true });

const FONT_ZH_SRC = 'C:/Windows/Fonts/msyh.ttc';
const FONT_EN_SRC = 'C:/Windows/Fonts/arial.ttf';
if (!fs.existsSync(path.join(FONTS, 'msyh.ttc'))) fs.copyFileSync(FONT_ZH_SRC, path.join(FONTS, 'msyh.ttc'));
if (!fs.existsSync(path.join(FONTS, 'arial.ttf'))) fs.copyFileSync(FONT_EN_SRC, path.join(FONTS, 'arial.ttf'));

const FONT_ZH = path.join(FONTS, 'msyh.ttc').replace(/\\/g, '/');
const FONT_EN = path.join(FONTS, 'arial.ttf').replace(/\\/g, '/');

const FPS = 30;
const SHORT_DUR = 12;
const DEMO_DUR_PER_SCENE = 4;

function escapeText(s) {
  return s.replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

function drawtextLine(lang, text, y, size, opacity = 1, box = false) {
  const font = lang === 'zh' ? FONT_ZH : FONT_EN;
  let s = `drawtext=fontfile=${font}:text='${escapeText(text)}':fontsize=${size}:fontcolor=white@${opacity}:x=60:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3`;
  if (box) s += ':box=1:boxcolor=black@0.35:boxborderw=12';
  return s;
}

function renderFromSequence(name, seqDir, lang, title, sub, dur, musicStart) {
  const vf = [
    `fps=${FPS}`,
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920:(iw-1080)/2:(ih-1920)/2',
    drawtextLine(lang, title, 'H-320', lang === 'zh' ? 64 : 58),
    drawtextLine(lang, sub, 'H-230', lang === 'zh' ? 34 : 30, 0.9),
    drawtextLine(lang, 'sw.icodestar.net', 'H-120', 26, 0.85, true)
  ].join(',');

  const outPath = path.join(OUT, name).replace(/\\/g, '/');
  const seqPattern = path.join(seqDir, 'frame_%04d.png').replace(/\\/g, '/');
  const musicPath = MUSIC.replace(/\\/g, '/');
  const cmd = `ffmpeg -y -framerate ${FPS} -i "${seqPattern}" -ss ${musicStart} -t ${dur} -i "${musicPath}" -vf "${vf}" -af "volume=0.45" -shortest -c:v libx264 -crf 23 -pix_fmt yuv420p "${outPath}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log('Rendered', name);
}

function renderSceneClip(seqDir, lang, title, sub, startFrame, dur, tmpDir, idx, musicStart) {
  const font = lang === 'zh' ? FONT_ZH : FONT_EN;
  const titleSize = lang === 'zh' ? 64 : 60;
  const subSize = lang === 'zh' ? 34 : 32;
  const ctaSize = 26;
  const out = path.join(tmpDir, `scene_${idx}_${lang}.mp4`).replace(/\\/g, '/');
  const seqPattern = path.join(seqDir, 'frame_%04d.png').replace(/\\/g, '/');
  const musicPath = MUSIC.replace(/\\/g, '/');

  const vf = [
    `fps=${FPS}`,
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920:(iw-1080)/2:(ih-1920)/2',
    `drawtext=fontfile=${font}:text='${escapeText(title)}':fontsize=${titleSize}:fontcolor=white:x=60:y=H-420:shadowcolor=black@0.7:shadowx=3:shadowy=3`,
    `drawtext=fontfile=${font}:text='${escapeText(sub)}':fontsize=${subSize}:fontcolor=white@0.9:x=60:y=H-330:shadowcolor=black@0.6:shadowx=2:shadowy=2`,
    `drawtext=fontfile=${font}:text='sw.icodestar.net':fontsize=${ctaSize}:fontcolor=white@0.85:x=60:y=H-120:box=1:boxcolor=black@0.35:boxborderw=12`
  ].join(',');

  const cmd = `ffmpeg -y -framerate ${FPS} -start_number ${startFrame} -i "${seqPattern}" -ss ${musicStart} -t ${dur} -i "${musicPath}" -vf "${vf}" -af "volume=0.45" -shortest -c:v libx264 -crf 23 -pix_fmt yuv420p "${out}"`;
  execSync(cmd, { stdio: 'pipe' });
  return out;
}

function concatClips(files, outName) {
  const list = files.map(f => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n');
  const listPath = path.join(OUT, `_demo_${outName}_list.txt`);
  fs.writeFileSync(listPath, list);
  const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${path.join(OUT, outName)}"`;
  execSync(cmd, { stdio: 'pipe' });
  fs.unlinkSync(listPath);
}

function renderDemo(name, scenes, lang) {
  const tmpDir = fs.mkdtempSync(path.join(OUT, `tmp_demo_${lang}_`));
  const files = scenes.map((s, i) => renderSceneClip(s.seqDir, lang, s.title, s.sub, s.startFrame, s.dur, tmpDir, i, s.musicStart));
  concatClips(files, name);
  files.forEach(f => fs.unlinkSync(f));
  fs.rmdirSync(tmpDir);
  console.log('Rendered', name);
}

// --- Short videos ---
const shorts = [
  { name: 'short-earth-to-oort-zh.mp4', seq: 'earth-to-oort-vert', lang: 'zh', title: '从地球缩放到太阳系边缘', sub: '真实 1:1 比例 · 0.5 米到 10 万 AU', musicStart: 0 },
  { name: 'short-earth-to-oort-en.mp4', seq: 'earth-to-oort-vert', lang: 'en', title: 'From Earth to the edge of the solar system', sub: 'True 1:1 scale · 0.5 m to 100,000 AU', musicStart: 15 },
  { name: 'short-saturn-rings-zh.mp4', seq: 'saturn-rings-vert', lang: 'zh', title: '土星环薄到难以置信', sub: '宽 28 万公里，厚仅 10-20 米', musicStart: 30 },
  { name: 'short-saturn-rings-en.mp4', seq: 'saturn-rings-vert', lang: 'en', title: "Saturn's rings are unbelievably thin", sub: '280,000 km wide · 10-20 m thick', musicStart: 45 },
  { name: 'short-jupiter-storm-zh.mp4', seq: 'jupiter-redspot-vert', lang: 'zh', title: '木星大红斑能装下地球', sub: '一个存在至少 350 年的风暴', musicStart: 60 },
  { name: 'short-jupiter-storm-en.mp4', seq: 'jupiter-redspot-vert', lang: 'en', title: 'A storm bigger than Earth', sub: 'The Great Red Spot', musicStart: 75 },
  { name: 'short-moon-earthrise-zh.mp4', seq: 'moon-earthrise-vert', lang: 'zh', title: '站在月球看地球升起', sub: '真实 NASA JPL 星历驱动', musicStart: 90 },
  { name: 'short-moon-earthrise-en.mp4', seq: 'moon-earthrise-vert', lang: 'en', title: 'Watch Earth rise from the Moon', sub: 'Real positions · Real scale', musicStart: 105 },
  { name: 'short-mars-sunset-zh.mp4', seq: 'mars-sunset-vert', lang: 'zh', title: '火星的日落是蓝色的', sub: '尘埃散射红光，蓝光留了下来', musicStart: 120 },
  { name: 'short-mars-sunset-en.mp4', seq: 'mars-sunset-vert', lang: 'en', title: 'Mars sunsets are blue', sub: 'Dust scatters red light · Blue remains', musicStart: 0 },
];

for (const s of shorts) {
  renderFromSequence(s.name, path.join(SEQ, s.seq), s.lang, s.title, s.sub, SHORT_DUR, s.musicStart);
}

// --- Main demo ---
const demoScenesZh = [
  { seqDir: path.join(SEQ, 'earth-orbit-vert'), title: '真实 1:1 太阳系', sub: '从地球轨道开始探索', startFrame: 0, dur: DEMO_DUR_PER_SCENE, musicStart: 0 },
  { seqDir: path.join(SEQ, 'moon-earthrise-vert'), title: '站在月球看地球', sub: '真实 NASA JPL 星历驱动', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 4 },
  { seqDir: path.join(SEQ, 'mars-sunset-vert'), title: '火星蓝色日落', sub: '每个天体都按真实位置计算', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 8 },
  { seqDir: path.join(SEQ, 'saturn-rings-vert'), title: '穿越土星环', sub: '宽 28 万公里，厚仅 10-20 米', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 12 },
  { seqDir: path.join(SEQ, 'jupiter-redspot-vert'), title: '木星大红斑', sub: '能装下整个地球的风暴', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 16 },
  { seqDir: path.join(SEQ, 'sun-closeup-vert'), title: '从太阳到奥尔特云', sub: '0.5 米到 10 万 AU', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 20 },
];

const demoScenesEn = [
  { seqDir: path.join(SEQ, 'earth-orbit-vert'), title: 'A real 1:1 solar system', sub: 'Start from Earth orbit', startFrame: 0, dur: DEMO_DUR_PER_SCENE, musicStart: 0 },
  { seqDir: path.join(SEQ, 'moon-earthrise-vert'), title: 'Stand on the Moon', sub: 'Watch Earth rise', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 4 },
  { seqDir: path.join(SEQ, 'mars-sunset-vert'), title: 'Blue sunset on Mars', sub: 'Powered by NASA JPL ephemerides', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 8 },
  { seqDir: path.join(SEQ, 'saturn-rings-vert'), title: "Drift through Saturn's rings", sub: '280,000 km wide, 10-20 m thick', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 12 },
  { seqDir: path.join(SEQ, 'jupiter-redspot-vert'), title: "Jupiter's Great Red Spot", sub: 'A storm that could swallow Earth', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 16 },
  { seqDir: path.join(SEQ, 'sun-closeup-vert'), title: 'From the Sun to the Oort Cloud', sub: '0.5 m to 100,000 AU', startFrame: 60, dur: DEMO_DUR_PER_SCENE, musicStart: 20 },
];

renderDemo('main-demo-zh.mp4', demoScenesZh, 'zh');
renderDemo('main-demo-en.mp4', demoScenesEn, 'en');

console.log('All campaign videos rendered with real motion and BGM.');
