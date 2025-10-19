import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import {
  normalizeConfigExtensionDescriptor,
  normalizeConfigExtensions,
  resolveConfigExtensionPath,
} from "../src/config-extensions";

const createLogger = () => ({ warn: vi.fn<(message: string) => void>() });

describe("config-extensions helpers", () => {
  it("normalizes extension references and ignores empty values", () => {
    const logger = createLogger();
    const entries = normalizeConfigExtensions(
      [
        " preset:cli-local  ",
        "api-host",
        "./relative.yaml",
        "  ",
        null as unknown as string,
      ],
      { logger },
    );

    expect(entries).toEqual([
      { type: "preset", id: "cli-local" },
      { type: "preset", id: "api-host" },
      { type: "file", path: "./relative.yaml" },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "[Config] Skipping empty config extension reference.",
    );
  });

  it("normalizes descriptor with id and path", () => {
    const logger = createLogger();
    const entries = normalizeConfigExtensionDescriptor(
      {
        id: "cli-local",
        path: "./config.ext.json",
      },
      { logger },
    );

    expect(entries).toEqual([
      { type: "preset", id: "cli-local" },
      { type: "file", path: "./config.ext.json" },
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("resolves relative extension paths using context and configuration paths", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-config-"));
    const mainConfigPath = path.join(tempDir, "eddie.json");
    const nestedDir = path.join(tempDir, "nested");
    await fs.mkdir(nestedDir);
    const nestedPath = path.join(nestedDir, "extension.yaml");
    await fs.writeFile(nestedPath, "logging:\n  level: info\n", "utf-8");

    const resolved = await resolveConfigExtensionPath(
      "./extension.yaml",
      {
        contextPath: path.join(nestedDir, "child.yaml"),
        configFilePath: mainConfigPath,
      },
    );

    expect(resolved).toBe(path.join(nestedDir, "extension.yaml"));
  });
});
