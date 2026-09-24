import { api } from "./client";
import type { MenuCategoryTree, MenuItem } from "../types";

// The one menu surface a STAFF session can reach: marking an item out of
// stock or back in. Not menuApi (that's admin/'s own client, backed by
// BACK_OFFICE_ROLES-only routes) -- these hit item-availability.ts instead.
export const menuAvailabilityApi = {
  list: (locationId: string) =>
    api.get<{ categories: MenuCategoryTree[] }>(`/locations/${locationId}/menu/availability`),
  setAvailability: (itemId: string, available: boolean) =>
    api.patch<{ item: MenuItem }>(`/menu/items/${itemId}/availability`, { available })
};
