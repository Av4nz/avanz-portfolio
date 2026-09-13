# AvanZ Portfolio

Personal portfolio for **Affan Arfani Arifin** (AvanZ), Front-End Developer.

Built with [Astro](https://astro.build), [Tailwind CSS v4](https://tailwindcss.com)
and MDX content collections. Ships **0 KB of JavaScript** on the initial load.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
```

| Script | What it does |
| --- | --- |
| `npm test` | **Runs everything.** Build, content tests, structure, runtime a11y. Starts and stops its own preview server. |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built site locally |
| `npm run check` | TypeScript + Astro diagnostics only |
| `npm run verify` | Structural checks on `dist/` (links, meta tags, perf budgets) |
| `npm run audit` | Runtime checks in headless Chrome (overflow, contrast, tap targets) |
| `npm run test:content` | Builds a throwaway case study to exercise cover images and published state |
| `npm run shots` | Screenshots to `.screenshots/` across viewports and themes |
| `npm run og` | Regenerate `public/og.png` (the social share image) |
| `npm run icons` | Regenerate `favicon.ico` and `apple-touch-icon.png` from `favicon.svg` |

**In normal use you only need `npm run dev` while writing and `npm test` before
pushing.** The individual scripts are there for when something fails and you
want to re-run just that part.

`verify` and `audit` on their own expect a preview server; `npm test` handles
that for you:

```bash
npm test             # one command, no server juggling
```

---

## Where to edit things

```
src/
  data/site.ts             ← ALL your personal details live here
  content/work/*.mdx       ← one file per case study
  content.config.ts        ← case-study schema (the content checklist)
  components/              ← Hero, WorkCard, About, Contact, Header, Footer
  layouts/Layout.astro     ← <head>, SEO, JSON-LD, theme script
  lib/assets.ts            ← build-time detection of optional files (the CV)
  pages/
    index.astro            ← landing page section order
    work/[slug].astro      ← case-study template
    404.astro
  styles/global.css        ← design tokens (colour, type, spacing)
public/
  cv.pdf                   ← ADD THIS: your actual CV
  favicon.svg              ← edit this, then run `npm run icons`
  og.png                   ← generated, do not edit by hand
```

**Rule of thumb:** to change text, edit `src/data/site.ts` or an `.mdx` file.
To change looks, edit `src/styles/global.css`. Components rarely need touching.

---

## Your to-do list

Everything below is placeholder content. Search the project for `TODO:` to find
each one.

### 1. Personal details, in `src/data/site.ts`

- [ ] `email` — real address
- [ ] `socials` — real GitHub and LinkedIn URLs
- [ ] `url` — your domain, once you buy one
- [ ] `experience` — internship company, university, real descriptions
- [ ] `bio` — rewrite in your own voice
- [ ] `skillGroups` — remove anything you would not want to be interviewed on

### 2. Add your CV

Drop the file at `public/cv.pdf`.

Until you do, the CV links are **not rendered at all**, so there is no broken
link on the live site. The moment the file exists, the header "CV" link appears
and the hero's secondary button switches from "Get in touch" to "Download CV".
No code change needed, just rebuild. `npm run verify` checks both directions.

### 3. Replace the three case studies

Delete the files in `src/content/work/` and write your own. For each project you
need the frontmatter below, and the schema in `src/content.config.ts` will fail
the build if anything is missing or malformed.

| Field | Meaning | Example |
| --- | --- | --- |
| `title` | Project name | `Rasa Nusantara Ordering App` |
| `summary` | One sentence: what and for whom | Shown on the landing page |
| `order` | Sort order, lower first | `1` |
| `featured` | Show on the landing page | `true` |
| `period` | Year or range | `2025 — 2026` |
| `role` | Your actual role | `Front-End Developer` |
| `duration` | How long it took | `6 weeks` |
| `team` | Solo, or who did what | `Solo` / `2 devs + 1 designer` |
| `stack` | 3-6 key technologies | `["React", "TypeScript"]` |
| `liveUrl` | Live site (optional) | Omit if nothing is public |
| `repoUrl` | Source code (optional) | Omit if private |
| `outcomes` | Measurable results | `"LCP 4.1s → 1.3s on 3G"` |
| `cover` | 16:9 image beside the `.mdx` (optional) | |
| `draft` | `true` flags it as a placeholder | Set `false` when real |

The body then follows a fixed structure. It is the difference between a gallery
and an engineering portfolio:

1. **Context** — what, who for, when
2. **The problem** — what was broken before
3. **My role** — what you personally owned
4. **Technical decisions** — *the section reviewers actually read*. For each
   choice, name the alternative you rejected and why
5. **The hardest problem** — one real bug, including the dead end
6. **Outcome** — numbers if you have them
7. **What I would do differently** — one honest limitation

> Numbers beat adjectives. "Lighthouse 72 → 98" is worth more than
> "improved performance". If you have no numbers, say so honestly and describe
> the qualitative change.

### 4. Regenerate the OG image

After changing your name or tagline, update the constants at the top of
`scripts/generate-og.mjs` and run `npm run og`.

---

## Design system

Swiss-minimal: near-monochrome, one accent, typography doing the work.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | near-white | near-black |
| `--fg` / `--fg-muted` / `--fg-subtle` | text hierarchy | |
| `--accent` | Signal Vermilion | brighter vermilion |
| `--accent-text` | AA-safe accent for text | |

**Changing the accent colour** is a two-line edit in `src/styles/global.css`.
Alternative presets (ochre, deep teal, chartreuse) are in a comment there.

Colours are OKLCH and were **solved, not guessed**: `scripts/solve-contrast.mjs`
computes the lightness each token needs to clear WCAG AA against the tightest
background it appears on. Re-run it if you change the palette.

Type: Inter Tight (headings), Inter (body), JetBrains Mono (labels). Self-hosted,
Latin subset only, three woff2 files total.

---

## Quality gates

The site currently passes, with checks enforced by `npm run verify` and
`npm run audit`:

- 0 KB client JS, ~30 KB CSS, 3 font files
- No horizontal overflow at 320 / 390 / 768 / 1440 px
- WCAG AA contrast on every text node, in both themes
- 24px minimum tap targets
- One `<h1>` per page, no skipped heading levels
- Every internal link resolves, with no exemptions
- Visible focus ring on all 18 focusable elements
- Skip link is focusable, becomes visible, and its target exists
- Under `prefers-reduced-motion`, content is visible with transitions disabled
- Icons are yours, not the Astro scaffold's rocket
- English-only copy

Each claim above has a corresponding automated check, all of which run under
`npm test`. If you add a feature, add the check that proves it, and confirm the
check fails without the fix.

`npm run test:content` deserves a note: it writes a temporary case study with a
real cover image, `draft: false` and no optional URLs, builds it, asserts the
output, then deletes itself. Those branches are never exercised by the
placeholders, and the test caught a real bug on its first run (the tech stack
was missing from case-study pages).

---

## Deploying

The site is fully static, so any host works.

**Vercel or Cloudflare Pages:** push to GitHub, import the repo, accept the
detected defaults (build `npm run build`, output `dist`).

Before going live:

1. Set `url` in `src/data/site.ts` to your real domain
2. Update the `Sitemap:` line in `public/robots.txt`
3. Run `npm run og` so the share image matches
4. Run `npm test` one last time

---

## Learning Astro

If Astro is new to you, the mental model is small:

- A `.astro` file is HTML with an optional JavaScript block at the top, fenced
  by `---`. That block runs **at build time only**.
- `{expression}` interpolates a value into the markup, like JSX.
- Anything inside `<script>` runs in the browser, and only that ships to users.
- Components are just imported and used as tags. No hooks, no lifecycle.

That is roughly 90% of what this project uses.
