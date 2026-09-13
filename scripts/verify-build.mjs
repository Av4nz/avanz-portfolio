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
check("favicon.ico", existsSync(join(dist, "favicon.ico")));
check("apple-touch-icon.png", existsSync(join(dist, "apple-touch-icon.png")));

console.log("\nIcons are ours, not the scaffold's");
{
  // Astro's starter ships a rocket favicon.ico. Shipping it on a personal
  // portfolio is a small but real branding leak, so assert it is gone.
  const ico = readFileSync(join(dist, "favicon.ico"));
  check("favicon.ico is a valid ICO container", ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1);
  const entries = ico.readUInt16LE(4);
  check(`favicon.ico declares ${entries} image(s)`, entries >= 1);
  if (entries >= 1) {
    const size = ico.readUInt32LE(6 + 8);
    const offset = ico.readUInt32LE(6 + 12);
    check("favicon.ico image data is in bounds", offset + size <= ico.length);
    const sig = ico.subarray(offset, offset + 8);
    check(
      "favicon.ico embeds a PNG",
      sig.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
  }
  // The scaffold icon was 655 bytes and drawn as a rocket; ours is generated
  // from favicon.svg. Compare against the SVG's accent colour instead of a
  // brittle byte count.
  const svg = readFileSync(join(dist, "favicon.svg"), "utf8");
  check("favicon.svg carries the AvanZ label", svg.includes('aria-label="AvanZ"'));
  check("favicon.svg uses the accent colour", /#F0(4E|56)23/i.test(svg));
}

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
  // No exemptions: every emitted internal link must resolve. Optional assets
  // such as the CV are handled by not rendering the link at all (src/lib/assets.ts).
  check(`${href}`, existsSync(onDisk) || existsSync(onDisk + ".html"));
}

console.log("\nOptional CV handling");
const cvExists = existsSync(join(dist, "cv.pdf"));
const cvLinked = [...hrefs].includes("/cv.pdf");
check(
  cvExists ? "cv.pdf present and linked" : "no cv.pdf, so no CV link is rendered",
  cvExists ? cvLinked : !cvLinked,
  cvExists ? "file exists but nothing links to it" : "a /cv.pdf link would 404",
);

console.log("\nContent language");
{
  // The site is English-only. Indonesian filler is easy to leave behind when
  // drafting, so fail the build on common giveaways in visible text.
  const idWords = [
    "dan ", "yang ", "dengan ", "untuk ", "adalah ", "tidak ", "saya ",
    "proyek ", "silakan", "terima kasih",
  ];
  for (const f of htmlFiles) {
    const rel = f.replace(dist, "").replace(/\\/g, "/");
    const html = readFileSync(f, "utf8");
    // Strip tags, scripts and JSON-LD so only rendered copy is inspected.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .toLowerCase();
    const hits = idWords.filter((w) => text.includes(w));
    check(`${rel}: English copy only`, hits.length === 0, `found: ${hits.join(", ")}`);
  }
  check("html lang is en", /<html[^>]+lang="en"/.test(home));
}

console.log("\nDocumented fields match the schema");
{
  // The README tells Affan exactly which frontmatter fields to supply. If the
  // schema and the docs drift apart, he follows instructions that fail to build.
  const schema = readFileSync(join(root, "src/content.config.ts"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const documented = [
    "title", "summary", "order", "featured", "period", "role", "duration",
    "team", "stack", "liveUrl", "repoUrl", "outcomes", "cover", "draft",
  ];
  for (const field of documented) {
    const inSchema = new RegExp(`^\\s*${field}:`, "m").test(schema);
    const inReadme = readme.includes(`\`${field}\``);
    check(`${field}: in schema and README`, inSchema && inReadme, `schema=${inSchema} readme=${inReadme}`);
  }
}

console.log("\nDomain has a single source of truth");
{
  // The domain must come from site.ts alone. Hardcoding it anywhere else means
  // that changing the domain silently leaves stale absolute URLs behind, which
  // is exactly the kind of bug nobody notices until the site is live.
  const siteTs = readFileSync(join(root, "src/data/site.ts"), "utf8");
  const configured = siteTs.match(/url:\s*"([^"]+)"/)?.[1];
  check("site.ts declares a url", Boolean(configured), configured ?? "not found");

  const host = configured ? new URL(configured).host : "";

  // robots.txt must be generated, not a hand-maintained copy.
  check(
    "robots.txt is generated, not static",
    !existsSync(join(root, "public/robots.txt")),
    "public/robots.txt still exists and will shadow the generated route",
  );

  const robots = read("robots.txt");
  check("robots.txt advertises the configured host", robots.includes(host), robots.trim());

  const sitemap = read("sitemap-0.xml");
  check("sitemap uses the configured host", sitemap.includes(`https://${host}/`));

  check("canonical uses the configured host", home.includes(`https://${host}/`));

  // Scan source for the domain written out by hand.
  const sourceFiles = walk(join(root, "src")).concat(
    existsSync(join(root, "public")) ? walk(join(root, "public")) : [],
  );
  const offenders = [];
  for (const f of sourceFiles) {
    if (f.endsWith(".png") || f.endsWith(".woff2") || f.endsWith(".pdf") || f.endsWith(".ico")) continue;
    const rel = f.replace(root, "").replace(/\\/g, "/");
    if (rel.endsWith("/src/data/site.ts")) continue; // the one allowed place
    const body = readFileSync(f, "utf8");
    if (host && body.includes(host)) offenders.push(rel);
  }
  check(
    "no source file hardcodes the domain",
    offenders.length === 0,
    offenders.join(", "),
  );
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
