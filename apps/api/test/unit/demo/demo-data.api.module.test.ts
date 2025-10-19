import path from "node:path";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ConfigStore } from "@eddie/config";
import { DemoDataApiModule } from "../../../src/demo-data/demo-data.api.module";
import { DemoFixtureValidationError } from "../../../src/demo-data/demo-fixture.validation-error";

class ConfigStoreStub {
  getSnapshot = vi.fn(() => ({
    api: {
      demoSeeds: {
        files: [
          path.join(
            __dirname,
            "fixtures",
            "invalid-demo-seed.json",
          ),
        ],
      },
    },
  }));

  setSnapshot = vi.fn();
}

describe("DemoDataApiModule", () => {
  it("fails to initialize when a demo fixture is invalid", async () => {
    expect.assertions(2);

    const moduleRef = await Test.createTestingModule({
      imports: [DemoDataApiModule],
    })
      .overrideProvider(ConfigStore)
      .useValue(new ConfigStoreStub())
      .compile();

    const app = moduleRef.createNestApplication();
    let appClosed = false;

    try {
      await app.init();
      await app.close();
      appClosed = true;

      throw new Error("DemoDataApiModule should reject invalid fixtures");
    } catch (error) {
      expect(error).toBeInstanceOf(DemoFixtureValidationError);
      expect((error as Error).message).toContain("events[0].timestamp");
    } finally {
      if (!appClosed) {
        await app.close().catch(() => undefined);
      }
    }
  });
});
