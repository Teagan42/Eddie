import { describe, expect, it } from "vitest";

import { ConfigService, ConfigValidator, DEFAULT_CONFIG } from "@eddie/config";

describe("ConfigService integration", () => {
  it("composes defaults without requiring external dependencies", async () => {
    const service = new ConfigService(
      undefined,
      undefined,
      undefined,
      new ConfigValidator(),
      null,
    );

    const config = await service.compose({});

    expect(config.logLevel).toBe(DEFAULT_CONFIG.logLevel);
  });
});
