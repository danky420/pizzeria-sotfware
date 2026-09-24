import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { AvailabilityPage } from "./features/menu/AvailabilityPage";
import { OrdersQueuePage } from "./features/orders/OrdersQueuePage";
import { OrderDetailPage } from "./features/orders/OrderDetailPage";

/**
 * Two sections: the orders queue, and marking items out of stock (or back in)
 * -- the one menu write STAFF gets, backed by item-availability.ts rather than
 * admin/'s BACK_OFFICE_ROLES-only menu routes. Promotions, analytics,
 * customers, prices and every other back-office screen are still absent by
 * design; the API answers 403 to a STAFF session on all of them.
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
          <Route path="/menu" element={<AvailabilityPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Route>
    </Routes>
  );
}
