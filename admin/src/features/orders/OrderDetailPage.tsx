import { OrderDetailPage as SharedOrderDetailPage } from "@chesare/portal-shared";
import { useActiveLocation } from "../../state/location";

export function OrderDetailPage() {
  const { location } = useActiveLocation();
  if (!location) return null;
  return (
    <SharedOrderDetailPage
      location={location}
      customerLinkTo={(customerId) => `/customers/${customerId}`}
    />
  );
}
