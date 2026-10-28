// Generates assets/icon.ico (256x256, 32bpp BMP-in-ICO) for electron-builder.
// Pure Node — no image libraries. Run: node scripts/make-icon.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 256;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.ico");

// Palette (BGRA order for the BMP payload).
const BG = [32, 18, 11, 255]; // #0B1220 dark navy
const FG = [166, 211, 34, 255]; // #22D3A6 teal
const RING = [90, 60, 40, 255]; // muted slate ring

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function pixel(x, y) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  // Thin ring border inset from the canvas edge.
  const dc = Math.hypot(cx - SIZE / 2, cy - SIZE / 2);
  if (dc > 120 && dc < 126) return RING;

  // The "V" mark: two thick diagonals meeting at the bottom vertex.
  const thickness = 30;
  const strokeWidth = thickness / 2;
  const left = distToSegment(cx, cy, 74, 66, 128, 198);
  const right = distToSegment(cx, cy, 182, 66, 128, 198);
  if (Math.min(left, right) <= strokeWidth) return FG;

  return BG;
}

const xor = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  const srcRow = SIZE - 1 - y; // BMP rows are bottom-up
  for (let x = 0; x < SIZE; x++) {
    const [b, g, r, a] = pixel(x, srcRow);
    const offset = (y * SIZE + x) * 4;
    xor[offset] = b;
    xor[offset + 1] = g;
    xor[offset + 2] = r;
    xor[offset + 3] = a;
  }
}

// AND mask: 1 bit per pixel, rows padded to 4 bytes (all opaque → zeros).
const maskRowBytes = Math.ceil(SIZE / 32) * 4;
const andMask = Buffer.alloc(maskRowBytes * SIZE, 0);

const header = Buffer.alloc(40);
header.writeUInt32LE(40, 0); // biSize
header.writeInt32LE(SIZE, 4); // biWidth
header.writeInt32LE(SIZE * 2, 8); // biHeight (XOR + AND)
header.writeUInt16LE(1, 12); // biPlanes
header.writeUInt16LE(32, 14); // biBitCount
header.writeUInt32LE(xor.length + andMask.length, 20); // biSizeImage

const image = Buffer.concat([header, xor, andMask]);

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(1, 4); // image count

const entry = Buffer.alloc(16);
entry[0] = 0; // width 256
entry[1] = 0; // height 256
entry[2] = 0; // palette colours
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(image.length, 8); // bytes in resource
entry.writeUInt32LE(22, 12); // offset

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([dir, entry, image]));
console.log(`wrote ${OUT} (${(dir.length + entry.length + image.length).toLocaleString()} bytes)`);
