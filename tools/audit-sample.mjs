import { decodePng } from './rig/dem.mjs';
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const img = decodePng(readFileSync(file));
const { width: W, height: H, data, channels: C } = img;
const x = Number(process.argv[3] ?? Math.floor(W / 2));
console.log('size', W, H, 'ch', C, 'x=', x);
for (const y of (process.argv[4] ?? '200,250,275,290,300,310,320,330,340').split(',').map(Number)) {
  const i = (y * W + x) * C;
  console.log('y=' + y, 'RGB', data[i] + ',' + data[i+1] + ',' + data[i+2]);
}
