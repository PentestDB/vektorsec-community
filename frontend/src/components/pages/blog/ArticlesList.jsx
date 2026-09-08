"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublishedArticles } from "@/services/blog.service";

export default function ArticlesList() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPublishedArticles()
      .then((data) => {
        if (!cancelled) setArticles(data.articles || []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load articles");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "48px 24px",
        minHeight: "60vh",
        color: "#e6e6e6",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>Articles</h1>
      <p style={{ color: "#8c8c8c", marginBottom: 32 }}>
        Insights, guides and write-ups from the VektorSec team.
      </p>

      {loading && <p style={{ color: "#8c8c8c" }}>Loading...</p>}
      {error && <p style={{ color: "#ff4d4f" }}>{error}</p>}

      {!loading && !error && articles.length === 0 && (
        <p style={{ color: "#8c8c8c" }}>No articles published yet.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
        {articles.map((a) => (
          <Link
            key={a._id}
            href={`/blog/${a.slug}`}
            style={{
              display: "block",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              overflow: "hidden",
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              textDecoration: "none",
              transition: "border-color 0.2s",
            }}
          >
            {a.coverImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.coverImage}
                alt={a.title}
                style={{ width: "100%", height: 160, objectFit: "cover" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 6 }}>
                {a.author || "VektorSec"} · {new Date(a.createdAt).toLocaleDateString()}
              </div>
              <h2 style={{ fontSize: 18, margin: 0, marginBottom: 6 }}>{a.title}</h2>
              {a.description && (
                <p style={{ fontSize: 13.5, color: "#a9a9a9", margin: 0, lineHeight: 1.5 }}>
                  {a.description}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
