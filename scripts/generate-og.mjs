/**
 * Generates public/og.png (1200x630) for social sharing.
 *
 *   npm run og
 *
 * Re-run after changing your name, role or tagline below.
 *
 * Why Satori rather than plain SVG + sharp: sharp's SVG renderer (librsvg)
 * ignores @font-face, so text silently falls back to a system font. Satori
 * lays the text out with the real font and outputs SVG paths, which sharp can
 * then rasterise faithfully.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import satori from "satori";
import sharp from "sharp";
import wawoff2 from "wawoff2";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// Keep in sync with src/data/site.ts
const NAME = "Affan Arfani Arifin";
const ROLE = "Front-End Developer";
const TAGLINE = "Fast, accessible web interfaces.";
const URL_LABEL = "AVANZ.DEV";

const BG = "#141416";
const FG = "#FAFAF9";
const MUTED = "#A1A1A6";
const ACCENT = "#F0562D";
const RULE = "#2A2A2E";

/**
 * Satori needs raw TTF/OTF, so decompress the woff2 files first.
 *
 * Two subtleties, both of which cause "Unsupported OpenType signature":
 *
 * 1. `.slice()` is required. wawoff2 returns a Uint8Array view into the
 *    Emscripten heap with a non-zero byteOffset, and opentype.js reads the
 *    underlying ArrayBuffer directly, so it would start at the wrong place.
 *
 * 2. These must run SEQUENTIALLY, not via Promise.all. wawoff2 shares a single
 *    WASM heap between calls, so concurrent decompressions overwrite each
 *    other's output.
 */
async function loadFont(pkg, file) {
  const buf = readFileSync(resolve(root, "node_modules", pkg, "files", file));
  const out = await wawoff2.decompress(buf);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const itSemi = await loadFont("@fontsource/inter-tight", "inter-tight-latin-600-normal.woff2");
const itMedium = await loadFont("@fontsource/inter-tight", "inter-tight-latin-500-normal.woff2");
const itRegular = await loadFont("@fontsource/inter-tight", "inter-tight-latin-400-normal.woff2");
const jbMedium = await loadFont("@fontsource/jetbrains-mono", "jetbrains-mono-latin-500-normal.woff2");

/**
 * Minimal hyperscript so this file needs no JSX transform.
 *
 * `children` is omitted entirely when a node has none: passing an empty array
 * makes Satori miscount child nodes and throw "Expected <div> to have explicit
 * display: flex ... if it has more than one child node".
 */
const h = (type, props = {}, ...children) => {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: kids.length ? { ...props, children: kids } : { ...props },
  };
};

const rule = (left) =>
  h("div", {
    style: {
      position: "absolute",
      top: 0,
      left,
      width: 1,
      height: 630,
      backgroundColor: RULE,
    },
  });

const markup = h(
  "div",
  {
    style: {
      width: 1200,
      height: 630,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: BG,
      padding: "80px",
      fontFamily: "Inter Tight",
      position: "relative",
    },
  },
  rule(300),
  rule(600),
  rule(900),

  // Accent bar
  h("div", {
    style: { width: 72, height: 6, backgroundColor: ACCENT, display: "flex" },
  }),

  // Text block
  h(
    "div",
    { style: { display: "flex", flexDirection: "column" } },
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 84,
          fontWeight: 600,
          color: FG,
          letterSpacing: "-2.5px",
          lineHeight: 1.05,
        },
      },
      NAME,
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 34,
          fontWeight: 500,
          color: ACCENT,
          letterSpacing: "-0.5px",
          marginTop: 14,
        },
      },
      ROLE,
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 30,
          fontWeight: 400,
          color: MUTED,
          letterSpacing: "-0.2px",
          marginTop: 28,
        },
      },
      TAGLINE,
    ),
  ),

  h(
    "div",
    {
      style: {
        display: "flex",
        fontFamily: "JetBrains Mono",
        fontSize: 20,
        fontWeight: 500,
        color: MUTED,
        letterSpacing: "2px",
      },
    },
    URL_LABEL,
  ),
);

const svg = await satori(markup, {
  width: 1200,
  height: 630,
  fonts: [
    { name: "Inter Tight", data: itSemi, weight: 600, style: "normal" },
    { name: "Inter Tight", data: itMedium, weight: 500, style: "normal" },
    { name: "Inter Tight", data: itRegular, weight: 400, style: "normal" },
    { name: "JetBrains Mono", data: jbMedium, weight: 500, style: "normal" },
  ],
});

const out = resolve(root, "public/og.png");
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log("Wrote", out);
