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
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

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

const BASE = process.env.BASE_URL ?? "http://localhost:4321";
const PORT = 9335;

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

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + (process.env.TEMP ?? ".") + "\\jcode-shots-profile",
    "about:blank",
  ],
  { stdio: "ignore" },
);
process.on("exit", () => {
  try {
    chrome.kill();
  } catch {}
});

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint never became ready");
}

const ws = new WebSocket(await wsUrl());
await new Promise((r, j) => {
  ws.addEventListener("open", r, { once: true });
  ws.addEventListener("error", j, { once: true });
});

let msgId = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve: res, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);

await call("Page.enable");
await call("Runtime.enable");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const shot of shots) {
  // Seed the theme before page scripts run so there is no post-load flip.
  const { identifier } = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("theme", ${JSON.stringify(shot.theme)}); } catch (e) {}`,
  });

  await call("Emulation.setDeviceMetricsOverride", {
    width: shot.w,
    height: shot.h,
    deviceScaleFactor: 1,
    mobile: shot.w < 700,
  });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  await call("Page.navigate", { url: BASE + shot.url });
  for (let i = 0; i < 80; i++) {
    const { result } = await call("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.value === "complete") break;
    await sleep(100);
  }
  await call("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => true)",
    awaitPromise: true,
    returnByValue: true,
  });
  // Reveal everything, since a single paint never triggers the observer.
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
    expression: `document.documentElement.clientWidth + "x" + document.documentElement.scrollWidth`,
    returnByValue: true,
  });
  console.log(`wrote ${shot.name.padEnd(20)} viewport=${shot.w}  client/scroll=${dims.value}`);

  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

chrome.kill();
process.exit(0);
