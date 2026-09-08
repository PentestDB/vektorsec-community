/**
 * Live SEO / security configuration provider (SERVER-ONLY).
 *
 * The values are managed by the operator in Admin > SEO and stored in the
 * backend .env. This module fetches them from the backend's public endpoint
 * (`GET /api/public/seo`) and merges them over the static defaults in `seo.js`.
 *
 * A short in-process cache (60s) keeps page rendering fast while still letting
 * admin changes propagate within a minute without a redeploy.
 *
 * ⚠ This file must never be imported from a client component.
 */
import { SITE, normalizeSite } from "./seo";

let cache = null;
let cachedAt = 0;
const TTL_MS = 60_000;

function backendUrl() {
  return process.env.BACKEND_URI || "http://localhost:8081";
}

/** Raw SEO settings from the backend (may be partial). */
export async function getSeoSettings() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  try {
    const res = await fetch(`${backendUrl()}/api/public/seo`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      cache = data?.seo || {};
      cachedAt = Date.now();
      return cache;
    }
  } catch {
    // Backend unreachable — fall back to defaults below.
  }
  cache = {};
  cachedAt = Date.now();
  return cache;
}

/**
 * Fully normalised site config (defaults + backend overrides). Prefer this in
 * metadata builders, robots.txt and sitemap.xml.
 */
export async function getSeoSite() {
  const raw = await getSeoSettings();

  let keywords = SITE.keywords;
  if (typeof raw.keywords === "string" && raw.keywords.trim()) {
    keywords = raw.keywords
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  return normalizeSite({
    title: raw.title || SITE.title,
    description: raw.description || SITE.description,
    url: raw.siteUrl || SITE.url,
    ogImage: raw.ogImage || SITE.ogImage,
    twitterHandle: raw.twitterHandle || SITE.twitterHandle,
    keywords,
    // Admin toggles (default on unless explicitly disabled).
    indexing: raw.indexing !== false,
    sitemapEnabled: raw.sitemapEnabled !== false,
    robotsExtraDisallow: raw.robotsExtraDisallow || "",
    sitemapExtraRoutes: raw.sitemapExtraRoutes || "",
  });
}
