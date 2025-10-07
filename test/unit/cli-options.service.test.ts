import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { CliOptionsService } from "../../src/cli/cli-options.service";

describe("CliOptionsService", () => {
  it("parses disable tool lists from CLI options", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      disableTools: ["bash", "edit"],
      tools: "format",
    });

    expect(result.disabledTools).toEqual(["bash", "edit"]);
    expect(result.tools).toEqual(["format"]);
  });

  it("splits comma-delimited disable strings", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      disableTools: "bash, edit",
    });

    expect(result.disabledTools).toEqual(["bash", "edit"]);
  });
});
