import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { App } from "./App";
import { SetupNeeded } from "./ui/SetupNeeded";
import { firebaseConfigured } from "./firebase";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      {firebaseConfigured ? (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      ) : (
        <SetupNeeded />
      )}
    </LocaleProvider>
  </StrictMode>,
);
