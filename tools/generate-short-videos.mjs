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

function renderFromSequence(name, seqDir, lang, title, sub, dur) {
  const fps = 30;
  const vf = [
    `fps=${fps}`,
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920:(iw-1080)/2:(ih-1920)/2',
    drawtextLine(lang, title, 'H-320', lang === 'zh' ? 64 : 58),
    drawtextLine(lang, sub, 'H-230', lang === 'zh' ? 34 : 30, 0.9),
    drawtextLine(lang, 'sw.icodestar.net', 'H-120', 26, 0.85, true)
  ].join(',');
  const cmd = `ffmpeg -y -framerate 10 -i "${seqDir}/frame_%04d.png" -vf "${vf}" -t ${dur} -c:v libx264 -crf 23 -pix_fmt yuv420p "${path.join(OUT, name)}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log('Rendered', name);
}

function renderFromImage(name, img, lang, title, sub, dur) {
  const fps = 30;
  const totalFrames = dur * fps;
  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920:(iw-1080)/2:(ih-1920)/2',
    `zoompan=z='1+0.35*on/${totalFrames}':d=1:fps=${fps}:s=1080x1920`,
    drawtextLine(lang, title, 'H-320', lang === 'zh' ? 64 : 58),
    drawtextLine(lang, sub, 'H-230', lang === 'zh' ? 34 : 30, 0.9),
    drawtextLine(lang, 'sw.icodestar.net', 'H-120', 26, 0.85, true)
  ].join(',');
  const cmd = `ffmpeg -y -framerate ${fps} -loop 1 -t ${dur} -i "${img}" -vf "${vf}" -c:v libx264 -crf 23 -pix_fmt yuv420p "${path.join(OUT, name)}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log('Rendered', name);
}

// 1. Scale: Earth to Oort Cloud — handled by generate-earth-to-oort-short.mjs

// 2. Saturn rings
renderFromImage('short-saturn-rings-zh.mp4', `${ASSETS}/screenshots/saturn-rings_1920x1080.png`, 'zh', '土星环薄到难以置信', '宽 28 万公里，厚仅 10-20 米', 12);
renderFromImage('short-saturn-rings-en.mp4', `${ASSETS}/screenshots/saturn-rings_1920x1080.png`, 'en', "Saturn's rings are unbelievably thin", '280,000 km wide · 10-20 m thick', 12);

// 3. Jupiter storm
renderFromImage('short-jupiter-storm-zh.mp4', `${ASSETS}/screenshots/jupiter-redspot_1920x1080.png`, 'zh', '木星大红斑能装下地球', '一个存在至少 350 年的风暴', 12);
renderFromImage('short-jupiter-storm-en.mp4', `${ASSETS}/screenshots/jupiter-redspot_1920x1080.png`, 'en', 'A storm bigger than Earth', 'The Great Red Spot', 12);

// 4. Moon earthrise
renderFromImage('short-moon-earthrise-zh.mp4', `${ASSETS}/screenshots/moon-earthrise_1920x1080.png`, 'zh', '站在月球看地球升起', '真实 NASA JPL 星历驱动', 12);
renderFromImage('short-moon-earthrise-en.mp4', `${ASSETS}/screenshots/moon-earthrise_1920x1080.png`, 'en', 'Watch Earth rise from the Moon', 'Real positions · Real scale', 12);

// 5. Mars sunset
renderFromImage('short-mars-sunset-zh.mp4', `${ASSETS}/screenshots/mars-sunset_1920x1080.png`, 'zh', '火星的日落是蓝色的', '尘埃散射红光，蓝光留了下来', 12);
renderFromImage('short-mars-sunset-en.mp4', `${ASSETS}/screenshots/mars-sunset_1920x1080.png`, 'en', 'Mars sunsets are blue', 'Dust scatters red light · Blue remains', 12);

console.log('Short videos done.');
