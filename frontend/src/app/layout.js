// styles
import "./globals.scss";
import "antd/dist/reset.css";
import "@xterm/xterm/css/xterm.css";
// Force the admin module CSS into the SSR stylesheet set (emitted as a real
// <link rel="stylesheet"> in the initial HTML) so /admin never depends on
// client-side JS to promote a preload into an applied stylesheet.
import "./admin/admin.module.scss";
import { Inter } from "next/font/google";
import QueryClientContext from "@/components/common/auth/QueryClient";
import StoreProvider from "@/components/common/auth/StoreProvider";
import IntercommMessenger from "@/components/common/IntercommMessenger";
import AnnouncementPopup from "@/components/common/AnnouncementPopup";
import SeoJsonLd from "@/components/common/SeoJsonLd";
import { baseMetadata } from "@/lib/seo";
import { getSeoSite } from "@/lib/seoSettings";
const inter = Inter({ subsets: ["latin"] });

/**
 * SEO metadata is generated per request so the values configured in
 * Admin > SEO (title, description, keywords, OG image, site URL, indexing)
 * take effect live — no redeploy needed.
 *
 * Indexing is gated on the deployment mode so staging/dev builds never leak
 * to Google: `DEPLOYMENT` (server-side, preferred) or `NEXT_PUBLIC_DEPLOYMENT`
 * must equal "PRODUCTION", and Admin > SEO "Allow Indexing" must be on.
 */
export async function generateMetadata() {
  const deployment =
    process.env.DEPLOYMENT || process.env.NEXT_PUBLIC_DEPLOYMENT || "LOCAL";
  const isProduction = deployment === "PRODUCTION";

  if (!isProduction) {
    const site = await getSeoSite();
    return {
      ...baseMetadata(site),
      robots: { index: false, follow: false },
    };
  }

  const site = await getSeoSite();
  return {
    ...baseMetadata(site),
    robots: site.indexing
      ? { index: true, follow: true, googleBot: { index: true, follow: true } }
      : { index: false, follow: false },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Schema.org structured data (Organization, SoftwareApplication, WebSite) */}
        <SeoJsonLd />
      </head>
      <body className={inter.className}>
        <StoreProvider>
          <QueryClientContext>
            <IntercommMessenger />
            <AnnouncementPopup />
            {children}
          </QueryClientContext>
        </StoreProvider>
      </body>
    </html>
  );
}


