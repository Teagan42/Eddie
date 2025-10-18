import { describe, expect, it, vi } from "vitest";
import type { CommandBus, QueryBus } from "@nestjs/cqrs";
import { RuntimeConfigController } from "../../../src/runtime-config/runtime-config.controller";
import { GetRuntimeConfigQuery } from "../../../src/runtime-config/queries/get-runtime-config.query";
import { UpdateRuntimeConfigCommand } from "../../../src/runtime-config/commands/update-runtime-config.command";
import type { RuntimeConfigDto } from "../../../src/runtime-config/dto/runtime-config.dto";

const runtimeConfig: RuntimeConfigDto = {
  apiUrl: "https://api.example.test",
  websocketUrl: "wss://ws.example.test",
  features: { chat: true },
  theme: "light",
};

describe("RuntimeConfigController", () => {
  it("retrieves runtime configuration through the query bus", async () => {
    const queryBus = {
      execute: vi.fn().mockResolvedValue(runtimeConfig),
    } as unknown as QueryBus;
    const commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus;
    const controller = new RuntimeConfigController(commandBus, queryBus);

    await expect(controller.get()).resolves.toEqual(runtimeConfig);
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({}),
    );
  });

  it("updates runtime configuration through the command bus", async () => {
    const queryBus = {
      execute: vi.fn(),
    } as unknown as QueryBus;
    const commandBus = {
      execute: vi.fn().mockResolvedValue(runtimeConfig),
    } as unknown as CommandBus;
    const controller = new RuntimeConfigController(commandBus, queryBus);

    await expect(controller.update({ theme: "dark" })).resolves.toEqual(
      runtimeConfig
    );
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        partial: { theme: "dark" },
      })
    );
  });
});
