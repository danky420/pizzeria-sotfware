import { api, query } from "./client";
import type { DiscountType, Promotion, PromotionScope } from "./types";

export interface PromotionInput {
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

export const promotionsApi = {
  list: (locationId: string, activeOnly = false) =>
    api.get<{ promotions: Promotion[] }>(
      `/locations/${locationId}/promotions${query({ activeOnly: activeOnly ? "true" : "false" })}`
    ),
  create: (locationId: string, input: PromotionInput) =>
    api.post<{ promotion: Promotion }>(`/locations/${locationId}/promotions`, input),
  update: (id: string, input: Partial<PromotionInput>) =>
    api.patch<{ promotion: Promotion }>(`/promotions/${id}`, input),
  remove: (id: string) => api.del<{ ok: true }>(`/promotions/${id}`)
};
