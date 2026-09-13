/**
 * Headless audit over the Chrome DevTools Protocol.
 *
 *   npm run preview   (in one terminal)
 *   npm run audit     (in another)
 *
 * Uses Node 22's built-in WebSocket, so there is no Puppeteer/Playwright
 * dependency. Checks the things a static HTML scan cannot see: horizontal
 * overflow, computed contrast, tap target sizes, and heading order.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

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
const PORT = 9333;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + (process.env.TEMP ?? ".") + "\\jcode-audit-profile",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const cleanup = () => {
  try {
    chrome.kill();
  } catch {}
};
process.on("exit", cleanup);

/** Wait for the DevTools endpoint to come up. */
async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint never became ready");
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => {
  ws.addEventListener("open", r, { once: true });
  ws.addEventListener("error", j, { once: true });
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

// One tab, reused for every viewport.
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);

await call("Page.enable");
await call("Runtime.enable");
await call("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});

async function goto(url, width, height) {
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await call("Page.navigate", { url });
  // Wait for load, then let fonts settle.
  for (let i = 0; i < 80; i++) {
    const { result } = await call("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.value === "complete") break;
    await sleep(100);
  }
  await call("Runtime.evaluate", {
    expression: "document.fonts.ready.then(()=>true)",
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(150);
}

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text + " " + (result?.description ?? ""));
  return result.value;
};

let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ""}`);
  }
};

/** Injected into the page: finds elements wider than the viewport. */
const OVERFLOW_PROBE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.position === "fixed") continue;
    // Ignore elements intentionally clipped by an ancestor.
    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").slice(0, 70),
        text: (el.textContent || "").trim().slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }
  return {
    scrollWidth: de.scrollWidth,
    clientWidth: vw,
    offenders: offenders.slice(0, 6),
  };
})()`;

/**
 * Injected into the page: checks interactive elements meet a 24px minimum
 * (WCAG 2.2 SC 2.5.8). Visually-hidden elements such as the skip link are
 * exempt: they are not pointer targets until focused.
 */
const TAP_PROBE = `(() => {
  const isVisuallyHidden = (el) => {
    const cs = getComputedStyle(el);
    if (cs.clip === "rect(0px, 0px, 0px, 0px)") return true;
    if (cs.clipPath === "inset(50%)") return true;
    const r = el.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1;
  };
  const small = [];
  for (const el of document.querySelectorAll("a, button")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).position === "fixed") continue;
    if (isVisuallyHidden(el)) continue;
    if (r.height < 24 || r.width < 24) {
      small.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 30),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return small.slice(0, 8);
})()`;

/**
 * Injected into the page: contrast ratio of text against its background.
 *
 * Colours are resolved through a canvas rather than parsed by regex, because
 * getComputedStyle returns modern colours as "oklch(0.18 0.006 265)" and
 * scraping the numbers out of that yields nonsense. Canvas fillStyle accepts
 * any CSS colour and hands back real sRGB bytes.
 */
const CONTRAST_PROBE = `(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });

  const toRGBA = (css) => {
    // getImageData returns unpremultiplied RGBA, so alpha comes straight from
    // the pixel. Parsing it out of the fillStyle string is unreliable because
    // Chrome echoes modern colours back as "oklch(...)" rather than "rgba(...)".
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };

  const over = (fg, bg) => {
    const a = fg[3];
    return [
      Math.round(fg[0] * a + bg[0] * (1 - a)),
      Math.round(fg[1] * a + bg[1] * (1 - a)),
      Math.round(fg[2] * a + bg[2] * (1 - a)),
      1,
    ];
  };

  const lum = (rgb) => {
    const [r, g, b] = rgb.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // Walk ancestors compositing background layers until fully opaque.
  const bgOf = (el) => {
    let acc = null;
    let n = el;
    while (n && n !== document.documentElement) {
      const c = toRGBA(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) acc = acc === null ? c : over(acc, c);
      if (acc && acc[3] >= 1) return acc;
      n = n.parentElement;
    }
    const root = toRGBA(getComputedStyle(document.documentElement).backgroundColor);
    const base = root[3] > 0 ? root : [255, 255, 255, 1];
    return acc === null ? base : over(acc, base);
  };

  const isVisuallyHidden = (el) => {
    const cs = getComputedStyle(el);
    if (cs.clip === "rect(0px, 0px, 0px, 0px)") return true;
    if (cs.clipPath === "inset(50%)") return true;
    if (cs.visibility === "hidden" || cs.display === "none") return true;
    const r = el.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1;
  };

  const out = [];
  const sel = "p, li, h1, h2, h3, h4, a, dd, dt, span, blockquote, strong, em";
  for (const el of document.querySelectorAll(sel)) {
    const text = (el.textContent || "").trim();
    if (!text) continue;
    // Only leaf-ish nodes, so text is not double counted through wrappers.
    if ([...el.children].some((c) => (c.textContent || "").trim())) continue;
    if (isVisuallyHidden(el)) continue;
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) < 0.95) continue;

    const fg = toRGBA(cs.color);
    const bg = bgOf(el);
    const composited = fg[3] < 1 ? over(fg, bg) : fg;

    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const cr = ratio(composited, bg);
    const min = large ? 3 : 4.5;
    if (cr < min) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").slice(0, 60),
        text: text.slice(0, 34),
        size: Math.round(size),
        fg: "rgb(" + composited.slice(0, 3).join(",") + ")",
        bg: "rgb(" + bg.slice(0, 3).join(",") + ")",
        ratio: +cr.toFixed(2),
        min,
      });
    }
  }
  return out.slice(0, 10);
})()`;

/** Injected into the page: heading levels must not skip. */
const HEADING_PROBE = `(() => {
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
    level: Number(h.tagName[1]),
    text: (h.textContent || "").trim().slice(0, 40),
  }));
  const skips = [];
  for (let i = 1; i < hs.length; i++) {
    if (hs[i].level - hs[i - 1].level > 1) skips.push(hs[i - 1].text + " -> " + hs[i].text);
  }
  return { count: hs.length, h1: hs.filter((h) => h.level === 1).length, skips };
})()`;

const pages = [
  { label: "home", url: "/" },
  { label: "case study", url: "/work/placeholder-one-dashboard/" },
  { label: "404", url: "/404" },
];

const viewports = [
  { label: "320", w: 320, h: 800 },
  { label: "390", w: 390, h: 844 },
  { label: "768", w: 768, h: 1024 },
  { label: "1440", w: 1440, h: 900 },
];

console.log("\n=== Horizontal overflow ===");
for (const page of pages) {
  for (const vp of viewports) {
    await goto(BASE + page.url, vp.w, vp.h);
    const r = await evaluate(OVERFLOW_PROBE);
    const ok = r.scrollWidth <= r.clientWidth + 1 && r.offenders.length === 0;
    const detail = ok
      ? ""
      : `scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}; ` +
        r.offenders.map((o) => `<${o.tag} class="${o.cls}" "${o.text}" right=${o.right}>`).join(" | ");
    check(`${page.label} @ ${vp.label}px`, ok, detail);
  }
}

console.log("\n=== Tap targets (min 24px) ===");
for (const page of pages) {
  await goto(BASE + page.url, 390, 844);
  const small = await evaluate(TAP_PROBE);
  check(
    `${page.label} @ 390px`,
    small.length === 0,
    small.map((s) => `${s.tag} "${s.text}" ${s.w}x${s.h}`).join(" | "),
  );
}

console.log("\n=== Text contrast (WCAG AA) ===");
for (const scheme of ["light", "dark"]) {
  // Seed the theme before any page script runs, so the document loads in the
  // target theme natively. Toggling the class after navigation races with the
  // navigation itself and can measure a half-swapped document.
  const { identifier } = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("theme", ${JSON.stringify(scheme)}); } catch (e) {}`,
  });

  for (const page of pages) {
    await goto(BASE + page.url, 1440, 900);
    const applied = await evaluate(
      `document.documentElement.classList.contains("dark") ? "dark" : "light"`,
    );
    check(`${page.label}: ${scheme} theme applied`, applied === scheme, `got ${applied}`);

    // Guard against measuring a document whose theme does not match: proves
    // the numbers below belong to the theme named in the label.
    const sample = await evaluate(
      `getComputedStyle(document.body).backgroundColor`,
    );
    const bad = await evaluate(CONTRAST_PROBE);
    check(
      `${page.label} (${scheme}, body bg ${sample})`,
      bad.length === 0,
      bad
        .map(
          (b) =>
            `<${b.tag} class="${b.cls}"> "${b.text}" ${b.size}px fg=${b.fg} bg=${b.bg} ${b.ratio}:1 < ${b.min}`,
        )
        .join("\n            "),
    );
  }

  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

console.log("\n=== Heading structure ===");
for (const page of pages) {
  await goto(BASE + page.url, 1440, 900);
  const h = await evaluate(HEADING_PROBE);
  check(`${page.label}: exactly one h1`, h.h1 === 1, `found ${h.h1}`);
  check(`${page.label}: no skipped levels`, h.skips.length === 0, h.skips.join(" | "));
}

console.log("\n=== Keyboard focus ===");
// The README promises visible focus rings. Tab through the first interactive
// elements and confirm each one paints an outline distinct from its resting
// state, which is what a keyboard user actually relies on.
await goto(BASE + "/", 1440, 900);
const focusReport = await evaluate(`(() => {
  const focusables = [...document.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && (r.width > 0 || el.className.includes("sr-only"));
  });

  const bad = [];
  let tested = 0;
  for (const el of focusables.slice(0, 25)) {
    el.blur();
    const before = getComputedStyle(el);
    const restingOutline = before.outlineStyle + " " + before.outlineWidth;
    const restingShadow = before.boxShadow;

    el.focus();
    const after = getComputedStyle(el);
    const focusOutline = after.outlineStyle + " " + after.outlineWidth;
    const focusShadow = after.boxShadow;

    tested++;
    const hasOutline = after.outlineStyle !== "none" && parseFloat(after.outlineWidth) > 0;
    const changed = restingOutline !== focusOutline || restingShadow !== focusShadow;
    if (!hasOutline && !changed) {
      bad.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 28),
        outline: focusOutline,
      });
    }
    el.blur();
  }
  return { tested, bad: bad.slice(0, 6) };
})()`);
check(
  `focus ring on all ${focusReport.tested} focusable elements`,
  focusReport.bad.length === 0,
  focusReport.bad.map((b) => `<${b.tag}> "${b.text}" outline=${b.outline}`).join(" | "),
);

// The skip link must be reachable and must leave the visually-hidden state.
const skipReport = await evaluate(`(() => {
  const link = document.querySelector('a[href="#main"]');
  if (!link) return { found: false };
  link.focus();
  const r = link.getBoundingClientRect();
  const target = document.querySelector("#main");
  return {
    found: true,
    focused: document.activeElement === link,
    width: Math.round(r.width),
    height: Math.round(r.height),
    targetExists: !!target,
  };
})()`);
check("skip link exists", skipReport.found === true);
check("skip link is focusable", skipReport.focused === true);
check(
  "skip link becomes visible on focus",
  skipReport.width > 40 && skipReport.height > 20,
  `${skipReport.width}x${skipReport.height}`,
);
check("skip link target #main exists", skipReport.targetExists === true);

console.log("\n=== Reduced motion ===");
// With prefers-reduced-motion: reduce, content must be visible immediately
// rather than waiting on a transition, and transitions must be neutralised.
await call("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await call("Page.navigate", { url: BASE + "/" });
await sleep(600);
const rmReport = await evaluate(`(() => {
  const els = [...document.querySelectorAll(".reveal")];
  const invisible = els.filter((e) => Number(getComputedStyle(e).opacity) < 0.9);
  const durations = els.slice(0, 5).map((e) => getComputedStyle(e).transitionDuration);
  return {
    total: els.length,
    invisible: invisible.length,
    durations,
    mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
})()`);
check("reduced-motion media query is active", rmReport.mediaMatches === true);
check(
  `all ${rmReport.total} reveal elements visible without animating`,
  rmReport.invisible === 0,
  `${rmReport.invisible} still transparent`,
);
check(
  "transitions neutralised under reduced motion",
  rmReport.durations.every((d) => parseFloat(d) <= 0.001),
  rmReport.durations.join(", "),
);
await call("Emulation.setEmulatedMedia", { features: [] });

console.log("\n=== Reveal animation ===");
// With JS enabled and motion allowed, .reveal must end up visible.
await call("Emulation.setEmulatedMedia", { features: [] });
await goto(BASE + "/", 1440, 900);
await evaluate(`window.scrollTo(0, document.body.scrollHeight); true`);
await sleep(1200);
const hidden = await evaluate(`(() => {
  const els = [...document.querySelectorAll(".reveal")];
  const stuck = els.filter((e) => {
    const r = e.getBoundingClientRect();
    const onScreen = r.top < innerHeight && r.bottom > 0;
    return onScreen && Number(getComputedStyle(e).opacity) < 0.9;
  });
  return { total: els.length, stuck: stuck.length };
})()`);
check(
  `reveal elements become visible (${hidden.total} total)`,
  hidden.stuck === 0,
  `${hidden.stuck} stuck at opacity 0`,
);

console.log("\n=== Theme toggle ===");
await goto(BASE + "/", 1440, 900);
const themeResult = await evaluate(`(async () => {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return { error: "toggle not found" };
  const before = document.documentElement.classList.contains("dark");
  btn.click();
  await new Promise((r) => setTimeout(r, 60));
  const after = document.documentElement.classList.contains("dark");
  const stored = localStorage.getItem("theme");
  const pressed = btn.getAttribute("aria-pressed");
  const visible = getComputedStyle(btn).display !== "none";
  return { before, after, stored, pressed, visible };
})()`);
check("toggle is visible", themeResult.visible === true);
check("toggle flips theme", themeResult.before !== themeResult.after);
check("choice persists to localStorage", themeResult.stored === (themeResult.after ? "dark" : "light"));
check("aria-pressed reflects state", themeResult.pressed === String(themeResult.after));

console.log(failures === 0 ? "\nAll runtime checks passed.\n" : `\n${failures} check(s) failed.\n`);
cleanup();
process.exit(failures === 0 ? 0 : 1);
