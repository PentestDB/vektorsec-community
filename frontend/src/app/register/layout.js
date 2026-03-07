import AuthOnlyLayout from "@/components/layouts/AuthOnlyLayout";

const RegisterLayout = ({ children }) => {
  return <AuthOnlyLayout>{children}</AuthOnlyLayout>;
};

export default RegisterLayout;
