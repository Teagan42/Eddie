import type { EddieConfigInput } from "../types";

const LOCAL_FRONTEND_ORIGIN = "http://localhost:5173";

export const apiHostPreset: EddieConfigInput = {
  api: {
    host: "127.0.0.1",
    port: 8080,
    telemetry: {
      enabled: true,
      consoleExporter: true,
    },
    cors: {
      enabled: true,
      origin: [LOCAL_FRONTEND_ORIGIN],
      credentials: true,
    },
  },
};
