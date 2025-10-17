import {
  FactoryProvider,
  Inject,
  Injectable,
  OnModuleDestroy,
  Optional,
  type ValueProvider,
} from "@nestjs/common";
import type { MeterProvider } from "@opentelemetry/api";
import { ConfigStore } from "@eddie/config";
import type { MetricsConfig } from "@eddie/types";
import { performance } from "node:perf_hooks";
import { LoggingMetricsBackend } from "./logging-metrics.backend";
import { OtelMetricsBackend } from "./otel-metrics.backend";

export interface MetricsBackend {
  incrementCounter(
    metric: string,
    value?: number,
    labels?: Record<string, string>
  ): void;
  recordHistogram(
    metric: string,
    value: number,
    labels?: Record<string, string>
  ): void;
  shutdown?(): Promise<void> | void;
}

export interface MetricsNamespaceConfig {
  messages?: string;
  tools?: string;
  errors?: string;
  timers?: string;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, number[]>;
}

export const METRICS_BACKEND = Symbol("ENGINE_METRICS_BACKEND");
export const METRICS_NAMESPACES = Symbol("ENGINE_METRICS_NAMESPACES");
export const METRICS_METER_PROVIDER = Symbol("ENGINE_METRICS_METER_PROVIDER");

const DEFAULT_NAMESPACES: Readonly<Required<MetricsNamespaceConfig>> = {
  messages: "engine.messages",
  tools: "engine.tools",
  errors: "engine.errors",
  timers: "engine.timers",
};

class NoopMetricsBackend implements MetricsBackend {
  incrementCounter(): void {}
  recordHistogram(): void {}
}

function createMetricsBackend(
  config: MetricsConfig | undefined,
  meterProvider?: MeterProvider,
): MetricsBackend {
  const backendConfig = config?.backend;

  if (backendConfig?.type === "logging") {
    return new LoggingMetricsBackend({ level: backendConfig.level });
  }

  if (backendConfig?.type === "otel") {
    return new OtelMetricsBackend({
      meterName: backendConfig.meterName,
      meterVersion: backendConfig.meterVersion,
      meterProvider,
    });
  }

  return new NoopMetricsBackend();
}

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly namespaces: Required<MetricsNamespaceConfig>;
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();

  constructor(
    @Inject(METRICS_BACKEND) private readonly backend: MetricsBackend,
    @Optional()
    @Inject(METRICS_NAMESPACES)
    namespaces?: MetricsNamespaceConfig
  ) {
    this.namespaces = { ...DEFAULT_NAMESPACES, ...namespaces };
  }

  countMessage(role: string): void {
    const metric = this.composeMetric(this.namespaces.messages, role);
    this.backend.incrementCounter(metric);
    this.recordCounter(metric, 1);
  }

  observeToolCall(details: { name: string; status: string }): void {
    const metric = this.composeMetric(this.namespaces.tools, details.status);
    this.backend.incrementCounter(metric, 1, { tool: details.name });
    this.recordCounter(metric, 1);
  }

  countError(metric: string): void {
    const name = this.composeMetric(this.namespaces.errors, metric);
    this.backend.incrementCounter(name);
    this.recordCounter(name, 1);
  }

  async timeOperation<T>(metric: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const durationMs = performance.now() - start;
      const name = this.composeMetric(this.namespaces.timers, metric);
      this.backend.recordHistogram(name, durationMs);
      this.recordHistogram(name, durationMs);
    }
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }

  snapshot(): MetricsSnapshot {
    const counters = Object.fromEntries(this.counters) as Record<string, number>;
    const histograms = Object.fromEntries(
      Array.from(this.histograms.entries(), ([metric, values]) => [
        metric,
        [ ...values ],
      ])
    ) as Record<string, number[]>;

    return { counters, histograms };
  }

  async onModuleDestroy(): Promise<void> {
    if (typeof this.backend.shutdown === "function") {
      await this.backend.shutdown();
    }
  }

  private composeMetric(namespace: string, metric: string): string {
    return `${ namespace }.${ metric }`;
  }

  private recordCounter(metric: string, value: number): void {
    const current = this.counters.get(metric) ?? 0;
    this.counters.set(metric, current + value);
  }

  private recordHistogram(metric: string, value: number): void {
    const series = this.histograms.get(metric);
    if (series) {
      series.push(value);
      return;
    }

    this.histograms.set(metric, [ value ]);
  }
}

const metricsBackendProvider: FactoryProvider<MetricsBackend> = {
  provide: METRICS_BACKEND,
  useFactory: (
    configStore: ConfigStore,
    meterProvider?: MeterProvider,
  ): MetricsBackend => {
    const snapshot = configStore.getSnapshot();
    return createMetricsBackend(snapshot.metrics, meterProvider);
  },
  inject: [ConfigStore, METRICS_METER_PROVIDER],
};

const metricsNamespacesProvider: FactoryProvider<Required<MetricsNamespaceConfig>> = {
  provide: METRICS_NAMESPACES,
  useFactory: () => ({ ...DEFAULT_NAMESPACES }),
};

const metricsMeterProvider: ValueProvider<MeterProvider | undefined> = {
  provide: METRICS_METER_PROVIDER,
  useValue: undefined,
};

export const metricsProviders = [
  metricsBackendProvider,
  metricsNamespacesProvider,
  metricsMeterProvider,
  MetricsService,
];
