import type { ConfigFileSnapshot, EddieConfig, EddieConfigInput } from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigEditorController } from "../../../src/config-editor/config-editor.controller";
import { ConfigEditorService } from "../../../src/config-editor/config-editor.service";
import { ConfigSourcePayloadDto } from "../../../src/config-editor/dto/config-source-payload.dto";

interface ConfigEditorServiceMock {
  getSchemaBundle: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  preview: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

describe("ConfigEditorController", () => {
  let controller: ConfigEditorController;
  let service: ConfigEditorServiceMock;

  const snapshot: ConfigFileSnapshot = {
    path: "/tmp/eddie.config.yaml",
    format: "yaml",
    content: "model: gpt-4",
    input: { model: "gpt-4" } as EddieConfigInput,
    config: { model: "gpt-4", projectDir: process.cwd() } as EddieConfig,
    error: null,
  };

  beforeEach(() => {
    service = {
      getSchemaBundle: vi.fn(),
      getSnapshot: vi.fn(),
      preview: vi.fn(),
      save: vi.fn(),
    };

    controller = new ConfigEditorController(service as unknown as ConfigEditorService);
  });

  it("returns the schema bundle response", () => {
    service.getSchemaBundle.mockReturnValue({
      id: "schema-id",
      version: "1.2.3",
      schema: { $id: "schema" },
      inputSchema: { $id: "input" },
    });

    expect(controller.getSchema()).toEqual({
      id: "schema-id",
      version: "1.2.3",
      schema: { $id: "schema" },
      inputSchema: { $id: "input" },
    });
  });

  it("maps snapshot fields to the DTO shape", async () => {
    service.getSnapshot.mockResolvedValue(snapshot);

    await expect(controller.getSource()).resolves.toEqual({
      path: snapshot.path,
      format: snapshot.format,
      content: snapshot.content,
      input: snapshot.input,
      config: snapshot.config,
      error: snapshot.error,
    });
  });

  it("passes preview payloads through to the service", async () => {
    const result = {
      input: { model: "gpt-4o" } as EddieConfigInput,
      config: { model: "gpt-4o", projectDir: process.cwd() } as EddieConfig,
    };
    service.preview.mockResolvedValue(result);

    const payload = new ConfigSourcePayloadDto();
    payload.content = "{}";
    payload.format = "json";

    await expect(controller.preview(payload)).resolves.toEqual(result);
    expect(service.preview).toHaveBeenCalledWith(payload.content, payload.format);
  });

  it("returns the saved snapshot", async () => {
    service.save.mockResolvedValue(snapshot);

    const payload = new ConfigSourcePayloadDto();
    payload.content = "model: gpt-4";
    payload.format = "yaml";
    await expect(controller.save(payload)).resolves.toEqual({
      path: snapshot.path,
      format: snapshot.format,
      content: snapshot.content,
      input: snapshot.input,
      config: snapshot.config,
      error: snapshot.error,
    });

    expect(service.save).toHaveBeenCalledWith(
      payload.content,
      payload.format
    );
  });
});
