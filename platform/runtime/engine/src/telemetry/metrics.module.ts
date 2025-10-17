import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import {
  MetricsService,
  METRICS_BACKEND,
  METRICS_NAMESPACES,
  metricsProviders,
} from "./metrics.service";

const METRICS_MODULE_EXPORTS = [
  MetricsService,
  METRICS_BACKEND,
  METRICS_NAMESPACES,
] as const;

@Module({
  imports: [ConfigModule],
  providers: metricsProviders,
  exports: [...METRICS_MODULE_EXPORTS],
})
export class MetricsModule {}
