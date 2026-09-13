/**
 * Generates the favicon set from public/favicon.svg.
 *
 *   npm run icons
 *
 * Produces:
 *   public/favicon.ico        32x32, for browsers that request /favicon.ico
 *   public/apple-touch-icon.png  180x180, for iOS home screen
 *
 * Run this after editing favicon.svg so every icon stays in sync.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/favicon.svg"));

// --- apple-touch-icon ------------------------------------------------------
// iOS ignores transparency and applies its own rounded mask, so render on an
// opaque background at the full 180x180.
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .flatten({ background: "#111113" })
  .png({ compressionLevel: 9 })
  .toFile(join(root, "public/apple-touch-icon.png"));
console.log("wrote public/apple-touch-icon.png (180x180)");

// --- favicon.ico -----------------------------------------------------------
// Hand-assembled ICO: sharp cannot write .ico, and the format is simple enough
// that a dependency is not worth it. One 32x32 PNG-compressed entry, which
// every browser released in the last decade supports.
const SIZE = 32;
const png = await sharp(svg, { density: 384 })
  .resize(SIZE, SIZE)
  .png({ compressionLevel: 9 })
  .toBuffer();

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type 1 = icon
header.writeUInt16LE(1, 4); // one image

const entry = Buffer.alloc(16);
entry.writeUInt8(SIZE, 0); // width
entry.writeUInt8(SIZE, 1); // height
entry.writeUInt8(0, 2); // palette size, 0 = truecolour
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8); // image byte length
entry.writeUInt32LE(header.length + 16, 12); // offset to image data

writeFileSync(join(root, "public/favicon.ico"), Buffer.concat([header, entry, png]));
console.log(`wrote public/favicon.ico (${SIZE}x${SIZE}, ${png.length} bytes)`);
