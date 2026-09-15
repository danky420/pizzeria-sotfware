import { AuthProvider } from "@chesare/portal-shared";
import { AppRoutes } from "./routes";

/**
 * No role gate wraps the router, unlike `admin/`'s `StaffAccountGate`: this app
 * is for every authenticated role on purpose. Staff live here; an owner or
 * manager covering the counter can sign in and work the same queue rather than
 * navigating the back office between orders.
 */
export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
