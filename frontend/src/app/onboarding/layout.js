import AuthOnlyLayout from "@/components/layouts/AuthOnlyLayout";

const OnboardingLayout = ({ children }) => {
  return <AuthOnlyLayout>{children}</AuthOnlyLayout>;
};

export default OnboardingLayout;
