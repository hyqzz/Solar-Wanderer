import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ASSETS = 'campaign/assets';
const OUT = 'campaign/assets/videos';
const FONT_ZH = `${ASSETS}/fonts/msyh.ttc`.replace(/\\/g, '/');
const FONT_EN = `${ASSETS}/fonts/arial.ttf`.replace(/\\/g, '/');

function drawtextLine(lang, text, y, size, opacity = 1, box = false) {
  const font = lang === 'zh' ? FONT_ZH : FONT_EN;
  let s = `drawtext=fontfile=${font}:text='${text.replace(/:/g, '\\:').replace(/'/g, "'\\''")}':fontsize=${size}:fontcolor=white@${opacity}:x=60:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3`;
  if (box) s += ':box=1:boxcolor=black@0.35:boxborderw=12';
  return s;
}

const clips = [
  { img: `${ASSETS}/screenshots/earth-orbit_1920x1080.png`, dur: 3 },
  { img: `${ASSETS}/screenshots/saturn-rings_1920x1080.png`, dur: 3 },
  { img: `${ASSETS}/screenshots/jupiter-redspot_1920x1080.png`, dur: 3 },
  { img: `${ASSETS}/screenshots/pluto-heart_1920x1080.png`, dur: 3 },
  { img: `${ASSETS}/video-sequences/earth-to-oort/frame_0030.png`, dur: 3 },
];

function renderClip(clip, lang, title, sub, tmpDir, idx) {
  const fps = 30;
  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920:(iw-1080)/2:(ih-1920)/2',
    `zoompan=z='1+0.18*on/${clip.dur*fps}':d=1:fps=${fps}:s=1080x1920`,
    drawtextLine(lang, title, 'H-320', lang === 'zh' ? 64 : 58),
    drawtextLine(lang, sub, 'H-230', lang === 'zh' ? 34 : 30, 0.9),
    drawtextLine(lang, 'sw.icodestar.net', 'H-120', 26, 0.85, true)
  ].join(',');
  const out = path.join(tmpDir, `clip_${idx}_${lang}.mp4`).replace(/\\/g, '/');
  const cmd = `ffmpeg -y -loop 1 -t ${clip.dur} -i "${clip.img}" -vf "${vf}" -c:v libx264 -crf 23 -pix_fmt yuv420p -r ${fps} "${out}"`;
  execSync(cmd, { stdio: 'pipe' });
  return out;
}

function concatClips(files, outName) {
  const list = files.map(f => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n');
  const listPath = path.join(OUT, `_oort_short_${outName}_list.txt`);
  fs.writeFileSync(listPath, list);
  const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${path.join(OUT, outName)}"`;
  execSync(cmd, { stdio: 'pipe' });
  fs.unlinkSync(listPath);
}

function render(name, lang, title, sub) {
  const tmpDir = fs.mkdtempSync(path.join(OUT, 'tmp_oort_'));
  const files = clips.map((c, i) => renderClip(c, lang, title, sub, tmpDir, i));
  concatClips(files, name);
  files.forEach(f => fs.unlinkSync(f));
  fs.rmdirSync(tmpDir);
  console.log('Rendered', name);
}

render('short-earth-to-oort-zh.mp4', 'zh', '从地球缩放到太阳系边缘', '真实 1:1 比例 · 0.5 米到 10 万 AU');
render('short-earth-to-oort-en.mp4', 'en', 'From Earth to the edge of the solar system', 'True 1:1 scale · 0.5 m to 100,000 AU');
console.log('Earth-to-Oort short videos done.');
