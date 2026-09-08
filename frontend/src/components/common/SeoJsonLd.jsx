import {
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";
import { getSeoSite } from "@/lib/seoSettings";

/**
 * Renders Schema.org (JSON-LD) structured data so Google can display VektorSec
 * with Rich Snippets in search results. Mounted in the root layout `<head>`.
 *
 * - Organization: identity + contact point (safe on every page).
 * - SoftwareApplication: app category, offers, feature list (home page focus).
 * - WebSite: site-level metadata + search action.
 *
 * Values come from Admin > SEO (via the backend public endpoint) and fall back
 * to the static defaults when the backend is unavailable.
 */
export default async function SeoJsonLd() {
  const site = await getSeoSite();

  const schemas = [
    organizationJsonLd(site),
    softwareApplicationJsonLd(site),
    webSiteJsonLd(site),
  ];

  return schemas.map((schema, index) => (
    <script
      key={index}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  ));
}
