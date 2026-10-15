// 生成离线测试基准：JPL Horizons 参考向量 → tests/fixtures.json
//
// 历元约定（重要）：卫星的解析模型是"双历元密切根数 + 经验长期率"，精度随离拟合
// 历元的距离而退化（见 tools/fit-moons.mjs 与 README 的已知限制）。所以基准历元
// 必须与拟合历元同步，否则测到的是"fixture 离历元多远"而不是"模型准不准"。
// 正确顺序：先 npm run fit-moons，再 npm run make-fixtures。
//
// 除历元点外，另取一个远期点（DEGRADE_DAYS 后）单独记录，把"已知退化"变成
// 一个被追踪的数字，而不是藏在宽容差里。
import { writeFileSync } from 'node:fs';
import { horizonsVectors } from './horizonsClient.mjs';

const EPOCH = new Date();
const DEGRADE_DAYS = 180;
const DEGRADED = new Date(EPOCH.getTime() + DEGRADE_DAYS * 86400000);

const PLANET_IDS = {
  mercury: '199', venus: '299', earth: '399', mars: '499', jupiter: '599',
  saturn: '699', uranus: '799', neptune: '899', pluto: '999',
};
const MOON_IDS = {
  moon: ['301', '500@399'],
  io: ['501', '500@599'], europa: ['502', '500@599'], ganymede: ['503', '500@599'],
  callisto: ['504', '500@599'],
  mimas: ['601', '500@699'], enceladus: ['602', '500@699'], titan: ['606', '500@699'],
  iapetus: ['608', '500@699'],
  titania: ['703', '500@799'], miranda: ['705', '500@799'],
  triton: ['801', '500@899'], charon: ['901', '500@999'],
};

const fix = {
  epochISO: EPOCH.toISOString(),
  degradeDays: DEGRADE_DAYS,
  planets: {}, moonGeo: null, moonsLocal: {}, moonsLocalDegraded: {},
};

for (const [name, id] of Object.entries(PLANET_IDS)) {
  const r = await horizonsVectors(id, '500@10', EPOCH, false);
  fix.planets[name] = { jdTDB: r.jdTDB, pos: r.pos };
  console.log('planet', name, 'ok');
}

for (const [name, [cmd, center]] of Object.entries(MOON_IDS)) {
  const r = await horizonsVectors(cmd, center, EPOCH, false);
  const ref = { jdTDB: r.jdTDB, pos: r.pos };
  if (name === 'moon') fix.moonGeo = ref; else fix.moonsLocal[name] = ref;
  console.log('moon', name, 'ok (历元)');

  if (name === 'moon') continue; // 月球解析路径走 Meeus，不参与卫星退化统计
  const rd = await horizonsVectors(cmd, center, DEGRADED, false);
  fix.moonsLocalDegraded[name] = { jdTDB: rd.jdTDB, pos: rd.pos };
  console.log('moon', name, `ok (+${DEGRADE_DAYS} 天)`);
}

writeFileSync(new URL('../tests/fixtures.json', import.meta.url), JSON.stringify(fix, null, 2));
console.log(`\nfixtures.json 已写入（历元 ${fix.epochISO}，退化点 +${DEGRADE_DAYS} 天）`);
