import DocsPage from "@/components/pages/docs/DocsPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Documentation",
  description:
    "VektorSec documentation and guides — get started with the autonomous AI penetration testing and security operations platform.",
  path: "/docs",
});

export const revalidate = 300;

const DocsRoute = () => {
  return <DocsPage />;
};

export default DocsRoute;
