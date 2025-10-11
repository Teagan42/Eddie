import fs from "fs/promises";
import path from "path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { ConfigService } from "../src/config.service";
import { ConfigStore } from "../src/hot-config.store";
import { ConfigWatcher } from "../src/config-watcher";

function createHarness() {
  const service = new ConfigService();
  const store = new ConfigStore();
  const watcher = new ConfigWatcher(service, store);
  watcher.onModuleInit();
  return { service, store, watcher };
}

describe("ConfigWatcher", () => {
  const configRoot = path.join(process.cwd(), "tmp-config-watcher");

  beforeEach(async () => {
    await fs.rm(configRoot, { recursive: true, force: true });
    process.env.CONFIG_ROOT = "tmp-config-watcher";
  });

  afterEach(async () => {
    await fs.rm(configRoot, { recursive: true, force: true });
    delete process.env.CONFIG_ROOT;
  });

  it("updates the store when ConfigService writes a snapshot", async () => {
    const { service, store, watcher } = createHarness();

    try {
      await service.writeSource(
        "provider:\n  name: watched\nmodel: gpt-4o",
        "yaml"
      );

      const snapshot = store.getSnapshot();
      expect(snapshot.provider.name).toBe("watched");
      expect(snapshot.model).toBe("gpt-4o");
    } finally {
      watcher.onModuleDestroy();
    }
  });
});
