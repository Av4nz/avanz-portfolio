/**
 * Measures content bounds in a screenshot by finding the leftmost and
 * rightmost non-background pixels in a horizontal band.
 *
 *   node scripts/measure-layout.mjs .screenshots/home-desktop-light.png 26
 */
import sharp from "sharp";

const file = process.argv[2];
const bandY = Number(process.argv[3] ?? 26);

const img = sharp(file);
const { width, height } = await img.metadata();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;

const px = (x, y) => {
  const i = (y * info.width + x) * ch;
  return [data[i], data[i + 1], data[i + 2]];
};

// Background sampled from the far-left edge of the band.
const bg = px(2, bandY);
const isBg = ([r, g, b]) =>
  Math.abs(r - bg[0]) < 12 && Math.abs(g - bg[1]) < 12 && Math.abs(b - bg[2]) < 12;

let left = -1;
let right = -1;
for (let x = 0; x < info.width; x++) {
  if (!isBg(px(x, bandY))) {
    if (left === -1) left = x;
    right = x;
  }
}

const leftMargin = left;
const rightMargin = info.width - 1 - right;
const delta = Math.abs(leftMargin - rightMargin);

console.log(`file        ${file}`);
console.log(`viewport    ${width}x${height}`);
console.log(`band y      ${bandY}`);
console.log(`background  rgb(${bg.join(",")})`);
console.log(`content     x=${left} .. ${right}  (width ${right - left + 1})`);
console.log(`margins     left=${leftMargin}  right=${rightMargin}  delta=${delta}`);
console.log(delta <= 4 ? "RESULT: centered" : "RESULT: NOT centered");
