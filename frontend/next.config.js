/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Black-Box hardening ─────────────────────────────────────────────────
  // NEVER emit browser source maps in production builds. Without this the
  // un-minified app source would be one F12 click away.
  productionBrowserSourceMaps: false,
  // Do not advertise the server technology.
  poweredByHeader: false,

  // Turbopack: disable debug IDs (they would be embedded into bundles and
  // source maps).
  turbopack: {
    debugIds: false,
  },

  // image urls
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.producthunt.com",
      },
    ],
  },

  sassOptions: {
    silenceDeprecations: ["import", "global-builtin"],
  },

  // ── Security headers on every Next.js-served response ──────────────────
  // (Proxied /api and /novnc responses get their own headers in server.js.)
  // Set SECURITY_HEADERS_ENABLED=0 on the frontend to disable hardening
  // headers (e.g. behind a WAF that already sets its own).
  async headers() {
    if (process.env.SECURITY_HEADERS_ENABLED === "0") {
      return [];
    }

    const csp = [
      "default-src 'self'",
      // Next.js app router bootstraps with inline scripts; reCAPTCHA loads
      // its script from google.com.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      // same-origin WebSockets (shell stream, noVNC) + reCAPTCHA.
      "connect-src 'self' ws: wss: https://www.google.com https://www.gstatic.com",
      "frame-src 'self' https://www.google.com https://www.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "worker-src 'self' blob:",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

