import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { CliOptionsService } from "../../src/cli/cli-options.service";

describe("CliOptionsService", () => {
  it("parses disable tool lists from CLI options", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      disabledTools: ["bash", "edit"],
      tools: "format",
    });

    expect(result.disabledTools).toEqual(["bash", "edit"]);
    expect(result.tools).toEqual(["format"]);
  });

  it("splits comma-delimited disable strings", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      disabledTools: "bash, edit",
    });

    expect(result.disabledTools).toEqual(["bash", "edit"]);
  });

  it("marks context as disabled when requested", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      disableContext: true,
    });

    expect(result.disableContext).toBe(true);
  });

  it("passes through preset selections", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      preset: "api-host",
    });

    expect(result.preset).toBe("api-host");
  });

  it("accepts metrics backend overrides", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      metricsBackend: "logging",
      metricsLoggingLevel: "verbose",
    });

    expect(result.metricsBackend).toBe("logging");
    expect(result.metricsLoggingLevel).toBe("verbose");
  });

  it("passes through mem0 credential overrides", () => {
    const service = new CliOptionsService();
    const result = service.parse({
      mem0ApiKey: "cli-key",
      mem0Host: "https://mem0.example",
    });

    expect(result.mem0ApiKey).toBe("cli-key");
    expect(result.mem0Host).toBe("https://mem0.example");
  });
});
