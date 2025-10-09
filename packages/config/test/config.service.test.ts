import { describe, expect, it } from "vitest";

import { ConfigService } from "../src/config.service";

describe("ConfigService", () => {
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
    });
  });
});
