import { pageMetadata } from "@/lib/seo";
import { getSeoSite } from "@/lib/seoSettings";

/**
 * Server-side metadata for individual blog posts so Google indexes each
 * article with its own title/description/canonical URL. Falls back to a
 * generic title when the backend is unavailable.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  let title = "Blog Article";
  let description =
    "Article from the VektorSec blog — AI penetration testing, security operations and vulnerability research.";
  let updatedAt = new Date();

  try {
    const backend = process.env.BACKEND_URI || "http://localhost:8081";
    const res = await fetch(`${backend}/api/blog/${encodeURIComponent(String(slug))}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const article = data?.article;
      if (article) {
        if (article.title) title = article.title;
        if (article.description) description = article.description;
        if (article.updatedAt) updatedAt = new Date(article.updatedAt);
      }
    }
  } catch {
    // Backend unavailable — generic metadata below.
  }

  const site = await getSeoSite();
  return pageMetadata({
    title,
    description,
    path: `/blog/${String(slug)}`,
    site,
  });
}

export default function BlogDetailLayout({ children }) {
  return children;
}
