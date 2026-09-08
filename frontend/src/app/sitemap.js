import { siteUrl } from "@/lib/seo";
import { getSeoSite } from "@/lib/seoSettings";

/**
 * sitemap.xml — generated dynamically at /sitemap.xml.
 *
 * Lists every public marketing route plus published blog posts fetched from
 * the backend, plus any extra routes configured in Admin > SEO. Falls back to
 * the default public routes when the backend is unavailable.
 */

const STATIC_ROUTES = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/register", priority: 0.8, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { path: "/login", priority: 0.5, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.7, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const site = await getSeoSite();
  if (site.sitemapEnabled === false) return [];

  const base = site.url.replace(/\/+$/, "");
  const entries = STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: siteUrl(path, base),
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));

  // Extra routes configured in Admin > SEO (one path per line / comma-separated).
  const extraRoutes = (site.sitemapExtraRoutes || "")
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.startsWith("/"));
  for (const path of extraRoutes) {
    entries.push({
      url: siteUrl(path, base),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  // Dynamic blog post URLs from the backend's public blog API.
  try {
    const backend = process.env.BACKEND_URI || "http://localhost:8081";
    const res = await fetch(`${backend}/api/blog`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const articles = Array.isArray(data.articles) ? data.articles : [];
      for (const article of articles) {
        if (!article || typeof article.slug !== "string" || !article.slug) continue;
        entries.push({
          url: siteUrl(`/blog/${article.slug}`, base),
          lastModified: article.updatedAt ? new Date(article.updatedAt) : new Date(),
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // Backend unreachable — keep the static public routes only.
  }

  return entries;
}
