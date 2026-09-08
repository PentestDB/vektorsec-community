import ArticlesList from "@/components/pages/blog/ArticlesList";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Blog",
  description:
    "Insights, guides and write-ups from the VektorSec team — AI penetration testing, security operations and vulnerability research.",
  path: "/blog",
});

export const revalidate = 300;

export default function BlogPage() {
  return <ArticlesList />;
}

