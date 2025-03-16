import HeaderLinks from "@/components/common/HeaderLinks";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const DashboardLayout = ({ children }) => {
  return (
    <>
    <AuthContextProvider>
      <HeaderLinks />
      {children}
    </AuthContextProvider>
    </>
  );
};

export default DashboardLayout;
