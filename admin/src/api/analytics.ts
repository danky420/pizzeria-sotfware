import { api, query } from "./client";
import type { AnalyticsSummary, TopItem } from "./types";

export interface DateRange {
  from: string;
  to: string;
}

export const analyticsApi = {
  summary: (locationId: string, range: DateRange) =>
    api
      .get<{ summary: AnalyticsSummary }>(
        `/locations/${locationId}/analytics/summary${query({ ...range })}`
      )
      .then((response) => response.summary),
  topItems: (locationId: string, range: DateRange, limit = 8) =>
    api
      .get<{ items: TopItem[]; limit: number }>(
        `/locations/${locationId}/analytics/top-items${query({ ...range, limit })}`
      )
      .then((response) => response.items)
};
