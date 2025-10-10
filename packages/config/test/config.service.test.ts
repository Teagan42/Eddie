import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigService } from "../src/config.service";
import { DEFAULT_CONFIG } from "../src/defaults";

describe("ConfigService", () => {
  const cwd = process.cwd();
  const repoConfigDir = path.join(cwd, "config");
  const repoConfigFile = path.join(repoConfigDir, "eddie.config.yaml");
  const overrideConfigDir = path.join(cwd, "tmp-config");
  const overrideConfigFile = path.join(overrideConfigDir, "eddie.config.yaml");

  beforeEach(async () => {
    await fs.rm(repoConfigDir, { recursive: true, force: true });
    await fs.rm(overrideConfigDir, { recursive: true, force: true });
    delete process.env.CONFIG_ROOT;
  });

  afterEach(async () => {
    await fs.rm(repoConfigDir, { recursive: true, force: true });
    await fs.rm(overrideConfigDir, { recursive: true, force: true });
    delete process.env.CONFIG_ROOT;
  });

  describe("namespaced defaults", () => {
    const ServiceCtor = ConfigService as unknown as new (
      configService: {
        get: ReturnType<typeof vi.fn>;
      }
    ) => ConfigService;

    it("pulls defaults from the Nest config namespace when provided", async () => {
      const defaults = structuredClone(DEFAULT_CONFIG);
      defaults.api = {
        ...(defaults.api ?? {}),
        host: "192.0.2.10",
        port: 7777,
      };

      const configService = {
        get: vi.fn((key: string) => {
          if (key === "eddie") {
            return defaults;
          }

          return undefined;
        }),
      } as const;

      const service = new ServiceCtor(configService);

      const result = await service.compose({});

      expect(configService.get).toHaveBeenCalledWith("eddie", { infer: true });
      expect(result.api?.host).toBe("192.0.2.10");
      expect(result.api?.port).toBe(7777);
    });
  });

  describe("compose", () => {
    it("prefers API host and port provided by the config file", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          host: "127.0.0.1",
          port: 4242,
        },
      });

      expect(result.api?.host).toBe("127.0.0.1");
      expect(result.api?.port).toBe(4242);
    });

    it("falls back to defaults when the config omits host and port", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          telemetry: { enabled: true },
        },
      });

      expect(result.api?.host).toBe("0.0.0.0");
      expect(result.api?.port).toBe(3000);
      expect(result.api?.persistence?.driver).toBe("memory");
    });

    it("accepts sqlite persistence configuration", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          persistence: {
            driver: "sqlite",
            sqlite: { filename: "./tmp/chat.sqlite" },
          },
        },
      });

      expect(result.api?.persistence).toEqual({
        driver: "sqlite",
        sqlite: { filename: "./tmp/chat.sqlite" },
      });
    });
  });

  describe("load", () => {
    it("reads configuration from the repository config directory", async () => {
      await fs.mkdir(repoConfigDir, { recursive: true });
      await fs.writeFile(
        repoConfigFile,
        "api:\n  host: 127.0.0.1\n  port: 4545\n",
        "utf-8"
      );

      const service = new ConfigService();

      const result = await service.load({});

      expect(result.api?.host).toBe("127.0.0.1");
      expect(result.api?.port).toBe(4545);
    });

    it("honors CONFIG_ROOT overrides when present", async () => {
      await fs.mkdir(overrideConfigDir, { recursive: true });
      await fs.writeFile(
        overrideConfigFile,
        "api:\n  host: 10.0.0.1\n  port: 9090\n",
        "utf-8"
      );
      process.env.CONFIG_ROOT = overrideConfigDir;

      const service = new ConfigService();

      const result = await service.load({});

      expect(result.api?.host).toBe("10.0.0.1");
      expect(result.api?.port).toBe(9090);
    });
  });
});
