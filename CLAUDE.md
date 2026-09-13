# Working in this repository

Personal portfolio for Affan Arfani Arifin (AvanZ). Astro 7 + Tailwind 4 + MDX,
static output, zero client JavaScript by design.

## Before you claim something works

This project has real checks. Run them; do not assume.

```bash
npm test           # everything: build, content paths, structure, runtime a11y
```

`npm test` starts and stops its own preview server. The individual suites are
`npm run build`, `npm run test:content`, `npm run verify` and `npm run audit`;
the last two need a server already running.

`npm run audit` covers what static analysis cannot: horizontal overflow at four
widths, per-node WCAG AA contrast in both themes, 24px tap targets, heading
order, focus rings, reduced-motion behaviour and the theme toggle.

`npm run test:content` builds a throwaway case study with a cover image and
`draft: false`, because no committed placeholder exercises those branches.

If you add a user-visible guarantee, add the check that proves it. If you fix a
bug, first confirm the check fails without the fix.

## Hard constraints

- **Zero client JS.** `verify` enforces an 8 KB ceiling; the site currently
  ships 0 bytes. Adding a framework island breaks the core value proposition.
- **WCAG AA on all text**, both themes. Colour tokens are OKLCH and were solved
  with `scripts/solve-contrast.mjs`, not eyeballed. Re-run it if you touch the
  palette, and use `--accent-text` (not `--accent`) whenever the accent carries
  text.
- **No dead links.** `verify` allows no exemptions. Optional assets are handled
  by not rendering the link, see `src/lib/assets.ts`.
- **English only.** The site is written in English.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/data/site.ts` | All personal data. Single source of truth. |
| `src/content/work/*.mdx` | Case studies. Schema in `src/content.config.ts`. |
| `src/styles/global.css` | Design tokens. Change the accent here. |
| `src/lib/assets.ts` | Build-time detection of optional files. |
| `scripts/` | Generators and checkers, each documented at the top. |

## Gotchas discovered the hard way

- **`import.meta.url` is unreliable in `src/lib/`.** Vite bundles those modules
  into `dist/.prerender/chunks/`, so relative paths resolve inside `dist`. Use
  `process.cwd()`, which Astro anchors to the project root.
- **Chrome's `--window-size` will not go below ~500px on Windows.** Narrow
  values render wide and crop, which looks exactly like a horizontal-overflow
  bug. Use CDP `Emulation.setDeviceMetricsOverride`, as `scripts/screenshots.mjs`
  does.
- **`getComputedStyle` returns `oklch(...)`.** Parsing numbers out of that
  string yields nonsense. Resolve colours through a canvas, as the contrast
  probe in `scripts/audit.mjs` does.
- **The theme is stored in `localStorage`.** Emulating `prefers-color-scheme`
  alone will not switch it; seed storage before navigation.
- **wawoff2 shares one WASM heap.** Decompress fonts sequentially, never with
  `Promise.all`, or the outputs corrupt each other.

## Documentation

Astro docs: https://docs.astro.build
