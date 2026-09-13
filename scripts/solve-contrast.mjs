/**
 * Solves for the OKLCH lightness each foreground token needs to hit a target
 * contrast ratio against its background.
 *
 *   node scripts/solve-contrast.mjs
 *
 * Pure maths, no browser: implements the OKLCH -> sRGB conversion directly so
 * the design tokens can be chosen deliberately rather than by trial and error.
 */

// --- colour conversion -----------------------------------------------------

const oklchToSrgb = (L, C, hDeg) => {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, Math.round(c * 255)));
  });
};

const relLum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (c1, c2) => {
  const [hi, lo] = [relLum(c1), relLum(c2)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

// --- current tokens --------------------------------------------------------

const light = {
  bg: [0.985, 0.002, 95],
  surface2: [0.965, 0.003, 95],
  fg: [0.18, 0.006, 265],
  fgMuted: [0.48, 0.008, 265],
  fgSubtle: [0.63, 0.008, 265],
  accent: [0.62, 0.2, 33],
};

const dark = {
  bg: [0.165, 0.005, 265],
  surface2: [0.24, 0.007, 265],
  fg: [0.96, 0.003, 265],
  fgMuted: [0.73, 0.008, 265],
  fgSubtle: [0.58, 0.008, 265],
  accent: [0.72, 0.18, 38],
};

const rgb = (t) => oklchToSrgb(...t);

console.log("=== Current contrast ratios ===\n");
for (const [name, set] of [
  ["LIGHT", light],
  ["DARK", dark],
]) {
  console.log(name);
  const bg = rgb(set.bg);
  const s2 = rgb(set.surface2);
  for (const key of ["fg", "fgMuted", "fgSubtle", "accent"]) {
    const c = rgb(set[key]);
    console.log(
      `  ${key.padEnd(9)} on bg ${contrast(c, bg).toFixed(2)}   on surface-2 ${contrast(c, s2).toFixed(2)}`,
    );
  }
  console.log();
}

// --- solve for a target ----------------------------------------------------

/** Binary search lightness so the colour hits `target` contrast on `bgRgb`. */
const solveL = (chroma, hue, bgRgb, target, darkenDirection) => {
  let lo = darkenDirection ? 0 : 0.5;
  let hi = darkenDirection ? 0.8 : 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const c = contrast(oklchToSrgb(mid, chroma, hue), bgRgb);
    if (darkenDirection) {
      // Lower L = darker = more contrast on a light background.
      if (c > target) lo = mid;
      else hi = mid;
    } else {
      if (c > target) hi = mid;
      else lo = mid;
    }
  }
  return darkenDirection ? lo : hi;
};

console.log("=== Solved lightness for WCAG AA (4.5:1) ===\n");

const lightBg = rgb(light.bg);
const lightS2 = rgb(light.surface2);
console.log("LIGHT (solve against the tighter surface-2 background)");
for (const [key, tok] of [
  ["fgMuted", light.fgMuted],
  ["fgSubtle", light.fgSubtle],
]) {
  const L = solveL(tok[1], tok[2], lightS2, 4.5, true);
  const c = oklchToSrgb(L, tok[1], tok[2]);
  console.log(
    `  ${key}: L ${tok[0]} -> ${L.toFixed(3)}  (bg ${contrast(c, lightBg).toFixed(2)}, surface-2 ${contrast(c, lightS2).toFixed(2)})`,
  );
}
{
  // Accent as text needs 4.5; accent as a button background needs 4.5 vs white.
  const [, C, H] = light.accent;
  const Ltext = solveL(C, H, lightBg, 4.5, true);
  const ctext = oklchToSrgb(Ltext, C, H);
  console.log(
    `  accent-as-text: L ${light.accent[0]} -> ${Ltext.toFixed(3)}  (bg ${contrast(ctext, lightBg).toFixed(2)})`,
  );
  const white = [255, 255, 255];
  console.log(
    `  accent button (white label) at L=${light.accent[0]}: ${contrast(rgb(light.accent), white).toFixed(2)}`,
  );
  const Lbtn = solveL(C, H, white, 4.5, true);
  console.log(`  accent button needs L <= ${Lbtn.toFixed(3)} for a white label`);
}

console.log("\nDARK (solve against the tighter surface-2 background)");
const darkBg = rgb(dark.bg);
const darkS2 = rgb(dark.surface2);
for (const [key, tok] of [
  ["fgMuted", dark.fgMuted],
  ["fgSubtle", dark.fgSubtle],
]) {
  const L = solveL(tok[1], tok[2], darkS2, 4.5, false);
  const c = oklchToSrgb(L, tok[1], tok[2]);
  console.log(
    `  ${key}: L ${tok[0]} -> ${L.toFixed(3)}  (bg ${contrast(c, darkBg).toFixed(2)}, surface-2 ${contrast(c, darkS2).toFixed(2)})`,
  );
}
{
  const [, C, H] = dark.accent;
  const L = solveL(C, H, darkS2, 4.5, false);
  const c = oklchToSrgb(L, C, H);
  console.log(
    `  accent-as-text: L ${dark.accent[0]} -> ${L.toFixed(3)}  (bg ${contrast(c, darkBg).toFixed(2)}, surface-2 ${contrast(c, darkS2).toFixed(2)})`,
  );
}
