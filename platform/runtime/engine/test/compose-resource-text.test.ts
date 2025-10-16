import { describe, expect, it } from "vitest";
import type { PackedResource } from "@eddie/types";
import { composeResourceText } from "@eddie/types";

describe("composeResourceText", () => {
  it("wraps resource text with labeled boundaries", () => {
    const resource: PackedResource = {
      id: "resource-123",
      type: "bundle",
      text: "first line\nsecond line\n\n",
    };

    const result = composeResourceText(resource);

    expect(result).toBe(
      [
        "// Resource: resource-123",
        "first line",
        "second line",
        "// End Resource: resource-123",
      ].join("\n")
    );
  });
});
