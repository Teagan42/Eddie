import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./pages";
import { AuthProvider } from "./auth/auth-context";
import { ApiProvider } from "./api/api-provider";
import { ThemeProvider } from "./theme";
import "@radix-ui/themes/styles.css";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
