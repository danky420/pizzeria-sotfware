import { AuthProvider } from "@chesare/portal-shared";
import { StaffAccountGate } from "./components/guards";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <AuthProvider>
      <StaffAccountGate>
        <AppRoutes />
      </StaffAccountGate>
    </AuthProvider>
  );
}
