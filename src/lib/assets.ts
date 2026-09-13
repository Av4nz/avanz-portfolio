/**
 * Build-time feature detection for optional assets.
 *
 * The CV is a file the owner drops in later. Rather than shipping a link that
 * 404s until then, components ask this module whether the asset exists and
 * omit the link if it does not. This runs at build time only, so there is no
 * runtime cost and no client JavaScript.
 *
 * Path resolution note: do NOT use `import.meta.url` here. Vite bundles this
 * module into dist/.prerender/chunks/, so import.meta.url points inside dist
 * and walking up two levels lands on dist/ rather than the project root.
 * Astro always runs the build from the project root, so cwd is the reliable
 * anchor.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();

/** True when public/cv.pdf is present, so CV links can be rendered. */
export const hasCV = existsSync(resolve(projectRoot, "public/cv.pdf"));
