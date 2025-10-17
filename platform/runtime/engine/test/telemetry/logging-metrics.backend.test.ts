import { describe, expect, it, vi } from "vitest";

import { LoggingMetricsBackend } from "../../src/telemetry/logging-metrics.backend";

describe("LoggingMetricsBackend", () => {
  it("logs counter increments with default value and labels", () => {
    const debug = vi.fn();
    const backend = new LoggingMetricsBackend({
      logger: { debug } as unknown as Console,
      level: "debug",
      context: "MetricsTest",
    });

    backend.incrementCounter("engine.events", undefined, { foo: "bar" });

    expect(debug).toHaveBeenCalledWith(
      {
        event: "counter.increment",
        metric: "engine.events",
        value: 1,
        labels: { foo: "bar" },
      },
      "MetricsTest"
    );
  });
});
