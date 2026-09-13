/**
 * Screenshots the local preview server across viewports and themes.
 *
 *   npm run preview      (in one terminal)
 *   npm run shots        (in another)
 *
 * Output goes to .screenshots/ which is gitignored.
 *
 * Reduced motion is forced so scroll-reveal content is captured: the
 * IntersectionObserver never fires in a headless single-paint render, and
 * .reveal elements would otherwise screenshot at opacity 0.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".screenshots");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));

if (!CHROME) {
  console.error("No Chrome or Edge found.");
  process.exit(1);
}

const base = process.env.BASE_URL ?? "http://localhost:4321";

const shots = [
  { name: "home-desktop-dark", url: "/", size: "1440,3200", scheme: "dark" },
  { name: "home-desktop-light", url: "/", size: "1440,3200", scheme: "light" },
  { name: "home-tablet", url: "/", size: "834,2600", scheme: "light" },
  { name: "home-mobile", url: "/", size: "390,2600", scheme: "light" },
  { name: "home-mobile-narrow", url: "/", size: "320,2600", scheme: "light" },
  { name: "case-desktop", url: "/work/placeholder-one-dashboard/", size: "1440,2600", scheme: "light" },
  { name: "case-mobile", url: "/work/placeholder-one-dashboard/", size: "390,2600", scheme: "dark" },
  { name: "notfound", url: "/404", size: "1440,900", scheme: "light" },
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const shot of shots) {
  const out = join(outDir, `${shot.name}.png`);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--force-prefers-reduced-motion",
      `--force-color-profile=srgb`,
      `--blink-settings=preferredColorScheme=${shot.scheme === "dark" ? 1 : 2}`,
      `--window-size=${shot.size}`,
      `--screenshot=${out}`,
      "--virtual-time-budget=5000",
      base + shot.url,
    ],
    { stdio: "ignore" },
  );
  console.log("wrote", shot.name);
}
