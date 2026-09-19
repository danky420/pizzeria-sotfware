import {
  adminApiPrefix,
  api,
  ApiError,
  type ItemType,
  type MenuCategory,
  type MenuCategoryTree,
  type MenuItem,
  type OptionChoice,
  type OptionGroup,
  type PriceCell,
  type SelectionType,
  type SizeOption,
  type StyleOption
} from "@chesare/portal-shared";

export interface CategoryInput {
  slug: string;
  name: string;
  description: string | null;
  // One of backend/src/schemas/menu.ts's CATEGORY_ICON_KEYS, or null. The
  // tenant's own uploaded icon (uploadIcon below) takes priority over this
  // when both are set -- see docs/multi-tenant-branding-plan.md.
  iconKey: string | null;
  // One of backend/src/schemas/menu.ts's CATEGORY_DISPLAY_STYLES, or null
  // (defaults to "rows" except the seeded "pizzas" category).
  displayStyle: string | null;
  sortOrder: number;
  active: boolean;
}

export interface SizeOptionInput {
  slug: string;
  name: string;
  comment: string | null;
  sortOrder: number;
  active: boolean;
}

export interface StyleOptionInput {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

export interface ItemInput {
  slug: string;
  name: string;
  description: string | null;
  itemType: ItemType;
  // null is a real value here, not "unset": it is the menu's "Pregunta el
  // precio" state and must survive as null all the way to the request body.
  flatPrice: number | null;
  // Cosmetic sub-heading within the category's list, e.g. "Cafés y tés"
  // inside a "Frappés y café" category. Null renders with no sub-heading.
  subgroupLabel: string | null;
  toppingColors: string[] | null;
  isFeatured: boolean;
  ageRestricted: boolean;
  available: boolean;
  sortOrder: number;
}

export interface PriceMatrixCellInput {
  sizeOptionId: string;
  styleOptionId: string;
  price: number | null;
}

export interface OptionGroupInput {
  name: string;
  selectionType: SelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
}

export interface ChoiceInput {
  name: string;
  priceDelta: number;
  priceOverride: number | null;
  available: boolean;
  sortOrder: number;
}

export const menuApi = {
  tree: (locationId: string) => api.get<{ categories: MenuCategoryTree[] }>(`/locations/${locationId}/menu`),

  listCategories: (locationId: string) =>
    api.get<{ categories: MenuCategory[] }>(`/locations/${locationId}/menu/categories`),
  createCategory: (locationId: string, input: CategoryInput) =>
    api.post<{ category: MenuCategory }>(`/locations/${locationId}/menu/categories`, input),
  getCategory: (id: string) =>
    api.get<{ category: MenuCategory; sizeOptions: SizeOption[]; styleOptions: StyleOption[] }>(
      `/menu/categories/${id}`
    ),
  updateCategory: (id: string, input: Partial<CategoryInput>) =>
    api.patch<{ category: MenuCategory }>(`/menu/categories/${id}`, input),
  removeCategory: (id: string) => api.del<{ ok: true }>(`/menu/categories/${id}`),
  // categoryIds in the new display order -- sortOrder becomes each id's index.
  reorderCategories: (locationId: string, categoryIds: string[]) =>
    api.put<{ categories: MenuCategory[] }>(`/locations/${locationId}/menu/categories/reorder`, { categoryIds }),
  // Not through portal-shared's `api` helper: that always JSON-encodes the
  // body, and a file upload needs multipart/form-data -- same pattern as
  // locationsApi.uploadLogo.
  uploadIcon: async (categoryId: string, file: File): Promise<{ category: MenuCategory }> => {
    const body = new FormData();
    body.append("icon", file);

    let response: Response;
    try {
      response = await fetch(`${adminApiPrefix()}/menu/categories/${categoryId}/icon`, {
        method: "POST",
        credentials: "include",
        body
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor");
    }

    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const envelope = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
      throw new ApiError(
        response.status,
        envelope?.code ?? "INTERNAL_ERROR",
        envelope?.message ?? "Ocurrió un error",
        envelope?.details
      );
    }
    return payload as { category: MenuCategory };
  },
  // Same pattern as uploadIcon above, for an individual item's own photo.
  uploadItemImage: async (itemId: string, file: File): Promise<{ item: MenuItem }> => {
    const body = new FormData();
    body.append("image", file);

    let response: Response;
    try {
      response = await fetch(`${adminApiPrefix()}/menu/items/${itemId}/image`, {
        method: "POST",
        credentials: "include",
        body
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor");
    }

    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const envelope = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
      throw new ApiError(
        response.status,
        envelope?.code ?? "INTERNAL_ERROR",
        envelope?.message ?? "Ocurrió un error",
        envelope?.details
      );
    }
    return payload as { item: MenuItem };
  },

  createSizeOption: (categoryId: string, input: SizeOptionInput) =>
    api.post<{ sizeOption: SizeOption }>(`/menu/categories/${categoryId}/size-options`, input),
  updateSizeOption: (id: string, input: Partial<SizeOptionInput>) =>
    api.patch<{ sizeOption: SizeOption }>(`/menu/size-options/${id}`, input),
  removeSizeOption: (id: string) => api.del<{ ok: true }>(`/menu/size-options/${id}`),

  createStyleOption: (categoryId: string, input: StyleOptionInput) =>
    api.post<{ styleOption: StyleOption }>(`/menu/categories/${categoryId}/style-options`, input),
  updateStyleOption: (id: string, input: Partial<StyleOptionInput>) =>
    api.patch<{ styleOption: StyleOption }>(`/menu/style-options/${id}`, input),
  removeStyleOption: (id: string) => api.del<{ ok: true }>(`/menu/style-options/${id}`),

  listItems: (categoryId: string) => api.get<{ items: MenuItem[] }>(`/menu/categories/${categoryId}/items`),
  createItem: (categoryId: string, input: ItemInput) =>
    api.post<{ item: MenuItem }>(`/menu/categories/${categoryId}/items`, input),
  getItem: (id: string) => api.get<{ item: MenuItem }>(`/menu/items/${id}`),
  updateItem: (id: string, input: Partial<ItemInput>) =>
    api.patch<{ item: MenuItem }>(`/menu/items/${id}`, input),
  removeItem: (id: string) => api.del<{ ok: true }>(`/menu/items/${id}`),
  setFlatPrice: (id: string, flatPrice: number | null) =>
    api.patch<{ item: MenuItem }>(`/menu/items/${id}/price`, { flatPrice }),
  setAvailability: (id: string, available: boolean) =>
    api.patch<{ item: MenuItem }>(`/menu/items/${id}/availability`, { available }),
  replacePriceMatrix: (id: string, cells: PriceMatrixCellInput[]) =>
    api.put<{ priceCells: PriceCell[] }>(`/menu/items/${id}/price-matrix`, { cells }),

  listOptionGroups: (itemId: string) =>
    api.get<{ optionGroups: OptionGroup[] }>(`/menu/items/${itemId}/option-groups`),
  createOptionGroup: (itemId: string, input: OptionGroupInput) =>
    api.post<{ optionGroup: OptionGroup }>(`/menu/items/${itemId}/option-groups`, input),
  updateOptionGroup: (id: string, input: Partial<OptionGroupInput>) =>
    api.patch<{ optionGroup: OptionGroup }>(`/menu/option-groups/${id}`, input),
  removeOptionGroup: (id: string) => api.del<{ ok: true }>(`/menu/option-groups/${id}`),

  createChoice: (groupId: string, input: ChoiceInput) =>
    api.post<{ choice: OptionChoice }>(`/menu/option-groups/${groupId}/choices`, input),
  updateChoice: (id: string, input: Partial<ChoiceInput>) =>
    api.patch<{ choice: OptionChoice }>(`/menu/choices/${id}`, input),
  removeChoice: (id: string) => api.del<{ ok: true }>(`/menu/choices/${id}`)
};
