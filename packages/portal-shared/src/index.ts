/**
 * `@chesare/portal-shared` — the slice of code the two staff-facing SPAs share.
 *
 * `admin/` (OWNER/MANAGER/SUPER_ADMIN back office) and `employee/` (STAFF
 * orders queue) are separate apps against the same API, so the response types,
 * the session-aware fetch wrapper, the auth context, the order-status
 * vocabulary and a handful of UI primitives live here instead of being copied.
 *
 * Consumed as TypeScript source through each app's bundler — no build step.
 */

// Backend response shapes (the whole mirror lives here; splitting it would put
// half the contract in one app and half in another).
export type * from "./types";

// API client
export {
  ApiError,
  adminApiPrefix,
  api,
  configureApiBaseUrl,
  errorMessage,
  query,
  setUnauthorizedHandler,
  type ApiErrorCode,
  type ApiErrorDetail
} from "./api/client";
export { authApi, type MeResponse } from "./api/auth";
export {
  ordersApi,
  type OrderListFilters,
  type OrderListPage,
  type OrderStatusResult
} from "./api/orders";

// Auth state
export { AuthProvider, ME_QUERY_KEY, useAuth, useSessionUser } from "./auth/context";

// Order-status vocabulary
export {
  FULFILLMENT_LABELS,
  OPEN_ORDER_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  orderStatusTone
} from "./orders/status";

// UI primitives
export { Badge, EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel } from "./ui/index";

// Display formatting
export { formatDate, formatDateTime, formatMoney, formatNumber } from "./format";
