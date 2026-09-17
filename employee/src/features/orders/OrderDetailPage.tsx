import { OrderDetailPage as SharedOrderDetailPage } from "@chesare/portal-shared";
import { useActiveLocation } from "../../lib/session";

// No customerLinkTo here: that section of the back office does not exist in
// this app, and the API would refuse a STAFF session on it anyway.
export function OrderDetailPage() {
  const location = useActiveLocation();
  return <SharedOrderDetailPage location={location} />;
}
