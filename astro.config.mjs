// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import { site } from './src/data/site';

// https://astro.build/config
export default defineConfig({
  // Required for canonical URLs and sitemap generation.
  // TODO: update `url` in src/data/site.ts once you have a real domain.
  site: site.url,

  // Emits /work/slug/index.html so URLs stay clean and portable across hosts.
  build: {
    format: 'directory',
  },

  markdown: {
    shikiConfig: {
      // Astro defaults to github-dark, which renders light-grey text on a dark
      // block in both themes. That fails contrast against the light background
      // and looks foreign in a near-monochrome design. These two themes swap
      // automatically with the site theme.
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      // Long lines in a code block are a horizontal-overflow bug on a 320px
      // phone. Wrapping is the right default for prose-embedded snippets.
      wrap: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [mdx(), sitemap()],
});
