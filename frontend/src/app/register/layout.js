import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const LoginLayout = ({ children }) => {
  return <AuthContextProvider>{children}</AuthContextProvider>;
};

export default LoginLayout;
