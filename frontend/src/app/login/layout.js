import AuthOnlyLayout from "@/components/layouts/AuthOnlyLayout";

const LoginLayout = ({ children }) => {
  return <AuthOnlyLayout>{children}</AuthOnlyLayout>;
};

export default LoginLayout;
