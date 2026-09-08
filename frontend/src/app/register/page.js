import RegisterPage from "@/components/pages/login/Register";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Create Your Account",
  description:
    "Get started free with VektorSec — the autonomous AI penetration testing and security operations platform.",
  path: "/register",
});

export const revalidate = 300;


const Register = () => {
  return <RegisterPage/>;
};

export default Register;
