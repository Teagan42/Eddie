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

  it("does not expose a path override field", () => {
    const dto = new ConfigSourcePayloadDto();

    expect("path" in dto).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(dto, "path")).toBe(false);
  });
});
