import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { ConfigFileSnapshot } from "../src/config.service";
import { ConfigWatcher } from "../src/config-watcher";
import type { ConfigService } from "../src/config.service";
import { ConfigStore } from "../src/config.store";

describe("ConfigWatcher", () => {
  it("pushes emitted config snapshots into the store", () => {
    const writes$ = new Subject<ConfigFileSnapshot>();
    const configService = { writes$ } as unknown as ConfigService;
    const store = new ConfigStore();
    const spy = vi.spyOn(store, "setSnapshot");

    new ConfigWatcher(configService, store);

    const snapshot: ConfigFileSnapshot = {
      path: "config/eddie.config.yaml",
      format: "yaml",
      content: "name: Eddie",
      input: {} as ConfigFileSnapshot["input"],
      config: {
        agents: {},
      } as unknown as ConfigFileSnapshot["config"],
    };

    writes$.next(snapshot);

    expect(spy).toHaveBeenCalledWith(snapshot.config);
  });
});
