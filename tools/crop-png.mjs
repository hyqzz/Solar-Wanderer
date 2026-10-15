// 截图裁剪放大：审查时经常需要把某个可疑区域放大看，肉眼在整图上分辨不出
// 是"纹理特征"还是"渲染伪影"。用法：
//   node tools/crop-png.mjs <输入.png> <输出.png> <x> <y> <宽> <高> [放大倍数]
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePng } from './rig/dem.mjs';

const [inp, outp, xs, ys, ws, hs, ss = '3'] = process.argv.slice(2);
const x0 = +xs, y0 = +ys, cw = +ws, ch = +hs, S = +ss;

const src = decodePng(readFileSync(inp));
const { width: W, data, channels: C } = src;

const OW = cw * S, OH = ch * S;
const raw = Buffer.alloc(OH * (OW * 3 + 1));
for (let y = 0; y < OH; y++) {
  const row = y * (OW * 3 + 1);
  raw[row] = 0;                                  // filter: none
  for (let x = 0; x < OW; x++) {
    const sx = Math.min(W - 1, Math.max(0, x0 + Math.floor(x / S)));
    const sy = Math.max(0, y0 + Math.floor(y / S));
    const si = (sy * W + sx) * C, di = row + 1 + x * 3;
    raw[di] = data[si]; raw[di + 1] = data[si + 1]; raw[di + 2] = data[si + 2];
  }
}

const crcTable = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xFFFFFFFF;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, d) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(type), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OW, 0); ihdr.writeUInt32BE(OH, 4);
ihdr[8] = 8; ihdr[9] = 2;                        // 8-bit RGB

writeFileSync(outp, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
console.log(`${inp} [${x0},${y0} ${cw}×${ch}] ×${S} → ${outp} (${OW}×${OH})`);
