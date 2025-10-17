import {
  metrics,
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type MeterOptions,
  type MeterProvider,
} from "@opentelemetry/api";

import type { MetricsBackend } from "./metrics.service";

const DEFAULT_METER_NAME = "eddie-engine";

type MeterProviderWithLifecycle = MeterProvider & {
  forceFlush?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

export interface OtelMetricsBackendOptions {
  meter?: Meter;
  meterProvider?: MeterProviderWithLifecycle;
  meterName?: string;
  meterVersion?: string;
  meterOptions?: MeterOptions;
}

export class OtelMetricsBackend implements MetricsBackend {
  private readonly meter: Meter;
  private readonly meterProvider?: MeterProviderWithLifecycle;
  private readonly counters = new Map<string, Counter<Attributes>>();
  private readonly histograms = new Map<string, Histogram<Attributes>>();

  constructor(options: OtelMetricsBackendOptions = {}) {
    this.meterProvider = options.meterProvider;

    const provider = this.meterProvider ?? metrics;
    const meterName = options.meterName ?? DEFAULT_METER_NAME;
    const meterVersion = options.meterVersion;
    const meterOptions = options.meterOptions ?? {};

    this.meter = options.meter ?? provider.getMeter(meterName, meterVersion, meterOptions);
  }

  incrementCounter(
    metric: string,
    value = 1,
    labels?: Record<string, string>,
  ): void {
    const counter = this.getCounter(metric);
    counter.add(value, this.normalizeAttributes(labels));
  }

  recordHistogram(
    metric: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const histogram = this.getHistogram(metric);
    histogram.record(value, this.normalizeAttributes(labels));
  }

  async shutdown(): Promise<void> {
    if (!this.meterProvider) {
      return;
    }

    if (typeof this.meterProvider.forceFlush === "function") {
      await this.meterProvider.forceFlush();
    }

    if (typeof this.meterProvider.shutdown === "function") {
      await this.meterProvider.shutdown();
    }
  }

  private getCounter(metric: string): Counter<Attributes> {
    let counter = this.counters.get(metric);
    if (!counter) {
      counter = this.meter.createCounter(metric);
      this.counters.set(metric, counter);
    }

    return counter;
  }

  private getHistogram(metric: string): Histogram<Attributes> {
    let histogram = this.histograms.get(metric);
    if (!histogram) {
      histogram = this.meter.createHistogram(metric);
      this.histograms.set(metric, histogram);
    }

    return histogram;
  }

  private normalizeAttributes(labels?: Record<string, string>): Attributes | undefined {
    if (!labels) {
      return undefined;
    }

    return { ...labels } satisfies Attributes;
  }
}
