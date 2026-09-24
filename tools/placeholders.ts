// Generates placeholder PNGs for every manifest entry that has no real art yet:
// a coloured block with a pixel-font label. Output goes to assets/placeholders/<file>.
//
//   npm run placeholders

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

interface ManifestEntry {
  id: string;
  file: string;
  size: [number, number];
}

const ROOT = join(import.meta.dirname, '..', 'assets');

// 3x5 pixel font. Each glyph is 5 rows of 3 bits.
const FONT: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7], '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [6, 1, 2, 4, 7], '3': [6, 1, 2, 1, 6],
  '4': [5, 5, 7, 1, 1], '5': [7, 4, 6, 1, 6], '6': [3, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 6], _: [0, 0, 0, 0, 7], ' ': [0, 0, 0, 0, 0],
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Muted earthy colour from the asset's category (the part before the first underscore). */
export function placeholderColour(id: string): [number, number, number] {
  const h = hash(id.split('_')[0]);
  const hue = h % 360;
  const [r, g, b] = hslToRgb(hue / 360, 0.28, 0.32);
  return [r, g, b];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function labelFor(id: string, width: number): string[] {
  const maxChars = Math.max(1, Math.floor((width - 2) / 4));
  const parts = id.toUpperCase().split('_');
  const lines: string[] = [];
  for (const p of parts) lines.push(p.slice(0, maxChars));
  return lines;
}

function makePlaceholder(e: ManifestEntry): Buffer {
  const [w, h] = e.size;
  const px = new Uint8Array(w * h * 4);
  const [r, g, b] = placeholderColour(e.id);
  const set = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      set(x, y, edge ? [r >> 1, g >> 1, b >> 1] : [r, g, b]);
    }
  }
  const lines = labelFor(e.id, w).slice(0, Math.max(1, Math.floor((h - 2) / 6)));
  const top = Math.max(1, Math.floor((h - lines.length * 6) / 2));
  lines.forEach((line, li) => {
    const left = Math.max(1, Math.floor((w - line.length * 4 + 1) / 2));
    [...line].forEach((ch, ci) => {
      const glyph = FONT[ch] ?? FONT[' '];
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < 3; gx++) {
          if (row & (4 >> gx)) set(left + ci * 4 + gx, top + li * 6 + gy, [235, 222, 196]);
        }
      });
    });
  });
  return encodePng(w, h, px);
}

function main(): void {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as { assets: ManifestEntry[] };
  let made = 0;
  let real = 0;
  for (const e of manifest.assets) {
    if (existsSync(join(ROOT, e.file))) {
      real++;
      continue;
    }
    const out = join(ROOT, 'placeholders', e.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, makePlaceholder(e));
    made++;
  }
  console.log(`${real} assets have art, ${made} placeholders written to assets/placeholders/`);
}

main();
