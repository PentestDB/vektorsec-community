// styles
import "./globals.scss";
import "antd/dist/reset.css";
import "@xterm/xterm/css/xterm.css";
import { Inter } from "next/font/google";
import QueryClientContext from "@/components/common/auth/QueryClient";
import StoreProvider from "@/components/common/auth/StoreProvider";
import IntercommMessenger from "@/components/common/IntercommMessenger";
import AnnouncementPopup from "@/components/common/AnnouncementPopup";
const inter = Inter({ subsets: ["latin"] });

export const metadata =
  process.env.NEXT_PUBLIC_DEPLOYMENT === "PRODUCTION"
    ? {
        title: "VektorSec - Autonomous Pentest & Security Operations",
        description:
          "Your ultimate ethical hacking assistant, VektorSec utilizes context to give directed results. From analysing web apps to root shells, it's got you covered.",
        metadataBase: new URL("https://vektorsec.ai"),
        openGraph: {
          title: "VektorSec - Autonomous Pentest & Security Operations",
          description:
            "Your ultimate ethical hacking assistant, VektorSec utilizes context to give directed results. From analysing web apps to root shells, it's got you covered.",
          siteName: "VektorSec",
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
              alt: "VektorSec",
            },
          ],
          locale: "en_US",
          type: "website",
        },
        twitter: {
          card: "VektorSec",
          title: "VektorSec - Autonomous Pentest & Security Operations",
          description:
            "Your ultimate ethical hacking assistant, VektorSec utilizes context to give directed results. From analysing web apps to root shells, it's got you covered.",
          creator: "@VektorSec",
          images: ["/opengraph-image.png"],
        },
      }
    : {
        title: "VektorSec - Autonomous Pentest & Security Operations",
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
            <AnnouncementPopup />
            {children}
          </QueryClientContext>
        </StoreProvider>
      </body>
    </html>
  );
}
