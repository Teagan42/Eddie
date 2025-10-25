import type {
  ConfigFileFormat,
  ConfigFileSnapshot,
  EddieConfig,
  EddieConfigInput,
} from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigHotReloadService } from "../../../src/config-editor/config-hot-reload.service";
import { RuntimeConfigUpdated } from "../../../src/runtime-config/events/runtime-config-updated.event";

describe("ConfigHotReloadService", () => {
  const source = "model: gpt-4";
  const format: ConfigFileFormat = "yaml";

  let configService: {
    parseSource: ReturnType<typeof vi.fn>;
    compose: ReturnType<typeof vi.fn>;
    writeSource: ReturnType<typeof vi.fn>;
  };
  let configStore: { setSnapshot: ReturnType<typeof vi.fn> };
  let runtimeConfigService: { get: ReturnType<typeof vi.fn> };
  let eventBus: { publish: ReturnType<typeof vi.fn> };
  let service: ConfigHotReloadService;

  const input: EddieConfigInput = { model: "gpt-4" } as EddieConfigInput;
  const baseSnapshot: ConfigFileSnapshot = {
    path: "/tmp/eddie.config.yaml",
    format,
    content: source,
    input,
    error: null,
  };

  beforeEach(() => {
    configService = {
      parseSource: vi.fn(),
      compose: vi.fn(),
      writeSource: vi.fn(),
    };
    configStore = { setSnapshot: vi.fn() };
    runtimeConfigService = { get: vi.fn() };
    eventBus = { publish: vi.fn() };
    service = new ConfigHotReloadService(
      configService as never,
      configStore as never,
      runtimeConfigService as never,
      eventBus as never
    );
    runtimeConfigService.get.mockReturnValue({
      apiUrl: "https://api.example.test",
      websocketUrl: "wss://api.example.test",
      features: { chat: true, logs: true, traces: false },
      theme: "midnight",
    });
    eventBus.publish.mockReturnValue(undefined);
  });

  it("uses the snapshot config when available without recomposing", async () => {
    const snapshotConfig: EddieConfig = {
      model: "gpt-4",
      projectDir: process.cwd(),
      version: 1,
    } as EddieConfig;
    const snapshot: ConfigFileSnapshot = {
      ...baseSnapshot,
      config: snapshotConfig,
    };

    const composeError = new Error("compose should not run when snapshot has config");
    configService.compose.mockImplementation(() => {
      throw composeError;
    });
    configService.writeSource.mockResolvedValue(snapshot);

    await expect(service.persist(source, format)).resolves.toEqual(snapshot);

    expect(configService.parseSource).not.toHaveBeenCalled();
    expect(configService.compose).not.toHaveBeenCalled();
    expect(configService.writeSource).toHaveBeenCalledWith(source, format, {});
    expect(configStore.setSnapshot).toHaveBeenCalledWith(snapshotConfig);
    expect(runtimeConfigService.get).toHaveBeenCalledWith();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(
      RuntimeConfigUpdated
    );
  });

  it("propagates write failures without storing a snapshot", async () => {
    const error = new Error("write failed");
    configService.writeSource.mockRejectedValue(error);

    await expect(service.persist(source, format)).rejects.toBe(error);

    expect(configService.parseSource).not.toHaveBeenCalled();
    expect(configService.compose).not.toHaveBeenCalled();
    expect(configStore.setSnapshot).not.toHaveBeenCalled();
    expect(runtimeConfigService.get).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("fills in missing snapshot config by composing the written input", async () => {
    const snapshot: ConfigFileSnapshot = {
      ...baseSnapshot,
      config: undefined,
    };
    const fallbackConfig: EddieConfig = {
      model: "gpt-4",
      projectDir: process.cwd(),
    } as EddieConfig;

    configService.compose.mockResolvedValue(fallbackConfig);
    configService.writeSource.mockResolvedValue(snapshot);

    await expect(service.persist(source, format)).resolves.toEqual({
      ...snapshot,
      config: fallbackConfig,
    });

    expect(configService.parseSource).not.toHaveBeenCalled();
    expect(configService.compose).toHaveBeenCalledWith(
      input,
      {},
      { path: snapshot.path ?? undefined }
    );
    expect(configService.writeSource).toHaveBeenCalledWith(source, format, {});
    expect(configStore.setSnapshot).toHaveBeenCalledWith(fallbackConfig);
    expect(runtimeConfigService.get).toHaveBeenCalledWith();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(
      RuntimeConfigUpdated
    );
  });
});
