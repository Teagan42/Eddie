import { describe, expect, it } from "vitest";
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
});
