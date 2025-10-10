import { registerAs } from "@nestjs/config";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";

type RuntimeTheme = RuntimeConfigDto["theme"];

function coerceTheme(value: string | undefined): RuntimeTheme {
  return value === "light" || value === "dark" ? value : "dark";
}

function coerceBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return fallback;
}

export const runtimeDefaults: RuntimeConfigDto = {
  apiUrl: "http://localhost:3000",
  websocketUrl: "ws://localhost:3000",
  features: {
    traces: true,
    logs: true,
    chat: true,
  },
  theme: "dark",
};

export function mergeRuntimeConfig(
  base: RuntimeConfigDto,
  overrides: Partial<RuntimeConfigDto> | undefined
): RuntimeConfigDto {
  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    features: {
      ...base.features,
      ...(overrides.features ?? {}),
    },
  };
}

export const runtimeConfig = registerAs(
  "runtime",
  (): RuntimeConfigDto =>
    mergeRuntimeConfig(runtimeDefaults, {
      apiUrl: process.env.NEXT_PUBLIC_API_URL ?? undefined,
      websocketUrl:
        process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? undefined,
      features: {
        traces: coerceBoolean(process.env.RUNTIME_FEATURE_TRACES, true),
        logs: coerceBoolean(process.env.RUNTIME_FEATURE_LOGS, true),
        chat: coerceBoolean(process.env.RUNTIME_FEATURE_CHAT, true),
      },
      theme: coerceTheme(process.env.RUNTIME_THEME),
    })
);
