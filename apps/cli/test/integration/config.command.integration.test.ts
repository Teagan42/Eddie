import "reflect-metadata";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigService } from "@eddie/config";

import type { CliArguments } from "../../src/cli/cli-arguments";
import { ConfigCommand, type ConfigWizardPrompter } from "../../src/cli/commands/config.command";

describe("ConfigCommand", () => {
  let tempDir: string;
  let originalConfigRoot: string | undefined;

  beforeEach(async () => {
    originalConfigRoot = process.env.CONFIG_ROOT;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-config-command-"));
    process.env.CONFIG_ROOT = tempDir;
  });

  afterEach(async () => {
    if (originalConfigRoot === undefined) {
      delete process.env.CONFIG_ROOT;
    } else {
      process.env.CONFIG_ROOT = originalConfigRoot;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes a config file using preset defaults and wizard overrides", async () => {
    const prompter: ConfigWizardPrompter = {
      prompt: vi.fn().mockResolvedValue({
        preset: "cli-local",
        format: "yaml",
        projectDir: "/workspace/project",
        model: "gpt-4o",
        provider: "openai",
      }),
    };

    const command = new ConfigCommand(new ConfigService(), prompter);
    const args: CliArguments = { command: "config", positionals: [], options: {} };

    await command.execute(args);

    const configPath = path.join(tempDir, "eddie.config.yaml");
    const contents = await fs.readFile(configPath, "utf-8");

    expect(contents).toContain("projectDir: /workspace/project");
    expect(contents).toContain("model: gpt-4o");
    expect(contents).toContain("provider:");
    expect(contents).toContain("name: openai");
    expect(contents).toContain("logging:");
    expect(contents).toContain("level: debug");
    expect(prompter.prompt).toHaveBeenCalledTimes(1);
  });
});
