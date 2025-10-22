import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "@eddie/api-client";
import { env } from "../config/env.js";
import { useAuth } from "../auth/auth-context.js";

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }): JSX.Element {
  const { apiKey } = useAuth();
  const [client] = useState<ApiClient>(() =>
    createApiClient({
      baseUrl: env.apiUrl,
      websocketUrl: env.websocketUrl,
      apiKey: apiKey ?? undefined,
    })
  );

  useEffect(() => {
    client.updateAuth(apiKey ?? undefined);
  }, [client, apiKey]);

  useEffect(() => () => client.dispose(), [client]);

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error("useApi must be used within ApiProvider");
  }
  return context;
}
