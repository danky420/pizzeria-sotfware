import { OrdersQueuePage as SharedOrdersQueuePage } from "@chesare/portal-shared";
import { useActiveLocation } from "../../lib/session";

export function OrdersQueuePage() {
  const location = useActiveLocation();
  return <SharedOrdersQueuePage location={location} />;
}
