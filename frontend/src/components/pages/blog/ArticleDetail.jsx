"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getArticleBySlug } from "@/services/blog.service";

export default function ArticleDetail() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getArticleBySlug(slug)
      .then((data) => {
        if (!cancelled) setArticle(data.article || null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err?.response?.data?.message || "Article not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "48px 24px",
        minHeight: "60vh",
        color: "#e6e6e6",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Link href="/blog" style={{ color: "#58a6ff", textDecoration: "none", fontSize: 14 }}>
        ← Back to articles
      </Link>

      {loading && <p style={{ color: "#8c8c8c", marginTop: 24 }}>Loading...</p>}
      {error && <p style={{ color: "#ff4d4f", marginTop: 24 }}>{error}</p>}

      {article && (
        <article style={{ marginTop: 24 }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.25, marginBottom: 8 }}>{article.title}</h1>
          <div style={{ fontSize: 13, color: "#8c8c8c", marginBottom: 24 }}>
            {article.author || "VektorSec"} · {new Date(article.createdAt).toLocaleDateString()}
            {article.category ? ` · ${article.category}` : ""}
          </div>

          {article.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.coverImage}
              alt={article.title}
              style={{ width: "100%", borderRadius: 12, marginBottom: 24 }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          <div
            dangerouslySetInnerHTML={{ __html: article.content || "" }}
            style={{ lineHeight: 1.7, fontSize: 15.5, wordBreak: "break-word" }}
          />
        </article>
      )}
    </div>
  );
}
