import { describe, expect, it, vi } from "vitest";
import { metrics, type Meter, type MeterProvider } from "@opentelemetry/api";
import { Test } from "@nestjs/testing";
import { ConfigStore } from "@eddie/config";
import {
  MetricsService,
  METRICS_BACKEND,
  METRICS_NAMESPACES,
  METRICS_METER_PROVIDER,
  metricsProviders,
  type MetricsBackend,
  type MetricsSnapshot,
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

  it("captures metrics internally for snapshot and reset", async () => {
    const backend: MetricsBackend = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: METRICS_BACKEND, useValue: backend },
      ],
    }).compile();

    const service = moduleRef.get(MetricsService);

    service.countMessage("user");
    service.observeToolCall({ name: "shell", status: "success" });
    service.countError("agent.failure");
    await service.timeOperation("loop", async () => undefined);

    const snapshot = service.snapshot();

    const expected: MetricsSnapshot = {
      counters: {
        "engine.messages.user": 1,
        "engine.tools.success": 1,
        "engine.errors.agent.failure": 1,
      },
      histograms: {
        "engine.timers.loop": expect.arrayContaining([expect.any(Number)]),
      },
    };

    expect(snapshot).toMatchObject(expected);

    service.reset();

    const afterReset = service.snapshot();

    expect(afterReset.counters).toEqual({});
    expect(afterReset.histograms).toEqual({});
  });

  it("forwards metrics to the OpenTelemetry backend when configured", async () => {
    const counter = { add: vi.fn() };
    const histogram = { record: vi.fn() };
    const meter: Meter = {
      createCounter: vi.fn(() => counter as any),
      createHistogram: vi.fn(() => histogram as any),
      createObservableCounter: vi.fn(),
      createObservableGauge: vi.fn(),
      createObservableUpDownCounter: vi.fn(),
      createUpDownCounter: vi.fn(),
      createGauge: vi.fn(),
      addBatchObservableCallback: vi.fn(),
      removeBatchObservableCallback: vi.fn(),
    } as unknown as Meter;

    const provider: MeterProvider = {
      getMeter: vi.fn(() => meter),
    };

    metrics.setGlobalMeterProvider(provider);

    try {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ...metricsProviders,
          {
            provide: ConfigStore,
            useValue: {
              getSnapshot: vi.fn(() => ({
                metrics: {
                  backend: {
                    type: "otel",
                    meterName: "eddie-engine",
                    meterVersion: "0.0.0-test",
                  },
                },
              })),
            },
          },
        ],
      }).compile();

      const backend = moduleRef.get<MetricsBackend>(METRICS_BACKEND);

      backend.incrementCounter("engine.messages.user", 3, { scope: "test" });
      backend.recordHistogram("engine.timers.loop", 17, { scope: "test" });

      expect(provider.getMeter).toHaveBeenCalledWith("eddie-engine", "0.0.0-test", {});
      expect(meter.createCounter).toHaveBeenCalledWith("engine.messages.user");
      expect(counter.add).toHaveBeenCalledWith(3, { scope: "test" });
      expect(meter.createHistogram).toHaveBeenCalledWith("engine.timers.loop");
      expect(histogram.record).toHaveBeenCalledWith(17, { scope: "test" });
    } finally {
      metrics.disable();
    }
  });

  it("uses an injected meter provider and flushes during shutdown", async () => {
    const counter = { add: vi.fn() };
    const histogram = { record: vi.fn() };
    const meter: Meter = {
      createCounter: vi.fn(() => counter as any),
      createHistogram: vi.fn(() => histogram as any),
      createObservableCounter: vi.fn(),
      createObservableGauge: vi.fn(),
      createObservableUpDownCounter: vi.fn(),
      createUpDownCounter: vi.fn(),
      createGauge: vi.fn(),
      addBatchObservableCallback: vi.fn(),
      removeBatchObservableCallback: vi.fn(),
    } as unknown as Meter;

    const provider = {
      getMeter: vi.fn(() => meter),
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
    } satisfies MeterProvider;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ...metricsProviders,
        {
          provide: ConfigStore,
          useValue: {
            getSnapshot: vi.fn(() => ({
              metrics: {
                backend: {
                  type: "otel",
                  meterName: "eddie-engine",
                  meterVersion: "0.0.0-test",
                },
              },
            })),
          },
        },
        {
          provide: METRICS_METER_PROVIDER,
          useValue: provider,
        },
      ],
    }).compile();

    const backend = moduleRef.get<MetricsBackend>(METRICS_BACKEND);

    backend.incrementCounter("engine.messages.user", 1);
    backend.recordHistogram("engine.timers.loop", 5);

    expect(provider.getMeter).toHaveBeenCalledWith("eddie-engine", "0.0.0-test", {});

    const service = moduleRef.get(MetricsService);
    await service.onModuleDestroy();

    expect(provider.forceFlush).toHaveBeenCalledTimes(1);
    expect(provider.shutdown).toHaveBeenCalledTimes(1);
  });
});
