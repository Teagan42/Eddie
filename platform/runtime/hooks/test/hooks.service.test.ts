import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { HookBus } from "../src/hook-bus.service";
import { HooksService } from "../src/hooks.service";

describe("HooksService", () => {
  it("passes a logger to hook installer functions", async () => {
    const bus = new HookBus();
    const hookInstaller = vi.fn();
    const hookBusFactory = { create: vi.fn().mockResolvedValue(bus) };
    const hooksLoader = {
      importHookModule: vi.fn().mockResolvedValue(hookInstaller),
    };

    const service = new HooksService(
      hookBusFactory as unknown as any,
      hooksLoader as unknown as any
    );

    await service.load({ modules: ["./example"] } as any);

    expect(hookInstaller).toHaveBeenCalledWith(bus, expect.any(Logger));
  });
});
