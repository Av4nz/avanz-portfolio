/**
 * Screenshots the local preview server across viewports and themes.
 *
 *   npm run preview      (in one terminal)
 *   npm run shots        (in another)
 *
 * Output goes to .screenshots/ which is gitignored.
 *
 * Uses CDP Emulation.setDeviceMetricsOverride rather than Chrome's
 * --window-size + --screenshot flags. On Windows the browser window has a
 * minimum width (around 500px), so narrow --window-size values do not shrink
 * the layout viewport: they render wide and crop, which looks exactly like a
 * horizontal-overflow bug that is not really there.
 *
 * Reduced motion is emulated so scroll-reveal content is captured; the
 * IntersectionObserver would otherwise leave .reveal elements at opacity 0.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { launchBrowser, goto } from "./lib/browser.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".screenshots");
const BASE = process.env.BASE_URL ?? "http://localhost:4321";

const shots = [
  { name: "home-desktop-light", url: "/", w: 1440, h: 900, theme: "light" },
  { name: "home-desktop-dark", url: "/", w: 1440, h: 900, theme: "dark" },
  { name: "home-tablet", url: "/", w: 768, h: 1024, theme: "light" },
  { name: "home-mobile", url: "/", w: 390, h: 844, theme: "light" },
  { name: "home-mobile-dark", url: "/", w: 390, h: 844, theme: "dark" },
  { name: "home-mobile-narrow", url: "/", w: 320, h: 800, theme: "light" },
  { name: "case-desktop", url: "/work/placeholder-one-dashboard/", w: 1440, h: 900, theme: "light" },
  { name: "case-mobile", url: "/work/placeholder-one-dashboard/", w: 390, h: 844, theme: "dark" },
  { name: "notfound", url: "/404", w: 1440, h: 900, theme: "light" },
];

const { chromePath, call, close } = await launchBrowser({
  port: 9335,
  profile: "avanz-shots-profile",
});
console.log("browser:", chromePath);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

try {
  for (const shot of shots) {
    // Seed the theme before page scripts run so there is no post-load flip.
    const { identifier } = await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("theme", ${JSON.stringify(shot.theme)}); } catch (e) {}`,
    });

    await call("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });

    await goto(call, BASE + shot.url, { width: shot.w, height: shot.h });

    // Reveal everything: a single headless paint never triggers the observer.
    await call("Runtime.evaluate", {
      expression: `document.querySelectorAll(".reveal").forEach((e) => e.classList.add("is-visible")); true`,
      returnByValue: true,
    });
    await sleep(200);

    const { data } = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true,
    });
    writeFileSync(join(outDir, `${shot.name}.png`), Buffer.from(data, "base64"));

    const { result: dims } = await call("Runtime.evaluate", {
      expression: `document.documentElement.clientWidth + "/" + document.documentElement.scrollWidth`,
      returnByValue: true,
    });
    const [client, scroll] = dims.value.split("/").map(Number);
    const overflow = scroll > client ? "  OVERFLOW" : "";
    console.log(
      `wrote ${shot.name.padEnd(20)} viewport=${String(shot.w).padStart(4)}  client/scroll=${client}/${scroll}${overflow}`,
    );

    await call("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  }
} finally {
  close();
}

process.exit(0);
