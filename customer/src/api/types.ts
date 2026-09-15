export type ItemType = "FLAT" | "SIZE_STYLE_MATRIX";
export type FulfillmentType = "PICKUP" | "DELIVERY" | "DINE_IN";
export type SelectionType = "SINGLE" | "MULTIPLE";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export interface PublicLocation {
  id: string;
  slug: string;
  name: string;
  waNumber: string | null;
  timezone: string;
  currency: string;
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
  priceDelta: number | null;
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
  maxSelections: number | null;
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
  sortOrder: number;
  active: boolean;
  sizeOptions: SizeOption[];
  styleOptions: StyleOption[];
  items: MenuItem[];
}

export interface MenuResponse {
  location: PublicLocation;
  categories: MenuCategory[];
}

export interface HoursDay {
  dayOfWeek: number;
  opensAt: number | null;
  closesAt: number | null;
}

export interface HoursResponse {
  timezone: string;
  openNow: boolean;
  days: HoursDay[];
}

/**
 * Caps copied from `backend/src/schemas/orders.ts` — the server rejects anything
 * past them with a VALIDATION_ERROR that names a field the customer never saw, so
 * the inputs stop short of them instead of letting that error be reachable.
 */
export const MAX_LINE_QUANTITY = 50;
export const MAX_NAME_LENGTH = 80;
export const MAX_PHONE_LENGTH = 25;
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_NOTE_LENGTH = 500;

export interface OrderLinePayload {
  itemSlug: string;
  categorySlug?: string;
  sizeSlug?: string;
  styleSlug?: string;
  optionChoiceName?: string;
  quantity: number;
}

export interface SubmitOrderPayload {
  fulfillmentType: FulfillmentType;
  customer: {
    name?: string;
    /** Required by the server — the only way staff can call back about an order. */
    phone: string;
    address?: string;
    note?: string;
  };
  items: OrderLinePayload[];
}

export interface PlacedOrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  size: string | null;
  style: string | null;
  option: string | null;
  notes: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** Mirrors `presentOrder()` in `backend/src/lib/present.ts`. */
export interface PlacedOrder {
  id: string;
  /** `Order.orderNumber` is a Postgres autoincrement Int, not a string. */
  orderNumber: number;
  locationId: string;
  customerId: string | null;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerNote: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  promotionId: string | null;
  createdAt: string;
  items: PlacedOrderItem[];
}

export interface SubmitOrderResponse {
  order: PlacedOrder;
  location: PublicLocation;
}
