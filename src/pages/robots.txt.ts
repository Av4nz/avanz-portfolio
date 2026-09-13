import type { APIRoute } from "astro";
import { site } from "../data/site";

/**
 * Generates /robots.txt at build time.
 *
 * This used to be a static file in public/ with the domain written out by hand,
 * which meant the domain lived in two places. Changing `url` in site.ts would
 * silently leave robots.txt advertising a sitemap on the old host. Now there is
 * one source of truth.
 */
export const GET: APIRoute = ({ site: astroSite }) => {
  const origin = (astroSite ?? new URL(site.url)).origin;

  const body = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap-index.xml
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
