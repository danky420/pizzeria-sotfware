import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth, type Location } from "@chesare/portal-shared";
import { locationsApi } from "../api/locations";

const STORAGE_KEY = "chesare.admin.locationId";

interface LocationValue {
  locationId: string | null;
  location: Location | null;
  locations: Location[];
  canSwitch: boolean;
  setLocationId: (id: string) => void;
  isLoading: boolean;
  error: unknown;
}

const ActiveLocationContext = createContext<LocationValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ActiveLocationProvider({ children }: { children: ReactNode }) {
  const { user, location } = useAuth();
  const [picked, setPicked] = useState<string | null>(readStored);

  // Only a SUPER_ADMIN has no location of their own and may choose one; every
  // other role is pinned to theirs by the API anyway.
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list().then((response) => response.locations),
    enabled: isSuperAdmin
  });

  const value = useMemo<LocationValue>(() => {
    if (!isSuperAdmin) {
      return {
        locationId: user?.locationId ?? null,
        location,
        locations: location ? [location] : [],
        canSwitch: false,
        setLocationId: () => undefined,
        isLoading: false,
        error: null
      };
    }

    const locations = locationsQuery.data ?? [];
    const active = locations.find((item) => item.id === picked) ?? locations[0] ?? null;

    return {
      locationId: active?.id ?? null,
      location: active,
      locations,
      canSwitch: locations.length > 1,
      setLocationId: (id: string) => {
        setPicked(id);
        try {
          window.localStorage.setItem(STORAGE_KEY, id);
        } catch {
          // A blocked storage API only costs the remembered choice.
        }
      },
      isLoading: locationsQuery.isPending,
      error: locationsQuery.error
    };
  }, [isSuperAdmin, user?.locationId, location, locationsQuery.data, locationsQuery.isPending, locationsQuery.error, picked]);

  return <ActiveLocationContext.Provider value={value}>{children}</ActiveLocationContext.Provider>;
}

export function useActiveLocation(): LocationValue {
  const value = useContext(ActiveLocationContext);
  if (!value) throw new Error("useActiveLocation must be used inside ActiveLocationProvider");
  return value;
}

export function useLocationId(): string {
  const { locationId } = useActiveLocation();
  if (!locationId) throw new Error("No hay sucursal seleccionada");
  return locationId;
}
