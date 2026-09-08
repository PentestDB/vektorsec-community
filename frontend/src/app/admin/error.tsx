"use client";

/**
 * Admin Error Boundary (App Router `error.tsx`).
 *
 * Catches any client-side error thrown by an /admin sub-route so a single
 * broken page can never take the whole panel to the raw black
 * "Application error" screen. Shows a themed fallback with a reload button.
 *
 * NOTE: inline styles are intentional — the error may be caused by a broken
 * stylesheet, so we must not depend on the module SCSS here.
 */
export default function AdminError({ error, reset }) {
  return (
    <div
      style={{
        minHeight: "60vh",
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
            fontSize: 40,
            fontWeight: 800,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Something went wrong
        </div>
        <p style={{ marginTop: 16, color: "#94a3b8", lineHeight: 1.6, fontSize: 14 }}>
          This admin page hit an unexpected error. The rest of the panel is still
          working — reload this section to continue.
        </p>
        {error && (
          <code
            style={{
              display: "block",
              marginTop: 12,
              padding: "10px 14px",
              background: "#161a23",
              border: "1px solid #232936",
              borderRadius: 8,
              color: "#f87171",
              fontSize: 12,
              wordBreak: "break-all",
            }}
          >
            {String(error?.message || error).slice(0, 240)}
          </code>
        )}
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
            Try again
          </button>
          <a
            href="/admin/dashboard"
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
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
