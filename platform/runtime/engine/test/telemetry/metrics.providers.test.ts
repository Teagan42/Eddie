import { describe, expect, it, vi } from "vitest";
import { ConfigStore } from "@eddie/config";

import { LoggingMetricsBackend } from "../../src/telemetry/logging-metrics.backend";
import { METRICS_BACKEND, metricsProviders } from "../../src/telemetry/metrics.service";

describe("metricsProviders", () => {
  const getBackendFactory = () => {
    const backendProvider = metricsProviders.find(
      (provider) => "provide" in provider && provider.provide === METRICS_BACKEND
    );

    if (!backendProvider || typeof (backendProvider as any).useFactory !== "function") {
      throw new Error("METRICS_BACKEND provider must expose a factory");
    }

    return (backendProvider as any).useFactory as (configStore: ConfigStore) => unknown;
  };

  it("instantiates LoggingMetricsBackend when config requests logging backend", () => {
    const useFactory = getBackendFactory();
    const configStore = {
      getSnapshot: vi.fn(() => ({
        metrics: { backend: { type: "logging", level: "verbose" } },
      })),
    } as unknown as ConfigStore;

    const backend = useFactory(configStore);

    expect(configStore.getSnapshot).toHaveBeenCalled();
    expect(backend).toBeInstanceOf(LoggingMetricsBackend);
  });

  it("falls back to noop backend when metrics config is missing", () => {
    const useFactory = getBackendFactory();
    const configStore = {
      getSnapshot: vi.fn(() => ({})),
    } as unknown as ConfigStore;

    const backend = useFactory(configStore);

    expect(configStore.getSnapshot).toHaveBeenCalled();
    expect(backend).not.toBeInstanceOf(LoggingMetricsBackend);
    expect(typeof (backend as any).incrementCounter).toBe("function");
    expect(typeof (backend as any).recordHistogram).toBe("function");
  });
});
