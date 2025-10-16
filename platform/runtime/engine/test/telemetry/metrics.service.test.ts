import { describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import {
  MetricsService,
  METRICS_BACKEND,
  METRICS_NAMESPACES,
  type MetricsBackend,
} from "../../src/telemetry/metrics.service";

describe("MetricsService", () => {
  it("records durations when timing operations", async () => {
    const backend: MetricsBackend = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
      shutdown: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: METRICS_BACKEND, useValue: backend },
        {
          provide: METRICS_NAMESPACES,
          useValue: {
            timers: "engine.timer",
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(MetricsService);
    const result = await service.timeOperation("template.render", async () => 42);

    expect(result).toBe(42);
    expect(backend.recordHistogram).toHaveBeenCalledTimes(1);
    const [metricName] = backend.recordHistogram.mock.calls[0] ?? [];
    expect(metricName).toBe("engine.timer.template.render");
  });
});
