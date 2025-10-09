import { BadRequestException } from "@nestjs/common";
import {
  EDDIE_CONFIG_SCHEMA_BUNDLE,
  type ConfigFileFormat,
  type ConfigFileSnapshot,
  type EddieConfig,
  type EddieConfigInput,
} from "@eddie/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigEditorService } from "../../../src/config-editor/config-editor.service";

interface ConfigServiceMock {
  readSnapshot: ReturnType<typeof vi.fn>;
  parseSource: ReturnType<typeof vi.fn>;
  compose: ReturnType<typeof vi.fn>;
  writeSource: ReturnType<typeof vi.fn>;
}

describe("ConfigEditorService", () => {
  let service: ConfigEditorService;
  let configService: ConfigServiceMock;

  const createSnapshot = (): ConfigFileSnapshot => ({
    path: "/tmp/eddie.config.yaml",
    format: "yaml",
    content: "model: gpt-4",
    input: { model: "gpt-4" } as EddieConfigInput,
    config: { model: "gpt-4" } as EddieConfig,
  });

  beforeEach(() => {
    configService = {
      readSnapshot: vi.fn(),
      parseSource: vi.fn(),
      compose: vi.fn(),
      writeSource: vi.fn(),
    };

    service = new ConfigEditorService(configService as never);
  });

  it("returns the exported schema bundle", () => {
    expect(service.getSchemaBundle()).toBe(EDDIE_CONFIG_SCHEMA_BUNDLE);
  });

  it("delegates snapshot retrieval to the config service", async () => {
    const snapshot = createSnapshot();
    configService.readSnapshot.mockResolvedValue(snapshot);

    await expect(service.getSnapshot()).resolves.toBe(snapshot);
    expect(configService.readSnapshot).toHaveBeenCalledWith({});
  });

  it("parses and composes preview payloads", async () => {
    const input: EddieConfigInput = { model: "gpt-4o" } as EddieConfigInput;
    const config: EddieConfig = { model: "gpt-4o" } as EddieConfig;

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

  it("persists configuration sources through the config service", async () => {
    const snapshot = createSnapshot();
    configService.writeSource.mockResolvedValue(snapshot);

    await expect(service.save("contents", "yaml", "./config.yaml"))
      .resolves.toBe(snapshot);

    expect(configService.writeSource).toHaveBeenCalledWith(
      "contents",
      "yaml",
      {},
      "./config.yaml"
    );
  });

  it("falls back to a friendly message when saving fails", async () => {
    configService.writeSource.mockRejectedValue("nope");

    const save = service.save("contents", "json" as ConfigFileFormat);

    await expect(save).rejects.toBeInstanceOf(BadRequestException);

    await save.catch((error) => {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: "Unable to process configuration payload.",
      });
    });
  });
});
