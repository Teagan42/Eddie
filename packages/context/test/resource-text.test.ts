import { describe, expect, it } from "vitest";
import type { PackedResource } from "@eddie/types";
import { formatResourceText } from "../src";

describe("formatResourceText", () => {
  const baseResource: PackedResource = {
    id: "resource-1",
    type: "template",
    text: "line one\nline two\n",
    metadata: {},
  };

  it("includes the resource label and optional description", () => {
    const resource: PackedResource = {
      ...baseResource,
      name: "Sample",
      description: "Details",
    };

    const result = formatResourceText(resource);

    expect(result).toBe(
      [
        "// Resource: Sample - Details",
        "line one",
        "line two",
        "// End Resource: Sample",
      ].join("\n")
    );
  });

  it("falls back to the resource id when name is missing", () => {
    const resource: PackedResource = {
      ...baseResource,
      text: "body\n",
    };

    const result = formatResourceText(resource);

    expect(result).toBe(
      [
        "// Resource: resource-1",
        "body",
        "// End Resource: resource-1",
      ].join("\n")
    );
  });

  it("omits the body when the text is empty after trimming", () => {
    const resource: PackedResource = {
      ...baseResource,
      text: "\n\n",
      name: "Trimmed",
    };

    const result = formatResourceText(resource);

    expect(result).toBe(
      [
        "// Resource: Trimmed",
        "// End Resource: Trimmed",
      ].join("\n")
    );
  });
});
