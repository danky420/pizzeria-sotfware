import { OrdersQueuePage as SharedOrdersQueuePage } from "@chesare/portal-shared";
import { useActiveLocation } from "../../state/location";

export function OrdersQueuePage() {
  const { location } = useActiveLocation();
  // AppShell only renders this route once a location is resolved; the check
  // is here purely so TypeScript knows it too.
  if (!location) return null;
  return <SharedOrdersQueuePage location={location} />;
}
