"use client";

/**
 * Global Error Boundary (App Router `global-error.js`).
 *
 * Replaces the raw black "Application error" screen for errors that escape
 * every route-level boundary. Renders its own <html>/<body> because the root
 * layout is not available once a global error is hit.
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
            background: "#0f1117",
            color: "#e2e8f0",
            fontFamily: "Inter, system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 480 }}>
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Something went wrong
            </div>
            <p style={{ marginTop: 16, color: "#94a3b8", lineHeight: 1.6, fontSize: 14 }}>
              An unexpected error occurred. Reloading usually fixes it.
            </p>
            <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Reload
              </button>
              <a
                href="/"
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#94a3b8",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
