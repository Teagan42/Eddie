import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ConfigSourcePayloadDto } from "../../../src/config-editor/dto/config-source-payload.dto";

describe("ConfigSourcePayloadDto", () => {
  it("accepts valid YAML payloads", async () => {
    const dto = new ConfigSourcePayloadDto();
    dto.content = "model: gpt-4";
    dto.format = "yaml";

    const result = await validate(dto);
    expect(result).toHaveLength(0);
  });

  it("rejects unsupported formats", async () => {
    const dto = new ConfigSourcePayloadDto();
    dto.content = "{}";
    dto.format = "xml" as never;

    const result = await validate(dto);
    expect(result).not.toHaveLength(0);
    expect(result[0]?.constraints?.isIn).toContain("yaml");
  });

  it("rejects non-string content", async () => {
    const dto = new ConfigSourcePayloadDto();
    dto.content = 42 as never;
    dto.format = "json";

    const result = await validate(dto);
    expect(result.some((error) => error.property === "content")).toBe(true);
  });

  it("rejects non-string formats", async () => {
    const dto = new ConfigSourcePayloadDto();
    dto.content = "{}";
    dto.format = 42 as never;

    const result = await validate(dto);
    expect(result.some((error) => error.property === "format")).toBe(true);
  });
});
