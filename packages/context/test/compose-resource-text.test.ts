import { describe, expect, it } from "vitest";
import type { PackedResource } from "@eddie/types";
import { composeResourceText } from "@eddie/types";

describe("composeResourceText", () => {
  it("formats resource text with description and body", () => {
    const resource: PackedResource = {
      id: "example-id",
      type: "template",
      name: "Example",
      description: "Example description",
      text: "alpha\n beta\n", // trailing whitespace trimmed
    };

    const result = composeResourceText(resource);

    expect(result).toBe(
      [
        "// Resource: Example - Example description",
        "alpha",
        " beta",
        "// End Resource: Example",
      ].join("\n")
    );
  });
});
