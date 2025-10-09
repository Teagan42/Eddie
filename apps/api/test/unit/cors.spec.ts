import { describe, expect, it, vi } from "vitest";
import { applyCorsConfig, resolveCorsOptions } from "../../src/cors";
import type { EddieConfig } from "@eddie/config";
import { DEFAULT_CONFIG } from "@eddie/config";

function cloneConfig(): EddieConfig {
  return structuredClone(DEFAULT_CONFIG);
}

describe("resolveCorsOptions", () => {
  it("returns default options when cors config is not provided", () => {
    const config = cloneConfig();
    config.api = { ...config.api, cors: undefined };

    const options = resolveCorsOptions(config);

    expect(options).toMatchObject({
      origin: true,
      credentials: true,
    });
  });

  it("returns null when cors is explicitly disabled", () => {
    const config = cloneConfig();
    config.api = {
      ...config.api,
      cors: {
        enabled: false,
      },
    };

    expect(resolveCorsOptions(config)).toBeNull();
  });

  it("applies custom cors properties", () => {
    const config = cloneConfig();
    config.api = {
      ...config.api,
      cors: {
        origin: ["https://example.com", "https://another.com"],
        methods: ["GET", "POST"],
        allowedHeaders: "content-type",
        exposedHeaders: ["x-custom"],
        credentials: false,
        maxAge: 600,
      },
    };

    expect(resolveCorsOptions(config)).toEqual({
      origin: ["https://example.com", "https://another.com"],
      methods: ["GET", "POST"],
      allowedHeaders: "content-type",
      exposedHeaders: ["x-custom"],
      credentials: false,
      maxAge: 600,
    });
  });
});

describe("applyCorsConfig", () => {
  it("enables cors on the application when options are available", () => {
    const config = cloneConfig();
    config.api = {
      ...config.api,
      cors: {
        origin: "https://example.com",
      },
    };

    const enableCors = vi.fn();
    const app = { enableCors } as unknown as Parameters<typeof applyCorsConfig>[0];

    applyCorsConfig(app, config);

    expect(enableCors).toHaveBeenCalledWith({
      origin: "https://example.com",
      credentials: true,
    });
  });

  it("skips configuration when cors is disabled", () => {
    const config = cloneConfig();
    config.api = {
      ...config.api,
      cors: {
        enabled: false,
      },
    };

    const enableCors = vi.fn();
    const app = { enableCors } as unknown as Parameters<typeof applyCorsConfig>[0];

    applyCorsConfig(app, config);

    expect(enableCors).not.toHaveBeenCalled();
  });
});
