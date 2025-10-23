import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { createMemoryModule, MemoryFacade } from "../src";

const shouldRun = process.env.RUN_MEMORY_SMOKE_TEST === "1";

describe.runIf(shouldRun)("memory integration smoke", () => {
  it("instantiates the module without errors", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        createMemoryModule({
          config: { enabled: false },
        }),
      ],
    }).compile();

    const facade = moduleRef.get(MemoryFacade);
    await expect(facade.recallMemories({ query: "noop" })).resolves.toEqual([]);
  });
});
