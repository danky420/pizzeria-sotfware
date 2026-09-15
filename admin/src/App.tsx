import { AuthProvider } from "./state/auth";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
