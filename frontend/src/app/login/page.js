import LoginPage from "@/components/pages/login/Login";
import { pageMetadata } from "@/lib/seo";

// Login is an auth surface — no reason to rank it, but crawlers that land
// here should still be able to follow links.
export const metadata = {
  ...pageMetadata({
    title: "Login",
    description:
      "Sign in to VektorSec — the autonomous AI penetration testing and security operations platform.",
    path: "/login",
  }),
  robots: { index: false, follow: true },
};

export const revalidate = 300;

const Login = () => {
  return <LoginPage />;
};

export default Login;
