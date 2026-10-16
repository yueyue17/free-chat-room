// 纯 Node 生成 PWA 图标（无需任何依赖）：圆角渐变底 + 白色对话气泡 + 星光
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) rgba.subarray(y * stride, (y + 1) * stride).copy(raw, y * (stride + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const TOP = hex('#7c5cff');
const BOT = hex('#3d2fb8');
const WHITE = [255, 255, 255];
const STAR = hex('#ffc247');

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
}

function inTriangle(px, py, [x1, y1], [x2, y2], [x3, y3]) {
  const s1 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  const s2 = (x3 - x2) * (py - y2) - (y3 - y2) * (px - x2);
  const s3 = (x1 - x3) * (py - y3) - (y1 - y3) * (px - x3);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

function inStar(px, py, cx, cy, r) {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  // 四角星：开方尺度比较，r 为像素半径
  return Math.sqrt(dx) + Math.sqrt(dy) <= Math.sqrt(r);
}

function draw(size, { maskable = false } = {}) {
  const S = size;
  const rgba = Buffer.alloc(S * S * 4);
  const SS = 3; // 超采样抗锯齿
  const pad = maskable ? 0 : S * 0.045;
  const cardR = maskable ? 0 : S * 0.21;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const t = py / S;
          const bg = [0, 1, 2].map((i) => TOP[i] + (BOT[i] - TOP[i]) * t);
          const inCard = sdRoundRect(px, py, S / 2, S / 2, S / 2 - pad, S / 2 - pad, cardR) <= 0;
          const inBubble =
            sdRoundRect(px, py, S * 0.46, S * 0.43, S * 0.27, S * 0.185, S * 0.12) <= 0 ||
            inTriangle(px, py, [S * 0.3, S * 0.56], [S * 0.44, S * 0.56], [S * 0.27, S * 0.67]);
          const inStarBig = inStar(px, py, S * 0.71, S * 0.3, S * 0.1);
          const inStarSmall = inStar(px, py, S * 0.7, S * 0.63, S * 0.055);
          let c = null;
          if (inStarBig || inStarSmall) c = STAR;
          else if (inBubble) c = WHITE;
          else if (inCard) c = bg;
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * S + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(S, S, rgba);
}

function isMain() {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return true;
  }
}

export { encodePng, chunk, crc32, draw };

if (isMain()) {
  writeFileSync(join(outDir, 'icon-192.png'), draw(192));
  writeFileSync(join(outDir, 'icon-512.png'), draw(512));
  writeFileSync(join(outDir, 'icon-maskable-512.png'), draw(512, { maskable: true }));
  writeFileSync(join(outDir, 'apple-touch-icon.png'), draw(180, { maskable: true }));
  console.log('icons generated →', outDir);
}
