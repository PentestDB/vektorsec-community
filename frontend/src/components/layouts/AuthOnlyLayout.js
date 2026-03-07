import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const AuthOnlyLayout = ({ children }) => {
  return <AuthContextProvider>{children}</AuthContextProvider>;
};

export default AuthOnlyLayout;
