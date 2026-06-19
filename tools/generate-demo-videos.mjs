import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ASSETS = 'campaign/assets';
const OUT = 'campaign/assets/videos';
const FONTS = 'campaign/assets/fonts';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(FONTS, { recursive: true });

// Copy fonts to project dir to avoid Windows drive-colon escaping in ffmpeg.
const FONT_ZH_SRC = 'C:/Windows/Fonts/msyh.ttc';
const FONT_EN_SRC = 'C:/Windows/Fonts/arial.ttf';
if (!fs.existsSync(path.join(FONTS, 'msyh.ttc'))) fs.copyFileSync(FONT_ZH_SRC, path.join(FONTS, 'msyh.ttc'));
if (!fs.existsSync(path.join(FONTS, 'arial.ttf'))) fs.copyFileSync(FONT_EN_SRC, path.join(FONTS, 'arial.ttf'));

const FONT_ZH = path.join(FONTS, 'msyh.ttc').replace(/\\/g, '/');
const FONT_EN = path.join(FONTS, 'arial.ttf').replace(/\\/g, '/');

const scenesZh = [
  { img: 'screenshots/earth-orbit_1920x1080.png', title: '真实 1:1 太阳系', sub: '从地球轨道开始探索', dur: 8 },
  { img: 'screenshots/moon-earthrise_1920x1080.png', title: '站在月球看地球', sub: '真实 NASA JPL 星历驱动', dur: 8 },
  { img: 'screenshots/mars-sunset_1920x1080.png', title: '火星蓝色日落', sub: '每个天体都按真实位置计算', dur: 8 },
  { img: 'screenshots/saturn-rings_1920x1080.png', title: '穿越土星环', sub: '宽 28 万公里，厚仅 10-20 米', dur: 8 },
  { img: 'screenshots/jupiter-redspot_1920x1080.png', title: '木星大红斑', sub: '能装下整个地球的风暴', dur: 8 },
  { img: 'screenshots/sun-closeup_1920x1080.png', title: '从太阳到奥尔特云', sub: '0.5 米到 10 万 AU', dur: 8 },
];

const scenesEn = [
  { img: 'screenshots/earth-orbit_1920x1080.png', title: 'A real 1:1 solar system', sub: 'Start from Earth orbit', dur: 8 },
  { img: 'screenshots/moon-earthrise_1920x1080.png', title: 'Stand on the Moon', sub: 'Watch Earth rise', dur: 8 },
  { img: 'screenshots/mars-sunset_1920x1080.png', title: 'Blue sunset on Mars', sub: 'Powered by NASA JPL ephemerides', dur: 8 },
  { img: 'screenshots/saturn-rings_1920x1080.png', title: "Drift through Saturn's rings", sub: '280,000 km wide, 10-20 m thick', dur: 8 },
  { img: 'screenshots/jupiter-redspot_1920x1080.png', title: "Jupiter's Great Red Spot", sub: 'A storm that could swallow Earth', dur: 8 },
  { img: 'screenshots/sun-closeup_1920x1080.png', title: 'From the Sun to the Oort Cloud', sub: '0.5 m to 100,000 AU', dur: 8 },
];

function escapeText(s) {
  return s.replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

function renderScene(s, idx, lang, tmpDir) {
  const font = lang === 'zh' ? FONT_ZH : FONT_EN;
  const titleSize = lang === 'zh' ? 64 : 60;
  const subSize = lang === 'zh' ? 34 : 32;
  const ctaSize = 26;
  const img = path.join(ASSETS, s.img).replace(/\\/g, '/');
  const out = path.join(tmpDir, `scene_${idx}.mp4`).replace(/\\/g, '/');
  const vf = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920:(iw-1080)/2:(ih-1920)/2",
    `drawtext=fontfile=${font}:text='${escapeText(s.title)}':fontsize=${titleSize}:fontcolor=white:x=60:y=H-420:shadowcolor=black@0.7:shadowx=3:shadowy=3`,
    `drawtext=fontfile=${font}:text='${escapeText(s.sub)}':fontsize=${subSize}:fontcolor=white@0.9:x=60:y=H-330:shadowcolor=black@0.6:shadowx=2:shadowy=2`,
    `drawtext=fontfile=${font}:text='sw.icodestar.net':fontsize=${ctaSize}:fontcolor=white@0.85:x=60:y=H-120:box=1:boxcolor=black@0.35:boxborderw=12`
  ].join(',');
  const cmd = `ffmpeg -y -loop 1 -t ${s.dur} -i "${img}" -vf "${vf}" -c:v libx264 -crf 23 -pix_fmt yuv420p -r 30 "${out}"`;
  execSync(cmd, { stdio: 'pipe' });
  return out;
}

function concatScenes(sceneFiles, outName) {
  const list = sceneFiles.map(f => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n');
  const listPath = path.join(OUT, `_${outName}_list.txt`);
  fs.writeFileSync(listPath, list);
  const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${path.join(OUT, outName)}"`;
  execSync(cmd, { stdio: 'pipe' });
  fs.unlinkSync(listPath);
}

function renderDemo(name, scenes, lang) {
  const tmpDir = fs.mkdtempSync(path.join(OUT, `tmp_${lang}_`));
  const files = scenes.map((s, i) => renderScene(s, i, lang, tmpDir));
  concatScenes(files, name);
  // clean tmp
  files.forEach(f => fs.unlinkSync(f));
  fs.rmdirSync(tmpDir);
  console.log('Rendered', name);
}

renderDemo('main-demo-zh.mp4', scenesZh, 'zh');
renderDemo('main-demo-en.mp4', scenesEn, 'en');
console.log('Demo videos done.');
