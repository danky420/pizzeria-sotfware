import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { configureApiBaseUrl } from "@chesare/portal-shared";
import { App } from "./App";
import "./styles.css";

// Empty in production: Fastify serves this SPA and the API from one origin, so
// the session cookie stays same-origin. Dev points it at the API's own port.
configureApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 401 or a 403 is an answer, not a blip; retrying them only delays the
      // redirect to /login or the "not allowed" notice.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000
    }
  }
});

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró el elemento #root");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* /admin/ in production, / in dev — see this app's vite.config.ts base. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
