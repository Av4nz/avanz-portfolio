/**
 * Exercises the case-study code paths that no placeholder currently triggers.
 *
 *   npm run test:content
 *
 * Why this exists: every placeholder is `draft: true`, has no `cover` image and
 * declares both `liveUrl` and `repoUrl`. So the opposite branches, the ones
 * Affan will actually hit when writing a real case study, have never run. This
 * builds a throwaway entry that takes those branches, asserts the output, and
 * removes it again.
 *
 * The fixture is written into src/content/work/ and deleted in a finally block,
 * so a crash cannot leave the repo dirty.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = join(root, "src/content/work");
const SLUG = "tmp-fixture-real-project";
const mdxPath = join(workDir, `${SLUG}.mdx`);
const imgPath = join(workDir, `${SLUG}-cover.png`);

let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ""}`);
  }
};

const cleanup = () => {
  rmSync(mdxPath, { force: true });
  rmSync(imgPath, { force: true });
};

try {
  // A real 16:9 cover image, so Astro's asset pipeline does actual work.
  await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 20, g: 20, b: 22 },
    },
  })
    .png()
    .toFile(imgPath);

  // Deliberately the inverse of every placeholder:
  //   draft: false        -> no "Placeholder" badge anywhere
  //   cover + coverAlt    -> the <Image> pipeline runs
  //   no liveUrl/repoUrl  -> both buttons must be absent
  //   outcomes: []        -> the Outcomes block must not render
  writeFileSync(
    mdxPath,
    `---
title: "Fixture Real Project"
summary: "A temporary entry used to exercise the cover-image and published-state code paths."
order: 99
featured: true
draft: false
period: "2026"
role: "Front-End Developer"
duration: "4 weeks"
team: "Solo"
stack: ["Astro", "TypeScript"]
cover: "./${SLUG}-cover.png"
coverAlt: "Flat dark placeholder used only for testing"
outcomes: []
---

## Context

Fixture body content for the automated content test.
`,
  );

  console.log("\nBuilding with a published, cover-bearing case study...");
  execFileSync("npx", ["astro", "build"], {
    cwd: root,
    stdio: "pipe",
    shell: true,
  });

  const pagePath = join(root, "dist/work", SLUG, "index.html");
  const homePath = join(root, "dist/index.html");

  console.log("\nPublished case study renders");
  check("case-study page was generated", existsSync(pagePath));

  const page = readFileSync(pagePath, "utf8");
  const home = readFileSync(homePath, "utf8");

  console.log("\nCover image pipeline");
  // Astro rewrites the source path to a hashed, optimised asset.
  const imgTags = page.match(/<img[^>]*>/g) ?? [];
  const coverImg = imgTags.find((t) => t.includes("_astro"));
  check("cover image is emitted and optimised", Boolean(coverImg), `${imgTags.length} img tag(s)`);
  if (coverImg) {
    check("cover has the declared alt text", coverImg.includes("Flat dark placeholder"));
    check("cover is responsive (srcset)", coverImg.includes("srcset"));
    check("cover declares width and height", /width="\d+"/.test(coverImg) && /height="\d+"/.test(coverImg));
    const src = coverImg.match(/src="([^"]+)"/)?.[1];
    check(
      "cover file exists on disk",
      Boolean(src) && existsSync(join(root, "dist", src.replace(/^\//, ""))),
      src ?? "no src",
    );
  }
  // The landing page card should also render the image rather than the
  // "Image pending" fallback.
  const cardHasImage = home.includes(`/work/${SLUG}/`) && home.match(/<img[^>]*_astro[^>]*>/);
  check("landing card shows the cover, not the fallback", Boolean(cardHasImage));

  console.log("\nPublished state (draft: false)");
  // Isolate this entry's markup so a neighbouring placeholder cannot mask a bug.
  const cardStart = home.indexOf(`/work/${SLUG}/`);
  const cardSlice = cardStart > -1 ? home.slice(cardStart, cardStart + 1800) : "";
  check("no Placeholder badge on the card", !cardSlice.includes(">Placeholder<"), cardSlice.slice(0, 0));
  check("no placeholder banner on the page", !page.includes("Placeholder content"));

  console.log("\nOmitted optional fields");
  check("no live-site button when liveUrl is absent", !page.includes("Visit live site"));
  check("no source-code button when repoUrl is absent", !page.includes("Source code"));
  check("no Outcomes block when outcomes is empty", !page.includes(">Outcomes<"));

  console.log("\nRequired fields still render");
  check("title", page.includes("Fixture Real Project"));
  check("role", page.includes("Front-End Developer"));
  check("duration", page.includes("4 weeks"));
  check("team", page.includes("Solo"));
  check("stack", page.includes("Astro") && page.includes("TypeScript"));

  console.log("\nSchema rejects invalid frontmatter");
  // Prove the schema is load-bearing: a bad entry must fail the build, so Affan
  // gets an error rather than a silently broken card.
  writeFileSync(
    mdxPath,
    `---
title: "Fixture Invalid"
summary: "Missing required fields on purpose."
order: "not-a-number"
period: "2026"
---

Body.
`,
  );
  let buildFailed = false;
  let message = "";
  try {
    execFileSync("npx", ["astro", "build"], { cwd: root, stdio: "pipe", shell: true });
  } catch (err) {
    buildFailed = true;
    message = String(err.stdout ?? "") + String(err.stderr ?? "");
  }
  check("invalid frontmatter fails the build", buildFailed);
  check(
    "error names the offending field",
    /order|role|duration|team|stack/i.test(message),
    message.slice(0, 120).replace(/\s+/g, " "),
  );
} finally {
  cleanup();
  // Leave dist/ consistent with the committed content.
  execFileSync("npx", ["astro", "build"], { cwd: root, stdio: "pipe", shell: true });
  console.log("\nFixture removed, dist rebuilt from committed content.");
}

console.log(
  failures === 0 ? "\nAll content-path checks passed.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
