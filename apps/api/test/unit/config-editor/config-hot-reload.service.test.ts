import type { ConfigFileFormat, ConfigFileSnapshot, EddieConfig, EddieConfigInput } from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigHotReloadService } from "../../../src/config-editor/config-hot-reload.service";

describe("ConfigHotReloadService", () => {
  const source = "model: gpt-4";
  const format: ConfigFileFormat = "yaml";

  let configService: {
    parseSource: ReturnType<typeof vi.fn>;
    compose: ReturnType<typeof vi.fn>;
    writeSource: ReturnType<typeof vi.fn>;
  };
  let configStore: { setSnapshot: ReturnType<typeof vi.fn> };
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
    service = new ConfigHotReloadService(
      configService as never,
      configStore as never
    );
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
  });

  it("propagates write failures without storing a snapshot", async () => {
    const error = new Error("write failed");
    configService.writeSource.mockRejectedValue(error);

    await expect(service.persist(source, format)).rejects.toBe(error);

    expect(configService.parseSource).not.toHaveBeenCalled();
    expect(configService.compose).not.toHaveBeenCalled();
    expect(configStore.setSnapshot).not.toHaveBeenCalled();
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
  });
});
