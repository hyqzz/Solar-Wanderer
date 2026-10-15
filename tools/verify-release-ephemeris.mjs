// Independent, off-grid Horizons fixtures. Re-run --refresh when the release
// data interval changes; ordinary runs compare the checked-in references.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installEphemeris } from '../src/astro/sampledEphemeris.js';
import { moonLocalPosition } from '../src/astro/moons.js';
import { moonGeocentric } from '../src/astro/moon.js';
import { planetPosition } from '../src/astro/planets.js';
import { tnoPosition } from '../src/astro/tno.js';
import { COMETS, cometPosition } from '../src/scene/comets.js';
import { VOYAGERS, voyagerPosition } from '../src/scene/heliosphere.js';
import { newHorizonsPosition } from '../src/scene/spacecraft.js';

const root = new URL('../public/data/ephemeris/', import.meta.url);
const fixturePath = new URL('../tests/release-ephemeris.json', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
const specs = { ...manifest.bodies, moon: { command: '301', center: '500@399', kind: 'lunar' } };
for (const [id, command] of Object.entries({ mercury:'199', venus:'299', earth:'399', mars:'499', jupiter:'599', saturn:'699', uranus:'799', neptune:'899', pluto:'999' })) {
  specs[id] = { command, center: '500@10', kind:'planet' };
}
// 参考时刻铺满整个窗口（2025–2035），而不是只测开头两年——
// 否则窗口延长了这件事本身没有独立证据。
const dates = ['2025-03-14','2026-06-10','2026-10-12','2027-12-03','2029-05-21','2030-11-08','2032-02-19','2033-07-04','2034-09-27'];
const jds = dates.map(d => Date.parse(d + 'T12:37:17Z') / 86400000 + 2440587.5);
const signature = createHash('sha256').update(JSON.stringify({ dates, specs })).digest('hex');
let fixture = { source:'NASA/JPL Horizons, geometric Ecliptic J2000; dates interpreted as TDB', signature, dates, bodies:{} };
if (existsSync(fixturePath) && !process.argv.includes('--refresh')) {
  const old = JSON.parse(readFileSync(fixturePath));
  if (JSON.stringify(old.dates) === JSON.stringify(dates)) {
    fixture.bodies = Object.fromEntries(Object.entries(old.bodies).filter(([id,entry]) => entry.command === specs[id]?.command && entry.center === specs[id]?.center && entry.kind === specs[id]?.kind));
  }
}
for (const [id, spec] of Object.entries(specs)) {
  if (fixture.bodies[id]) continue;
  const params = new URLSearchParams({ format:'text', COMMAND:`'${spec.command}'`, OBJ_DATA:"'NO'", MAKE_EPHEM:"'YES'", EPHEM_TYPE:"'VECTORS'", CENTER:`'${spec.center}'`, TLIST:`'${jds.join(' ')}'`, TIME_TYPE:"'TDB'", VEC_TABLE:"'2'", VEC_CORR:"'NONE'", REF_PLANE:"'ECLIPTIC'", REF_SYSTEM:"'J2000'", OUT_UNITS:"'KM-S'", CSV_FORMAT:"'YES'" });
  let text;
  for (let n = 0; n < 3; n++) {
    try {
      const res = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + params, { signal:AbortSignal.timeout(45000) });
      if (!res.ok) throw Error('HTTP ' + res.status);
      text = await res.text();
      if (!text.includes('$$SOE')) throw Error(text.slice(0,300));
      break;
    } catch(e) { if (n === 2) throw e; }
  }
  const rows = text.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/)[1].trim().split('\n').map(line => {
    const values = line.split(',');
    return { jd:+values[0], pos:values.slice(2,5).map(Number), vel:values.slice(5,8).map(Number) };
  });
  if (rows.length !== dates.length || rows.some(r => [r.jd,...r.pos,...r.vel].some(x => !Number.isFinite(x)))) throw Error('Invalid reference ' + id);
  fixture.bodies[id] = { kind:spec.kind, command:spec.command, center:spec.center, rows };
  writeFileSync(fixturePath, JSON.stringify(fixture,null,2) + '\n');
  console.log('REFERENCE',id, rows.length);
}
// 只装载覆盖参考时刻的那些分片（窗口 10 年共 650 片，全装没有必要）
let loadedShards = 0;
for (const [id,spec] of Object.entries(manifest.bodies)) {
  for (const file of Object.values(spec.files ?? {})) {
    if (!jds.some(jd => jd >= file.startJD && jd <= file.endJD)) continue;
    const buffer = readFileSync(new URL(file.file,root));
    if (createHash('sha256').update(buffer).digest('hex') !== file.sha256) throw Error('Integrity ' + id);
    installEphemeris(id,buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
    loadedShards++;
  }
}
console.log(JSON.stringify({ loadedShards, window: manifest.start + ' … ' + manifest.end }));
let failures = 0, count = 0;
for (const [id,{kind,rows}] of Object.entries(fixture.bodies)) {
  let maxDeg=0,maxKm=0;
  for (const ref of rows) {
    const p = kind === 'planet' ? planetPosition(id,ref.jd) : kind === 'lunar' ? moonGeocentric(ref.jd) : kind === 'moon' ? moonLocalPosition(id,ref.jd) : kind === 'tno' ? tnoPosition(id,ref.jd) : kind === 'comet' ? cometPosition(COMETS.find(c=>c.id===id),ref.jd) : id === 'newhorizons' ? newHorizonsPosition(ref.jd) : voyagerPosition(VOYAGERS.find(v=>v.id===id),ref.jd);
    const a=[p.x,p.y,p.z],b=ref.pos;
    const cross = Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
    const deg=Math.atan2(cross,a.reduce((sum,x,i)=>sum+x*b[i],0))*180/Math.PI;
    const km=Math.hypot(...a.map((x,i)=>x-b[i]));
    maxDeg=Math.max(maxDeg,deg);maxKm=Math.max(maxKm,km);count++;
  }
  const pass=maxDeg < 0.001 && maxKm < 10;
  if (!pass) failures++;
  console.log(JSON.stringify({ id,kind,maxDeg,maxKm,pass }));
}
console.log(JSON.stringify({targets:Object.keys(fixture.bodies).length,samples:count,failures}));
process.exitCode = failures ? 1 : 0;
