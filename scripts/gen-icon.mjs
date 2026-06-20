// Generates resources/icon.png — the Loupe marketplace icon (256x256 RGBA).
// A branded indigo squircle with a white eye. No image deps: rasterized here
// with 4x supersampling and encoded as PNG via Node's built-in zlib.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = 256;
const SS = 4;
const N = OUT * SS; // supersampled resolution (1024)
const CR = 60 * SS; // corner radius

const lerp = (a, b, t) => a + (b - a) * t;
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

const TOP = [124, 94, 248];     // #7C5EF8
const BOTTOM = [67, 56, 202];   // #4338CA
const WHITE = [255, 255, 255];
const IRIS = [79, 70, 229];     // #4F46E5
const PUPIL = [15, 18, 40];     // #0F1228

// Rounded-square signed distance (<= 0 means inside).
function sdRoundRect(px, py) {
  const h = N / 2;
  const qx = Math.abs(px - h) - (h - CR);
  const qy = Math.abs(py - h) - (h - CR);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - CR;
}

// Returns [r,g,b,a] for a supersample point.
function sample(px, py) {
  if (sdRoundRect(px, py) > 0) return [0, 0, 0, 0]; // outside the squircle -> transparent

  // background vertical gradient
  const t = py / N;
  let c = [lerp(TOP[0], BOTTOM[0], t), lerp(TOP[1], BOTTOM[1], t), lerp(TOP[2], BOTTOM[2], t)];

  // eye almond = intersection of two circles offset vertically
  const cx = N / 2;
  const R = 400, o = 280;
  if (dist(px, py, cx, cx - o) <= R && dist(px, py, cx, cx + o) <= R) {
    c = WHITE;
    if (dist(px, py, cx, cx) <= 112) c = IRIS;       // iris
    if (dist(px, py, cx, cx) <= 52) c = PUPIL;        // pupil
    if (dist(px, py, cx - 36, cx - 36) <= 26) c = WHITE; // catch-light
  }
  return [c[0], c[1], c[2], 255];
}

// Rasterize with supersampling -> 256x256 RGBA.
const pixels = Buffer.alloc(OUT * OUT * 4);
for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const s = sample(ox * SS + sx + 0.5, oy * SS + sy + 0.5);
        r += s[0]; g += s[1]; b += s[2]; a += s[3];
      }
    }
    const n = SS * SS;
    const i = (oy * OUT + ox) * 4;
    pixels[i] = Math.round(r / n);
    pixels[i + 1] = Math.round(g / n);
    pixels[i + 2] = Math.round(b / n);
    pixels[i + 3] = Math.round(a / n);
  }
}

// --- minimal PNG encoder ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT, 0);
ihdr.writeUInt32BE(OUT, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
// 10,11,12 = compression/filter/interlace = 0

// raw scanlines with filter byte 0
const raw = Buffer.alloc(OUT * (OUT * 4 + 1));
for (let y = 0; y < OUT; y++) {
  raw[y * (OUT * 4 + 1)] = 0;
  pixels.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const dir = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(dir, '..', 'resources', 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes, ${OUT}x${OUT})`);
