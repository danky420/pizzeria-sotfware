export type AdminRole = "SUPER_ADMIN" | "OWNER" | "MANAGER" | "STAFF";
export type ItemType = "FLAT" | "SIZE_STYLE_MATRIX";
export type SelectionType = "SINGLE" | "MULTIPLE";
export type DiscountType = "PERCENT" | "FIXED";
export type PromotionScope = "ORDER" | "CATEGORY" | "ITEM";
export type FulfillmentType = "PICKUP" | "DELIVERY" | "DINE_IN";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  locationId: string | null;
}

export interface AdminUser {
  id: string;
  locationId: string | null;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Location {
  id: string;
  slug: string;
  name: string;
  waNumber: string;
  timezone: string;
  currency: string;
  addressText: string | null;
  // Short line under the name in the customer site's header. Null shows none.
  tagline: string | null;
  // Optional footer notices on the customer site (e.g. an age-restriction
  // line, a "prices still being confirmed" note). Null shows nothing.
  legalNotice: string | null;
  demoNotice: string | null;
  // One of backend/src/schemas/locations.ts's SUPPORTED_COLOR_SCHEMES. admin/
  // and employee/ never apply this to their own chrome (that stays neutral for
  // every tenant, by design) -- it rides along here only because LocationPage
  // reads and writes it like every other Location field.
  colorScheme: string;
  logoUrl: string | null;
  active: boolean;
}

export interface SizeOption {
  id: string;
  slug: string;
  name: string;
  comment: string | null;
  sortOrder: number;
  active: boolean;
}

export interface StyleOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

export interface PriceCell {
  id: string;
  sizeOptionId: string;
  styleOptionId: string;
  price: number | null;
}

export interface OptionChoice {
  id: string;
  name: string;
  priceDelta: number;
  priceOverride: number | null;
  available: boolean;
  sortOrder: number;
}

export interface OptionGroup {
  id: string;
  menuItemId: string;
  name: string;
  selectionType: SelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  choices: OptionChoice[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  itemType: ItemType;
  flatPrice: number | null;
  subgroupLabel: string | null;
  iconKey: string | null;
  // A real uploaded photo of the dish, if set -- takes priority over the
  // built-in icon set on the storefront.
  imageUrl: string | null;
  toppingColors: string[] | null;
  isFeatured: boolean;
  ageRestricted: boolean;
  available: boolean;
  sortOrder: number;
  priceCells: PriceCell[];
  optionGroups: OptionGroup[];
}

export interface MenuCategory {
  id: string;
  locationId: string;
  slug: string;
  name: string;
  description: string | null;
  // iconKey is the built-in default; iconUrl (if set) is the tenant's own
  // uploaded image and takes priority over it on the storefront.
  iconKey: string | null;
  iconUrl: string | null;
  // "gallery" | "rows" | null -- which card style the storefront uses for
  // this category's items.
  displayStyle: string | null;
  sortOrder: number;
  active: boolean;
}

export interface MenuCategoryTree extends MenuCategory {
  sizeOptions: SizeOption[];
  styleOptions: StyleOption[];
  items: MenuItem[];
}

export interface BusinessHoursDay {
  dayOfWeek: number;
  opensAt: number | null;
  closesAt: number | null;
}

export interface Promotion {
  id: string;
  locationId: string;
  name: string;
  description: string | null;
  code: string | null;
  discountType: DiscountType;
  discountValue: number;
  scope: PromotionScope;
  categoryId: string | null;
  menuItemId: string | null;
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}

export interface Customer {
  id: string;
  locationId: string;
  phone: string;
  name: string | null;
  addressText: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface OrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  size: string | null;
  style: string | null;
  option: string | null;
  notes: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

// One line in an OrderEdit's `changes` -- a human-readable record of what
// moved, not a full before/after row dump. Mirrors OrderEditChangeSummary in
// backend/src/services/order-edits.ts.
export type OrderEditChange =
  | {
      type: "quantity_changed";
      orderItemId: string;
      name: string;
      detail: string | null;
      from: number;
      to: number;
    }
  | { type: "item_removed"; orderItemId: string; name: string; detail: string | null; quantity: number }
  | { type: "item_added"; name: string; detail: string | null; quantity: number; unitPrice: number };

export interface OrderEdit {
  id: string;
  reason: string;
  changes: OrderEditChange[];
  previousTotal: number;
  newTotal: number;
  editedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  locationId: string;
  customerId: string | null;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string;
  customerAddress: string | null;
  customerNote: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  promotionId: string | null;
  createdAt: string;
  items: OrderItem[];
  edits: OrderEdit[];
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface StatusBreakdownRow {
  status: OrderStatus;
  orderCount: number;
  revenue: number | null;
}

export interface AnalyticsSummary {
  from: string | null;
  to: string | null;
  // The server counts every non-CANCELLED order as revenue so a dashboard read
  // mid-service is not empty; it reports which statuses those were rather than
  // leaving the figure to be reverse-engineered.
  countedStatuses: OrderStatus[];
  orderCount: number;
  revenue: number | null;
  subtotal: number | null;
  discountTotal: number | null;
  averageOrderValue: number | null;
  cancelledCount: number;
  byStatus: StatusBreakdownRow[];
}

export interface TopItem {
  menuItemId: string | null;
  name: string;
  quantity: number;
  revenue: number | null;
}
