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

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [mdx(), sitemap()],
});
