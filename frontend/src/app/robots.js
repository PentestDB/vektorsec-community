import { getSeoSite } from "@/lib/seoSettings";

/**
 * robots.txt — generated dynamically at /robots.txt so the rules configured in
 * Admin > SEO (extra disallowed paths) apply without a rebuild.
 *
 * Search engines may crawl normal public pages but must stay out of the
 * authenticated/API surfaces.
 */
const DEFAULT_DISALLOW = [
  "/admin",
  "/api",
  "/dashboard",
  "/session",
  "/workspace",
  "/checkout",
  "/topup",
  "/onboarding",
  "/no-access",
  "/_next/",
];

export const dynamic = "force-dynamic";

export default async function robots() {
  const site = await getSeoSite();
  const extra = (site.robotsExtraDisallow || "")
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.startsWith("/"));

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...DEFAULT_DISALLOW, ...extra],
      },
    ],
    sitemap: `${site.url.replace(/\/+$/, "")}/sitemap.xml`,
  };
}
