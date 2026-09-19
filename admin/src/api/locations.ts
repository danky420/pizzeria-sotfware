import { adminApiPrefix, api, ApiError, type BusinessHoursDay, type Location } from "@chesare/portal-shared";

export interface LocationInput {
  slug: string;
  name: string;
  waNumber: string;
  timezone: string;
  currency: string;
  addressText: string;
  tagline: string;
  legalNotice: string;
  demoNotice: string;
  colorScheme: string;
  active: boolean;
}

export const locationsApi = {
  list: () => api.get<{ locations: Location[] }>("/locations"),
  get: (id: string) => api.get<{ location: Location }>(`/locations/${id}`),
  create: (input: LocationInput) => api.post<{ location: Location }>("/locations", input),
  update: (id: string, input: Partial<LocationInput>) =>
    api.patch<{ location: Location }>(`/locations/${id}`, input),
  // Not through portal-shared's `api` helper: that always JSON-encodes the
  // body, and a file upload needs multipart/form-data instead. Same session
  // cookie (credentials: "include"), same error envelope parsing.
  uploadLogo: async (id: string, file: File): Promise<{ location: Location }> => {
    const body = new FormData();
    body.append("logo", file);

    let response: Response;
    try {
      response = await fetch(`${adminApiPrefix()}/locations/${id}/logo`, {
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
    return payload as { location: Location };
  }
};

export const hoursApi = {
  list: (locationId: string) => api.get<{ days: BusinessHoursDay[] }>(`/locations/${locationId}/hours`),
  replace: (locationId: string, days: BusinessHoursDay[]) =>
    api.put<{ days: BusinessHoursDay[] }>(`/locations/${locationId}/hours`, { days })
};
