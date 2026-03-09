// styles
import "./globals.scss";
import "antd/dist/reset.css";
import "xterm/css/xterm.css";
import { Inter } from "next/font/google";
import QueryClientContext from "@/components/common/auth/QueryClient";
import StoreProvider from "@/components/common/auth/StoreProvider";
import IntercommMessenger from "@/components/common/IntercommMessenger";
const inter = Inter({ subsets: ["latin"] });

export const metadata =
  process.env.NEXT_PUBLIC_DEPLOYMENT === "PRODUCTION"
    ? {
        title: "Pentest Copilot by BugBase",
        description:
          "Your ultimate ethical hacking assistant, copilot utilizes context to give directed results. From analysing web apps to root shells, it's got you covered.",
        metadataBase: new URL("https://copilot.bugbase.ai"),
        openGraph: {
          title: "Pentest Copilot by BugBase",
          description:
            "Your ultimate ethical hacking assistant, copilot utilizes context to give directed results. From analysing web apps to root shells, it's got you covered.",
          siteName: "Pentest Copilot by BugBase",
          images: [
            {
              url: "/opengraph-image.png",
              width: 800,
              height: 600,
            },
            {
              url: "/opengraph-image.png",
              width: 1800,
              height: 1600,
              alt: "Pentest Copilot - Bugbase",
            },
          ],
          locale: "en_US",
          type: "website",
        },
        twitter: {
          card: "Pentest Copilot - Bugbase",
          title: "Pentest Copilot - Bugbase",
          description:
            "Your ultimate ethical hacking assistant, copilot utilizes context to give directed results. From analysing web apps to root shells, it's got you covered.",
          creator: "@bugbase",
          images: ["/opengraph-image.png"],
        },
      }
    : {
        title: "Pentest Copilot - Bugbase",
        robots: "noindex, nofollow",
        metadataBase: new URL("http://localhost:3000"),
      };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <StoreProvider>
          <QueryClientContext>
            <IntercommMessenger />
            {children}
          </QueryClientContext>
        </StoreProvider>
      </body>
    </html>
  );
}
