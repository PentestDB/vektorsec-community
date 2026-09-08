import { Request, Response } from "express";
import { readEnvFile } from "../utils/envWriter";

/**
 * Public SEO / security configuration consumed by the frontend at runtime
 * (root layout metadata, JSON-LD, robots.txt, sitemap.xml). Values are stored
 * in the backend .env via the Admin > SEO page and served here without auth so
 * the Next.js server can read them on every request.
 */
export const getPublicSeo = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    return res.status(200).json({
      seo: {
        title: env.SEO_TITLE || "",
        description: env.SEO_DESCRIPTION || "",
        keywords: env.SEO_KEYWORDS || "",
        siteUrl: env.SEO_SITE_URL || "",
        ogImage: env.SEO_OG_IMAGE || "",
        twitterHandle: env.SEO_TWITTER_HANDLE || "",
        indexing: env.SEO_INDEXING !== "0",
        sitemapEnabled: env.SEO_SITEMAP_ENABLED !== "0",
        robotsExtraDisallow: env.SEO_ROBOTS_EXTRA_DISALLOW || "",
        sitemapExtraRoutes: env.SEO_SITEMAP_EXTRA_ROUTES || "",
      },
    });
  } catch (error) {
    console.error("[public] getPublicSeo error:", error);
    return res.status(500).json({ message: "Failed to load public SEO config" });
  }
};
