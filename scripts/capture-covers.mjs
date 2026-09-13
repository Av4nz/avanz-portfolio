/**
 * Captures cover images for case studies from their live sites.
 *
 *   node scripts/capture-covers.mjs
 *
 * Writes 16:9 screenshots next to the .mdx file that references them. Only
 * needed when a project's live site changes; the images are committed.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import sharp from "sharp";
import { launchBrowser, goto } from "./lib/browser.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src/content/work");
mkdirSync(outDir, { recursive: true });

const targets = [
  {
    slug: "ricepredict",
    url: "https://diy-rice-prediction.vercel.app/",
    // Let charts finish drawing before capturing.
    settle: 3500,
  },
  {
    slug: "padukuhan-manukan",
    url: "https://padukuhan-manukan.netlify.app/",
    settle: 3000,
  },
];

const { chromePath, call, close } = await launchBrowser({
  port: 9340,
  profile: "avanz-covers",
});
console.log("browser:", chromePath);

try {
  for (const t of targets) {
    // 1600x900 is exactly 16:9, matching the aspect ratio the cards expect.
    await goto(call, t.url, { width: 1600, height: 900 });
    await sleep(t.settle);

    // Hide anything that would date the screenshot or look like clutter.
    await call("Runtime.evaluate", {
      expression: `
        document.querySelectorAll('[class*="cookie"],[id*="cookie"],[class*="banner"]')
          .forEach((e) => e.remove());
        window.scrollTo(0, 0);
        true;
      `,
      returnByValue: true,
    });
    await sleep(400);

    const { data } = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    });

    const out = join(outDir, `${t.slug}-cover.png`);
    // Re-encode through sharp: crops to an exact 16:9 and compresses hard,
    // since these ship to every visitor of the landing page.
    await sharp(Buffer.from(data, "base64"))
      .resize(1600, 900, { fit: "cover", position: "top" })
      .png({ compressionLevel: 9, quality: 90 })
      .toFile(out);

    console.log(`captured ${t.slug} from ${t.url}`);
  }
} finally {
  close();
}

process.exit(0);
