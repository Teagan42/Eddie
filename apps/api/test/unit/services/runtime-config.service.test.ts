import { describe, expect, it } from "vitest";
import { RuntimeConfigDto } from "../../../src/runtime-config/dto/runtime-config.dto";
import { RuntimeConfigService } from "../../../src/runtime-config/runtime-config.service";

class RuntimeConfigListenerSpy {
  updates = 0;
  onConfigChanged(): void {
    this.updates += 1;
  }
}

describe("RuntimeConfigService", () => {
  it("merges updates and notifies listeners", () => {
    const service = new RuntimeConfigService();
    const spy = new RuntimeConfigListenerSpy();
    service.registerListener(spy);

    const updated = service.update({ theme: "light" });
    expect(updated.theme).toBe("light");
    expect(spy.updates).toBe(1);
  });

  it("deep merges feature flags so unrelated defaults remain", () => {
    const service = new RuntimeConfigService();
    const received: RuntimeConfigDto[] = [];
    service.registerListener({
      onConfigChanged: (config) => {
        received.push(config);
      },
    });

    const updated = service.update({ features: { chat: false } });
    const expectedFeatures = {
      chat: false,
      logs: true,
      traces: true,
    } satisfies RuntimeConfigDto["features"];

    expect(updated.features).toEqual(expectedFeatures);
    expect(received).toHaveLength(1);
    expect(received[0].features).toEqual(expectedFeatures);
  });

  it("returns a cloned snapshot from get so external mutations do not leak", () => {
    const service = new RuntimeConfigService();

    const snapshot = service.get();
    snapshot.theme = "light";
    snapshot.features.chat = false;

    const nextRead = service.get();
    expect(nextRead.theme).toBe("dark");
    expect(nextRead.features.chat).toBe(true);
  });
});
