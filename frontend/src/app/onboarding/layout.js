import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const OnboardingLayout = ({ children }) => {
  return <AuthContextProvider>{children}</AuthContextProvider>;
};

export default OnboardingLayout;
