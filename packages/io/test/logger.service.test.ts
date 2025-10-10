import { describe, expect, it, vi } from "vitest";
import { LoggerService } from "../src/logger.service";

describe("LoggerService", () => {
  it("notifies listeners when logs are written", () => {
    const service = new LoggerService();
    service.configure({ level: "silent" } as never);
    const listener = vi.fn();
    const unregister = service.registerListener(listener);

    const logger = service.getLogger("test");
    logger.info({ foo: "bar" }, "hello");

    expect(listener).toHaveBeenCalledWith({
      level: "info",
      args: [
        { foo: "bar" },
        "hello",
      ],
    });

    unregister();
  });

  it("notifies listeners for loggers created with withBindings", () => {
    const service = new LoggerService();
    service.configure({ level: "silent" } as never);
    const listener = vi.fn();
    const unregister = service.registerListener(listener);

    const logger = service.withBindings({ requestId: "req-123" });
    logger.debug("bound log");

    expect(listener).toHaveBeenCalledWith({
      level: "debug",
      args: ["bound log"],
    });

    unregister();
  });
});
