import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");

let readmeContent: string;

describe("config README documentation", () => {
  beforeAll(() => {
    readmeContent = readFileSync(readmePath, "utf8");
  });

  it("details module structure and providers", () => {
    expect(readmeContent).toMatch(/# @eddie\/config configuration guide/i);
    expect(readmeContent).toMatch(/ConfigModule/);
    expect(readmeContent).toMatch(/ConfigService/);
    expect(readmeContent).toMatch(/ConfigWatcher/);
    expect(readmeContent).toMatch(/ConfigStore/);
    expect(readmeContent).toMatch(/CLI/i);
    expect(readmeContent).toMatch(/API/i);
  });

  it("explains configuration layering pipeline", () => {
    expect(readmeContent).toMatch(/defaults\s*→\s*file\s*→\s*CLI overrides/i);
    expect(readmeContent).toMatch(/migration/i);
    expect(readmeContent).toMatch(/extension/i);
    expect(readmeContent).toMatch(/preset/i);
  });

  it("covers runtime overrides and watcher hooks", () => {
    expect(readmeContent).toMatch(/parseCliRuntimeOptionsFromArgv/);
    expect(readmeContent).toMatch(/metrics/i);
    expect(readmeContent).toMatch(/watcher/i);
  });
});
