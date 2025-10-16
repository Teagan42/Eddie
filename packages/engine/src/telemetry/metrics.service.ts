import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { performance } from "node:perf_hooks";

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

export const METRICS_BACKEND = Symbol("ENGINE_METRICS_BACKEND");
export const METRICS_NAMESPACES = Symbol("ENGINE_METRICS_NAMESPACES");

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

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly namespaces: Required<MetricsNamespaceConfig>;

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
  }

  observeToolCall(details: { name: string; status: string }): void {
    const metric = this.composeMetric(this.namespaces.tools, details.status);
    this.backend.incrementCounter(metric, 1, { tool: details.name });
  }

  countError(metric: string): void {
    const name = this.composeMetric(this.namespaces.errors, metric);
    this.backend.incrementCounter(name);
  }

  async timeOperation<T>(metric: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const durationMs = performance.now() - start;
      const name = this.composeMetric(this.namespaces.timers, metric);
      this.backend.recordHistogram(name, durationMs);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (typeof this.backend.shutdown === "function") {
      await this.backend.shutdown();
    }
  }

  private composeMetric(namespace: string, metric: string): string {
    return `${ namespace }.${ metric }`;
  }
}

export const metricsProviders = [
  { provide: METRICS_BACKEND, useValue: new NoopMetricsBackend() },
  {
    provide: METRICS_NAMESPACES,
    useFactory: () => ({ ...DEFAULT_NAMESPACES }),
  },
  MetricsService,
];
