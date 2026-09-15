import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { OrdersQueuePage } from "./features/orders/OrdersQueuePage";
import { OrderDetailPage } from "./features/orders/OrderDetailPage";

/**
 * One section, three routes. Menu, promotions, analytics, customers and
 * settings are absent by design — the API answers 403 to a STAFF session on all
 * of them, so a screen here could only ever be a dead end.
 *
 * Anything unrecognised goes to the queue rather than a 404 page: this app is
 * the queue, and a mistyped URL on a phone behind the counter should not cost
 * anyone a detour.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<OrdersQueuePage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Route>
    </Routes>
  );
}
