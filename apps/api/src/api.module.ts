import {
  ConfigurableModuleBuilder,
  Module,
  type DynamicModule,
} from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
} from "@nestjs/core";
import {
  ConfigModule,
  type ConfigModuleOptions,
  type CliRuntimeOptions,
} from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule, createLoggerProviders } from "@eddie/io";
import { HealthController } from "./controllers/health.controller";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";
import { ApiValidationPipe } from "./validation.pipe";
import { ApiHttpExceptionFilter } from "./http-exception.filter";
import { ApiKeyGuard } from "./auth/api-key.guard";
import { RequestLoggingInterceptor } from "./logging.interceptor";
import { ApiCacheInterceptor } from "./cache.interceptor";
import { ChatSessionsModule } from "./chat-sessions/chat-sessions.module";
import { TracesModule } from "./traces/traces.module";
import { LogsModule } from "./logs/logs.module";
import { RuntimeConfigModule } from "./runtime-config/runtime-config.module";
import { UserPreferencesModule } from "./user-preferences/user-preferences.module";
import { OrchestratorModule } from "./orchestrator/orchestrator.module";
import { ConfigEditorModule } from "./config-editor/config-editor.module";
import { ProvidersModule } from "./providers/providers.module";

export type ApiModuleOptions = CliRuntimeOptions;

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ApiModuleOptions>({
    moduleName: "EddieApiModule",
  }).build();

const toConfigModuleOptions = (
  options: ApiModuleOptions = {},
): ConfigModuleOptions => ({ cliOptions: options });

const appendConfigImport = <T extends { imports?: DynamicModule[] }>(
  dynamicModule: T,
  configImport: DynamicModule,
) => ({
    ...dynamicModule,
    imports: [...(dynamicModule.imports ?? []), configImport],
  });

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true, cache: true }),
    ContextModule,
    IoModule,
    EngineModule,
    ChatSessionsModule,
    TracesModule,
    LogsModule,
    RuntimeConfigModule,
    ConfigEditorModule,
    UserPreferencesModule,
    OrchestratorModule,
    ProvidersModule,
  ],
  controllers: [HealthController],
  providers: [
    HttpLoggerMiddleware,
    ApiValidationPipe,
    ApiHttpExceptionFilter,
    ApiKeyGuard,
    RequestLoggingInterceptor,
    ApiCacheInterceptor,
    ...createLoggerProviders(),
    {
      provide: APP_PIPE,
      useExisting: ApiValidationPipe,
    },
    {
      provide: APP_FILTER,
      useExisting: ApiHttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useExisting: ApiKeyGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useExisting: RequestLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useExisting: ApiCacheInterceptor,
    },
  ],
})
export class ApiModule extends ConfigurableModuleClass {
  static forRoot(
    options?: ApiModuleOptions,
  ): ReturnType<typeof ConfigurableModuleClass["register"]> {
    const dynamicModule = super.register(options);
    const configImport = ConfigModule.register(
      toConfigModuleOptions(options),
    );

    return appendConfigImport(dynamicModule, configImport);
  }

  static forRootAsync(
    options: Parameters<typeof ConfigurableModuleClass["registerAsync"]>[0],
  ): ReturnType<typeof ConfigurableModuleClass["registerAsync"]> {
    const dynamicModule = super.registerAsync(options);
    const configImport = ConfigModule.registerAsync({
      inject: [{ token: MODULE_OPTIONS_TOKEN, optional: true }],
      useFactory: async (moduleOptions?: ApiModuleOptions) =>
        toConfigModuleOptions(moduleOptions),
    });

    return appendConfigImport(dynamicModule, configImport);
  }
}
