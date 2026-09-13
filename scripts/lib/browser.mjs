/**
 * Shared Chrome/Chromium discovery and a minimal CDP client.
 *
 *   import { launchBrowser } from "./lib/browser.mjs";
 *
 * Extracted because audit.mjs and screenshots.mjs each had their own copy of
 * the launch logic, hardcoded to Windows install paths. That works on one
 * machine and fails everywhere else, including CI and any future Mac or Linux
 * checkout.
 *
 * Resolution order:
 *   1. CHROME_PATH, so CI can point at whatever it installed
 *   2. Puppeteer's bundled Chrome, if the package happens to be present
 *   3. Platform-conventional install locations
 *   4. Whatever is on PATH
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CANDIDATES = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ],
};

const onPath = (name) => {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(cmd, [name], { encoding: "utf8", stdio: "pipe" });
    const first = out.split(/\r?\n/).find(Boolean);
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
};

/** Absolute path to a usable Chrome/Chromium, or null. */
export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  for (const p of CANDIDATES[process.platform] ?? []) {
    if (existsSync(p)) return p;
  }
  for (const name of ["google-chrome", "chromium", "chrome", "msedge"]) {
    const found = onPath(name);
    if (found) return found;
  }
  return null;
}

/**
 * Launch headless Chrome and attach a CDP session to one blank tab.
 * Returns { call, evaluate, close } where `call` issues raw CDP commands.
 */
export async function launchBrowser({ port = 9222, profile = "cdp-profile" } = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "No Chrome or Chromium found. Install Chrome, or set CHROME_PATH to its executable.",
    );
  }

  const proc = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${join(tmpdir(), profile)}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      const json = await res.json();
      if (json.webSocketDebuggerUrl) {
        wsUrl = json.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(250);
  }
  if (!wsUrl) {
    proc.kill();
    throw new Error(`Chrome DevTools endpoint never became ready on port ${port}`);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let msgId = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call("Page.enable");
  await call("Runtime.enable");

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.text + " " + (result?.description ?? ""));
    }
    return result.value;
  };

  const close = () => {
    try {
      ws.close();
    } catch {}
    try {
      proc.kill();
    } catch {}
  };

  return { chromePath: chrome, call, evaluate, close };
}

/**
 * Navigate and wait until the page is genuinely measurable.
 *
 * Waiting for `readyState === "complete"` and fonts is not enough. The Astro
 * dev server compiles CSS on demand, so the first request after a cold start
 * can finish loading before the stylesheet is applied. Measurements taken in
 * that window are wrong in ways that look like real bugs: no focus ring, a
 * skip link still 1x1, reveal elements stuck at opacity 0.
 *
 * So this also waits for a sentinel: a known token-driven style must actually
 * be in effect before the caller measures anything.
 */
export async function goto(call, url, { width = 1440, height = 900 } = {}) {
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await call("Page.navigate", { url });

  for (let i = 0; i < 80; i++) {
    const { result } = await call("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.value === "complete") break;
    await sleep(100);
  }

  // Stylesheets applied? body must have the token background, not the UA default.
  for (let i = 0; i < 60; i++) {
    const { result } = await call("Runtime.evaluate", {
      expression: `(() => {
        const bg = getComputedStyle(document.body).backgroundColor;
        const styled = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
        const sheets = document.styleSheets.length > 0;
        return styled && sheets;
      })()`,
      returnByValue: true,
    });
    if (result.value === true) break;
    await sleep(100);
  }

  await call("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => true)",
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(150);
}
