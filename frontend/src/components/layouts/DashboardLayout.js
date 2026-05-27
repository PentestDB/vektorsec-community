import HeaderLinks from "@/components/common/HeaderLinks";
import ModelSetupGate from "@/components/common/ModelSetupGate";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

const DashboardLayout = ({ children }) => {
  return (
    <AuthContextProvider>
      <ModelSetupGate>
        <HeaderLinks />
        {children}
      </ModelSetupGate>
    </AuthContextProvider>
  );
};

export default DashboardLayout;
