import { BadRequestException } from "@nestjs/common";
import { EDDIE_CONFIG_SCHEMA_BUNDLE } from "@eddie/config";
import type {
  ConfigFileFormat,
  ConfigFileSnapshot,
  EddieConfig,
  EddieConfigInput,
} from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigEditorService } from "../../../src/config-editor/config-editor.service";
import type { ConfigHotReloadService } from "../../../src/config-editor/config-hot-reload.service";

interface ConfigServiceMock {
  readSnapshot: ReturnType<typeof vi.fn>;
  parseSource: ReturnType<typeof vi.fn>;
  compose: ReturnType<typeof vi.fn>;
  writeSource: ReturnType<typeof vi.fn>;
}

interface ConfigStoreMock {
  getSnapshot: ReturnType<typeof vi.fn>;
}

describe("ConfigEditorService", () => {
  let service: ConfigEditorService;
  let configService: ConfigServiceMock;
  let hotReloadService: { persist: ReturnType<typeof vi.fn> };
  let configStore: ConfigStoreMock;

  const createSnapshot = (
    overrides: Partial<ConfigFileSnapshot> = {}
  ): ConfigFileSnapshot => ({
    path: "/tmp/eddie.config.yaml",
    format: "yaml",
    content: "model: gpt-4",
    input: { model: "gpt-4" } as EddieConfigInput,
    config: { model: "gpt-4", projectDir: process.cwd() } as EddieConfig,
    error: null,
    ...overrides,
  });

  beforeEach(() => {
    configService = {
      readSnapshot: vi.fn(),
      parseSource: vi.fn(),
      compose: vi.fn(),
      writeSource: vi.fn(),
    };

    hotReloadService = {
      persist: vi.fn(),
    } satisfies Pick<ConfigHotReloadService, "persist">;

    configStore = {
      getSnapshot: vi.fn(),
    } satisfies ConfigStoreMock;

    service = new ConfigEditorService(
      configService as never,
      hotReloadService as never,
      configStore as never
    );
  });

  it("returns the exported schema bundle", () => {
    expect(service.getSchemaBundle()).toBe(EDDIE_CONFIG_SCHEMA_BUNDLE);
  });

  it("delegates snapshot retrieval to the config service", async () => {
    const snapshot = createSnapshot();
    configService.readSnapshot.mockResolvedValue(snapshot);
    configStore.getSnapshot.mockReturnValue(snapshot.config);

    await expect(service.getSnapshot()).resolves.toEqual({
      ...snapshot,
      config: snapshot.config,
    });
    expect(configService.readSnapshot).toHaveBeenCalledWith();
  });

  it("populates the snapshot config from the config store", async () => {
    const snapshot = createSnapshot({ config: undefined });
    configService.readSnapshot.mockResolvedValue(snapshot);

    const storeConfig = { model: "gpt-4o", projectDir: process.cwd() } as EddieConfig;
    configStore.getSnapshot.mockReturnValue(storeConfig);

    await expect(service.getSnapshot()).resolves.toMatchObject({
      config: storeConfig,
    });

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("parses and composes preview payloads", async () => {
    const input: EddieConfigInput = { model: "gpt-4o" } as EddieConfigInput;
    const config: EddieConfig = {
      model: "gpt-4o",
      projectDir: process.cwd(),
    } as EddieConfig;

    configService.parseSource.mockReturnValue(input);
    configService.compose.mockResolvedValue(config);

    await expect(service.preview("{ }", "json")).resolves.toEqual({
      input,
      config,
    });

    expect(configService.parseSource).toHaveBeenCalledWith("{ }", "json");
    expect(configService.compose).toHaveBeenCalledWith(input, {});
  });

  it("wraps preview errors in a BadRequestException", async () => {
    configService.parseSource.mockImplementation(() => {
      throw new Error("invalid configuration");
    });

    const preview = service.preview("boom", "yaml");

    await expect(preview).rejects.toBeInstanceOf(BadRequestException);

    await preview.catch((error) => {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: "invalid configuration",
      });
    });
  });

  it("wraps unknown preview errors with a generic message", async () => {
    configService.compose.mockRejectedValue({});
    configService.parseSource.mockReturnValue({} as EddieConfigInput);

    const preview = service.preview("{}", "json");

    await expect(preview).rejects.toBeInstanceOf(BadRequestException);

    await preview.catch((error) => {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: "Unable to process configuration payload.",
      });
    });
  });

  it("persists configuration sources through the hot reload service", async () => {
    const snapshot = createSnapshot();
    hotReloadService.persist.mockResolvedValue(snapshot);

    await expect(service.save("contents", "yaml")).resolves.toBe(snapshot);

    expect(hotReloadService.persist).toHaveBeenCalledWith(
      "contents",
      "yaml"
    );
  });

  it("falls back to a friendly message when saving fails", async () => {
    hotReloadService.persist.mockRejectedValue("nope");

    const save = service.save("contents", "json" as ConfigFileFormat);

    await expect(save).rejects.toBeInstanceOf(BadRequestException);

    await save.catch((error) => {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: "Unable to process configuration payload.",
      });
    });
  });
});
