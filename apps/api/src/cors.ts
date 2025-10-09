import type { INestApplication } from "@nestjs/common";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { ApiCorsConfig, EddieConfig } from "@eddie/config";

function normaliseList(value?: string | string[]): string | string[] | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value;
}

function buildCorsOptions(cors?: ApiCorsConfig): CorsOptions | null {
  if (cors?.enabled === false) {
    return null;
  }

  const options: CorsOptions = {
    origin: typeof cors?.origin !== "undefined" ? cors.origin : true,
    credentials:
      typeof cors?.credentials !== "undefined" ? cors.credentials : true,
  };

  const methods = normaliseList(cors?.methods);
  if (typeof methods !== "undefined") {
    options.methods = methods;
  }

  const allowedHeaders = normaliseList(cors?.allowedHeaders);
  if (typeof allowedHeaders !== "undefined") {
    options.allowedHeaders = allowedHeaders;
  }

  const exposedHeaders = normaliseList(cors?.exposedHeaders);
  if (typeof exposedHeaders !== "undefined") {
    options.exposedHeaders = exposedHeaders;
  }

  if (typeof cors?.maxAge === "number") {
    options.maxAge = cors.maxAge;
  }

  return options;
}

export function resolveCorsOptions(config: EddieConfig): CorsOptions | null {
  return buildCorsOptions(config.api?.cors);
}

export function applyCorsConfig(
  app: INestApplication,
  config: EddieConfig
): void {
  const corsOptions = resolveCorsOptions(config);
  if (!corsOptions) {
    return;
  }

  app.enableCors(corsOptions);
}
