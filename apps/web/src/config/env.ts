interface EnvironmentConfig {
  apiUrl: string;
  websocketUrl: string;
  telemetryEnabled: boolean;
}

function readEnv(): EnvironmentConfig {
  const apiUrl =
    import.meta.env.NEXT_PUBLIC_API_URL ?? import.meta.env.VITE_API_URL ?? "/api";
  const websocketUrl =
    import.meta.env.NEXT_PUBLIC_WEBSOCKET_URL ??
    import.meta.env.VITE_WEBSOCKET_URL ??
    "";
  const telemetryEnabled =
    (import.meta.env.NEXT_PUBLIC_ENABLE_TELEMETRY ??
      import.meta.env.VITE_ENABLE_TELEMETRY ??
      "false") === "true";

  return {
    apiUrl,
    websocketUrl: websocketUrl || apiUrl.replace(/^http/, "ws"),
    telemetryEnabled,
  };
}

export const env = readEnv();
