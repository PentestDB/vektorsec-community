import LandingPage from "@/components/pages/Landing";

// Revalidate periodically so live SEO metadata (Admin > SEO) and content
// propagate without a full redeploy.
export const revalidate = 300;

const Home = () => {
  return <LandingPage />;
};

export default Home;

