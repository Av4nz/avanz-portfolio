import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * CASE STUDY SCHEMA
 * -----------------
 * This is also your content checklist. Astro validates every field at build
 * time, so a missing or malformed entry fails the build instead of silently
 * shipping a broken card.
 */
const work = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/work" }),
  schema: ({ image }) =>
    z.object({
      /** Project name. */
      title: z.string(),

      /** One sentence: what it is and who it is for. Shown on the card. */
      summary: z.string(),

      /** Sort order on the landing page. Lower numbers appear first. */
      order: z.number(),

      /** Show on the landing page? Set false to keep a written-but-unpublished draft. */
      featured: z.boolean().default(true),

      /** e.g. "2026" or "2025 — 2026". */
      period: z.string(),

      /** Your actual role. Be honest about solo vs. team. */
      role: z.string(),

      /** "6 weeks", "3 months", ... */
      duration: z.string(),

      /** Solo, or team size and who did what. */
      team: z.string(),

      /** Technologies used. Keep to the ones that matter; 3-6 is ideal. */
      stack: z.array(z.string()).min(1),

      /** Live deployment. Omit if there is nothing public. */
      liveUrl: z.string().url().optional(),

      /** Source code. Omit if the repository is private. */
      repoUrl: z.string().url().optional(),

      /**
       * Headline outcomes. Numbers beat adjectives:
       * "Lighthouse 72 -> 98" is worth more than "improved performance".
       */
      outcomes: z.array(z.string()).default([]),

      /** Cover image, 16:9, placed next to the .mdx file. Optional for now. */
      cover: image().optional(),
      coverAlt: z.string().optional(),

      /** Marks placeholder entries so they can be visually flagged. */
      draft: z.boolean().default(false),
    }),
});

export const collections = { work };
