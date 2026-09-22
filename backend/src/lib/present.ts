import type {
  AdminUser,
  BusinessHours,
  Customer,
  Location,
  MenuCategory,
  MenuCategorySizeOption,
  MenuCategoryStyleOption,
  MenuItem,
  MenuItemOptionChoice,
  MenuItemOptionGroup,
  MenuItemPriceCell,
  Order,
  OrderEdit,
  OrderItem,
  Promotion
} from "@prisma/client";
import { decimalToNumber } from "./money.js";

// Prisma hands money back as Decimal objects, which would serialise as strings.
// Every response goes through here so the API speaks plain JSON numbers and the
// clients never have to know Decimal exists.

export interface MenuTree extends MenuCategory {
  sizeOptions: MenuCategorySizeOption[];
  styleOptions: MenuCategoryStyleOption[];
  items: (MenuItem & {
    priceCells: MenuItemPriceCell[];
    optionGroups: (MenuItemOptionGroup & { choices: MenuItemOptionChoice[] })[];
  })[];
}

export function presentLocation(location: Location) {
  return {
    id: location.id,
    slug: location.slug,
    name: location.name,
    waNumber: location.waNumber,
    timezone: location.timezone,
    currency: location.currency,
    addressText: location.addressText,
    tagline: location.tagline,
    legalNotice: location.legalNotice,
    demoNotice: location.demoNotice,
    colorScheme: location.colorScheme,
    // Computed, not stored -- a stable, cacheable URL derived from whether a
    // logo is set at all. See GET /api/public/locations/:slug/logo.
    logoUrl: location.logoAssetId ? `/api/public/locations/${location.slug}/logo` : null,
    active: location.active
  };
}

export function presentSizeOption(option: MenuCategorySizeOption) {
  return {
    id: option.id,
    slug: option.slug,
    name: option.name,
    comment: option.comment,
    sortOrder: option.sortOrder,
    active: option.active
  };
}

export function presentStyleOption(option: MenuCategoryStyleOption) {
  return {
    id: option.id,
    slug: option.slug,
    name: option.name,
    description: option.description,
    sortOrder: option.sortOrder,
    active: option.active
  };
}

export function presentPriceCell(cell: MenuItemPriceCell) {
  return {
    id: cell.id,
    sizeOptionId: cell.sizeOptionId,
    styleOptionId: cell.styleOptionId,
    price: decimalToNumber(cell.price)
  };
}

export function presentChoice(choice: MenuItemOptionChoice) {
  return {
    id: choice.id,
    name: choice.name,
    priceDelta: decimalToNumber(choice.priceDelta),
    priceOverride: decimalToNumber(choice.priceOverride),
    available: choice.available,
    sortOrder: choice.sortOrder
  };
}

export function presentOptionGroup(
  group: MenuItemOptionGroup & { choices?: MenuItemOptionChoice[] }
) {
  return {
    id: group.id,
    menuItemId: group.menuItemId,
    name: group.name,
    selectionType: group.selectionType,
    required: group.required,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    sortOrder: group.sortOrder,
    choices: (group.choices ?? []).map(presentChoice)
  };
}

export function presentItem(
  item: MenuItem & {
    priceCells?: MenuItemPriceCell[];
    optionGroups?: (MenuItemOptionGroup & { choices: MenuItemOptionChoice[] })[];
  }
) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    slug: item.slug,
    name: item.name,
    description: item.description,
    itemType: item.itemType,
    flatPrice: decimalToNumber(item.flatPrice),
    subgroupLabel: item.subgroupLabel,
    iconKey: item.iconKey,
    // A real photo, if uploaded -- takes priority over everything else in
    // itemIcon() (customer/src/lib/menu.tsx). Flat route, same reasoning as
    // presentCategory()'s iconUrl: the item id is already public here.
    imageUrl: item.imageAssetId ? `/api/public/items/${item.id}/image` : null,
    toppingColors: item.toppingColors ?? null,
    isFeatured: item.isFeatured,
    ageRestricted: item.ageRestricted,
    available: item.available,
    sortOrder: item.sortOrder,
    priceCells: (item.priceCells ?? []).map(presentPriceCell),
    optionGroups: (item.optionGroups ?? []).map(presentOptionGroup)
  };
}

export function presentCategory(category: MenuCategory) {
  return {
    id: category.id,
    locationId: category.locationId,
    slug: category.slug,
    name: category.name,
    description: category.description,
    // iconKey is the built-in default; iconUrl (if set) is the tenant's own
    // uploaded image and takes priority over it client-side -- see
    // docs/multi-tenant-branding-plan.md. Flat, not nested under the location
    // slug: the category id is already public once the menu is fetched (it's
    // right above in this same object), so nesting would add no real scoping.
    iconKey: category.iconKey,
    iconUrl: category.iconAssetId ? `/api/public/categories/${category.id}/icon` : null,
    // "gallery" | "rows" | null -- see MenuCategory.displayStyle in schema.prisma.
    displayStyle: category.displayStyle,
    sortOrder: category.sortOrder,
    active: category.active
  };
}

/**
 * `hidden` rows are the ones a customer must not see: inactive categories and
 * options, and items the shop has switched off. They still exist for the back
 * office, so only the public presenter drops them.
 */
export function presentMenuTree(categories: MenuTree[], options: { includeHidden: boolean }) {
  const keep = <T extends { active: boolean }>(rows: T[]) =>
    options.includeHidden ? rows : rows.filter((row) => row.active);

  return keep(categories).map((category) => ({
    ...presentCategory(category),
    sizeOptions: keep(category.sizeOptions).map(presentSizeOption),
    styleOptions: keep(category.styleOptions).map(presentStyleOption),
    items: category.items
      .filter((item) => options.includeHidden || item.available)
      .map((item) => ({
        ...presentItem(item),
        optionGroups: item.optionGroups.map((group) => ({
          ...presentOptionGroup(group),
          choices: group.choices
            .filter((choice) => options.includeHidden || choice.available)
            .map(presentChoice)
        }))
      }))
  }));
}

export function presentHours(days: BusinessHours[]) {
  return days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    opensAt: day.opensAt,
    closesAt: day.closesAt
  }));
}

export function presentUser(user: AdminUser) {
  return {
    id: user.id,
    locationId: user.locationId,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  };
}

export function presentPromotion(promotion: Promotion) {
  return {
    id: promotion.id,
    locationId: promotion.locationId,
    name: promotion.name,
    description: promotion.description,
    code: promotion.code,
    discountType: promotion.discountType,
    discountValue: decimalToNumber(promotion.discountValue),
    scope: promotion.scope,
    categoryId: promotion.categoryId,
    menuItemId: promotion.menuItemId,
    minSubtotal: decimalToNumber(promotion.minSubtotal),
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    active: promotion.active
  };
}

export function presentCustomer(customer: Customer) {
  return {
    id: customer.id,
    locationId: customer.locationId,
    phone: customer.phone,
    name: customer.name,
    addressText: customer.addressText,
    orderCount: customer.orderCount,
    totalSpent: decimalToNumber(customer.totalSpent),
    lastOrderAt: customer.lastOrderAt
  };
}

export function presentOrderItem(item: OrderItem) {
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    name: item.nameSnapshot,
    size: item.sizeSnapshot,
    style: item.styleSnapshot,
    option: item.optionSnapshot,
    notes: item.notes,
    unitPrice: decimalToNumber(item.unitPrice),
    quantity: item.quantity,
    lineTotal: decimalToNumber(item.lineTotal)
  };
}

/**
 * Public order-tracking response: a customer already proved they know the
 * phone number and order number, but that's still no reason to hand back
 * the delivery address or note text on a second unauthenticated surface —
 * see docs/order-tracking-plan.md.
 */
export function presentOrderTracking(order: Order & { items?: OrderItem[] }) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    createdAt: order.createdAt,
    customerName: order.customerName,
    total: decimalToNumber(order.total),
    items: (order.items ?? []).map((item) => ({
      name: item.nameSnapshot,
      size: item.sizeSnapshot,
      style: item.styleSnapshot,
      option: item.optionSnapshot,
      quantity: item.quantity
    }))
  };
}

export function presentOrderEdit(edit: OrderEdit & { editedBy?: { id: string; name: string } | null }) {
  return {
    id: edit.id,
    reason: edit.reason,
    // Already a plain-JSON structured summary at write time (see
    // OrderEditChangeSummary in services/order-edits.ts) -- nothing here
    // needs unwrapping the way a Decimal field does.
    changes: edit.changes,
    previousTotal: decimalToNumber(edit.previousTotal),
    newTotal: decimalToNumber(edit.newTotal),
    editedBy: edit.editedBy ?? null,
    createdAt: edit.createdAt
  };
}

export function presentOrder(
  order: Order & {
    items?: OrderItem[];
    edits?: (OrderEdit & { editedBy?: { id: string; name: string } | null })[];
  },
  // Edit history is a back-office concern -- who changed a price/quantity
  // and why is not something a STAFF session gets to see, only that it's
  // possible to make those changes at all. Defaults on so the public/order
  // creation path (which never fetches edits anyway) doesn't have to
  // think about this.
  options: { includeEdits?: boolean } = {}
) {
  const includeEdits = options.includeEdits ?? true;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    locationId: order.locationId,
    customerId: order.customerId,
    fulfillmentType: order.fulfillmentType,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    customerNote: order.customerNote,
    subtotal: decimalToNumber(order.subtotal),
    discountTotal: decimalToNumber(order.discountTotal),
    total: decimalToNumber(order.total),
    promotionId: order.promotionId,
    createdAt: order.createdAt,
    items: (order.items ?? []).map(presentOrderItem),
    edits: includeEdits ? (order.edits ?? []).map(presentOrderEdit) : []
  };
}
