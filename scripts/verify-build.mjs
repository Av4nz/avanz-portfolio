/**
 * Post-build sanity checks against dist/.
 *
 *   npm run verify
 *
 * These are cheap, deterministic assertions about the shipped HTML: the things
 * that are easy to break silently (broken internal links, missing meta tags,
 * accidental client-side JS, unresolved preloads).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ""}`);
  }
};

if (!existsSync(dist)) {
  console.error("dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

const read = (p) => readFileSync(join(dist, p), "utf8");
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const allFiles = walk(dist);
const htmlFiles = allFiles.filter((f) => f.endsWith(".html"));

console.log("\nPages");
const expectedPages = [
  "index.html",
  "404.html",
  "work/placeholder-one-dashboard/index.html",
  "work/placeholder-two-storefront/index.html",
  "work/placeholder-three-component-library/index.html",
];
for (const p of expectedPages) check(p, existsSync(join(dist, p)));
check("sitemap-index.xml", existsSync(join(dist, "sitemap-index.xml")));
check("robots.txt", existsSync(join(dist, "robots.txt")));
check("og.png", existsSync(join(dist, "og.png")));
check("favicon.svg", existsSync(join(dist, "favicon.svg")));

console.log("\nHome page head");
const home = read("index.html");
check("<title> present", /<title>[^<]+<\/title>/.test(home));
check("meta description", /name="description" content="[^"]+"/.test(home));
check("canonical link", home.includes('rel="canonical"'));
check("og:image absolute", /property="og:image" content="https?:\/\//.test(home));
check("twitter:card", home.includes('name="twitter:card"'));
check("JSON-LD Person", home.includes('"@type":"Person"'));
check("lang attribute", home.includes('lang="en"'));
check("theme-color light+dark", (home.match(/name="theme-color"/g) || []).length === 2);

console.log("\nAccessibility basics");
for (const f of htmlFiles) {
  const html = readFileSync(f, "utf8");
  const rel = f.replace(dist, "").replace(/\\/g, "/");
  const imgs = html.match(/<img[^>]*>/g) || [];
  const missingAlt = imgs.filter((i) => !/\balt=/.test(i));
  check(`${rel}: every <img> has alt`, missingAlt.length === 0, `${missingAlt.length} missing`);
}
check("skip link on home", home.includes("Skip to content"));
check("single <h1> on home", (home.match(/<h1[\s>]/g) || []).length === 1);
check("<main> landmark", home.includes("<main"));
check("nav has aria-label", /<nav[^>]+aria-label=/.test(home));

console.log("\nPerformance budget");
const jsFiles = allFiles.filter((f) => f.endsWith(".js"));
const jsBytes = jsFiles.reduce((n, f) => n + statSync(f).size, 0);
check(`client JS ≤ 8 KB (actual ${(jsBytes / 1024).toFixed(1)} KB)`, jsBytes <= 8 * 1024);

const cssFiles = allFiles.filter((f) => f.endsWith(".css"));
const cssBytes = cssFiles.reduce((n, f) => n + statSync(f).size, 0);
check(`CSS ≤ 60 KB (actual ${(cssBytes / 1024).toFixed(1)} KB)`, cssBytes <= 60 * 1024);

const fontFiles = allFiles.filter((f) => f.endsWith(".woff2"));
check(`fonts ≤ 4 files (actual ${fontFiles.length})`, fontFiles.length <= 4);

console.log("\nPreloads resolve");
const preloads = [...home.matchAll(/<link rel="preload" href="([^"]+)"/g)].map((m) => m[1]);
check("2 font preloads emitted", preloads.length === 2, `found ${preloads.length}`);
for (const href of preloads) {
  check(`preload target exists: ${href}`, existsSync(join(dist, href.replace(/^\//, ""))));
}

console.log("\nInternal links resolve");
const hrefs = new Set();
for (const f of htmlFiles) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) hrefs.add(m[1]);
}
for (const href of [...hrefs].sort()) {
  const target = href.endsWith("/") ? join(href, "index.html") : href;
  const onDisk = join(dist, target.replace(/^[/\\]/, ""));
  // /cv.pdf is expected to be missing until the user supplies one.
  if (href === "/cv.pdf") {
    check(`${href} (optional)`, true, "");
    continue;
  }
  check(`${href}`, existsSync(onDisk) || existsSync(onDisk + ".html"));
}

console.log("\nContent placeholders");
const placeholderCount = htmlFiles.filter((f) =>
  readFileSync(f, "utf8").includes("Placeholder content"),
).length;
console.log(`  note  ${placeholderCount} page(s) still marked as placeholder`);
const todoPages = htmlFiles.filter((f) => /TODO:/.test(readFileSync(f, "utf8")));
console.log(`  note  ${todoPages.length} page(s) contain visible TODO text`);

console.log(
  failures === 0
    ? "\nAll structural checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
