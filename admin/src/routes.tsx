import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth, RequireBackOffice } from "./components/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { OrdersQueuePage } from "./features/orders/OrdersQueuePage";
import { OrderDetailPage } from "./features/orders/OrderDetailPage";
import { MenuPage } from "./features/menu/MenuPage";
import { CategoryPage } from "./features/menu/CategoryPage";
import { PromotionsPage } from "./features/promotions/PromotionsPage";
import { CustomersPage } from "./features/customers/CustomersPage";
import { CustomerDetailPage } from "./features/customers/CustomerDetailPage";
import { HoursPage } from "./features/settings/HoursPage";
import { UsersPage } from "./features/settings/UsersPage";
import { LocationPage } from "./features/settings/LocationPage";
import { homePathFor } from "./lib/roles";
import { useAuth } from "./state/auth";

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user?.role)} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/orders" element={<OrdersQueuePage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />

          <Route element={<RequireBackOffice />}>
            <Route index element={<DashboardPage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/menu/:categoryId" element={<CategoryPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/settings/hours" element={<HoursPage />} />
            <Route path="/settings/users" element={<UsersPage />} />
            <Route path="/settings/location" element={<LocationPage />} />
          </Route>
        </Route>

        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
