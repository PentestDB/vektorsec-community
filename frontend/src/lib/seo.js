/**
 * VektorSec — Central SEO configuration & metadata helpers.
 *
 * Single source of truth for titles, descriptions, keywords, Open Graph,
 * Twitter Cards, canonical URLs and JSON-LD structured data. The root layout
 * and every public page build their Next.js `metadata` from this module so the
 * whole site stays consistent and easy to index.
 *
 * All builders accept an optional `site` object so the values can be overridden
 * at runtime from Admin > SEO (see `./seoSettings.js` for the live provider).
 */

export const SITE = {
  name: "VektorSec",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://vektorsec.ai",
  /** Default home-page title (also the template suffix for sub-pages). */
  title: "VektorSec | Autonomous AI Pentest & Security Operations Platform",
  titleTemplate: "%s | VektorSec",
  description:
    "Next-Gen AI Pentest Platform. Autonomous AI Security Operations & Penetration Testing Agent integrated with Telegram Bot & Cloud Scanning Workers.",
  keywords: [
    "AI Pentest",
    "Security Operations",
    "Penetration Testing Agent",
    "Vulnerability Scanner",
    "Telegram Bot Pentest",
    "ตรวจเช็กช่องโหว่",
    "ตรวจสอบความปลอดภัยไซเบอร์",
  ],
  twitterHandle: "@VektorSec",
  ogImage: "/opengraph-image.jpg?v=2",
  ogImageAlt: "VektorSec AI Pentest Dashboard",
  locale: "en_US",
};

/** Normalise a partial runtime site config against the static defaults. */
export function normalizeSite(overrides = {}) {
  return { ...SITE, ...overrides };
}

/** Trim trailing slashes so canonical/OG URLs stay predictable. */
export function siteUrl(path = "/", base = SITE.url) {
  const cleanBase = String(base || SITE.url).replace(/\/+$/, "");
  const cleanPath = `/${String(path).replace(/^\/+/, "")}`;
  return `${cleanBase}${cleanPath === "/" ? "/" : cleanPath.replace(/\/+$/, "")}`;
}

/**
 * Next.js metadata object shared by the root layout (home page default).
 * Sub-pages should spread `baseMetadata()` and override `title`/`description`/
 * `alternates.canonical`/`openGraph.url` with their own values.
 */
export function baseMetadata(site = SITE) {
  const url = site.url;
  return {
    metadataBase: new URL(url),
    title: { default: site.title, template: site.titleTemplate },
    description: site.description,
    keywords: [...site.keywords],
    applicationName: site.name,
    authors: [{ name: site.name, url }],
    creator: site.name,
    publisher: site.name,
    alternates: { canonical: siteUrl("/", url) },
    openGraph: {
      type: "website",
      locale: site.locale,
      siteName: site.name,
      url: siteUrl("/", url),
      title: site.title,
      description: site.description,
      images: [
        {
          url: `${url}${site.ogImage}`,
          width: 1898,
          height: 873,
          alt: site.ogImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: site.title,
      description: site.description,
      creator: site.twitterHandle,
      images: [`${url}${site.ogImage}`],
    },
    icons: { icon: "/favicon.ico" },
  };
}

/**
 * Convenience wrapper for public sub-pages. Returns page-level overrides that
 * merge on top of the root layout's (possibly runtime-served) base metadata:
 * title, description, canonical URL and the matching OG/Twitter fields.
 */
export function pageMetadata({ title, description = "", path = "/", site = SITE, ...rest } = {}) {
  const absolutePath = siteUrl(path, site.url);
  const pageTitle = title ? `${title} | ${site.name}` : undefined;

  const meta = {
    ...rest,
  };
  if (pageTitle) meta.title = { absolute: pageTitle };
  if (description) meta.description = description;
  meta.alternates = { canonical: absolutePath };
  meta.openGraph = { url: absolutePath };
  if (pageTitle) meta.openGraph.title = pageTitle;
  if (description) meta.openGraph.description = description;
  meta.twitter = {};
  if (pageTitle) meta.twitter.title = pageTitle;
  if (description) meta.twitter.description = description;
  return meta;
}

// ─── JSON-LD (Schema.org structured data) ─────────────────────────────

export function organizationJsonLd(site = SITE) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: `${site.url}${site.ogImage}`,
    sameAs: ["https://github.com/PentestDB"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@vektorsec.ai",
      contactType: "customer support",
      availableLanguage: ["English", "ไทย"],
    },
  };
}

export function softwareApplicationJsonLd(site = SITE) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    url: site.url,
    applicationCategory: "SecurityApplication",
    operatingSystem: "Web",
    description: site.description,
    image: `${site.url}${site.ogImage}`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Pay-as-you-go AI penetration testing platform",
    },
    featureList: [
      "Autonomous AI penetration testing agent",
      "AI security operations & vulnerability scanning",
      "Telegram bot integration",
      "Cloud scanning workers",
    ],
    keywords: site.keywords.join(", "),
  };
}

export function webSiteJsonLd(site = SITE) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    description: site.description,
    inLanguage: ["en", "th"],
    publisher: organizationJsonLd(site),
  };
}

