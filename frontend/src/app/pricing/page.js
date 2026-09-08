import PricingPage from "@/components/pages/PricingPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Pricing & Plans",
  description:
    "Transparent, pay-as-you-go pricing for VektorSec — the autonomous AI penetration testing and security operations platform.",
  path: "/pricing",
});

export const revalidate = 300;

const Pricing = () => {
  return <PricingPage />;
};

export default Pricing;
