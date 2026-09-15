import { api, type BusinessHoursDay, type Location } from "@chesare/portal-shared";

export interface LocationInput {
  slug: string;
  name: string;
  waNumber: string;
  timezone: string;
  currency: string;
  active: boolean;
}

export const locationsApi = {
  list: () => api.get<{ locations: Location[] }>("/locations"),
  get: (id: string) => api.get<{ location: Location }>(`/locations/${id}`),
  create: (input: LocationInput) => api.post<{ location: Location }>("/locations", input),
  update: (id: string, input: Partial<LocationInput>) =>
    api.patch<{ location: Location }>(`/locations/${id}`, input)
};

export const hoursApi = {
  list: (locationId: string) => api.get<{ days: BusinessHoursDay[] }>(`/locations/${locationId}/hours`),
  replace: (locationId: string, days: BusinessHoursDay[]) =>
    api.put<{ days: BusinessHoursDay[] }>(`/locations/${locationId}/hours`, { days })
};
