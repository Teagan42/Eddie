import {
  ConfigurableModuleBuilder,
  Module,
  type DynamicModule,
} from "@nestjs/common";
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
} from "@nestjs/core";
import {
  ConfigModule,
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
import { DemoDataApiModule } from "./demo-data/demo-data.api.module";

const { ConfigurableModuleClass } = new ConfigurableModuleBuilder<CliRuntimeOptions>({
  moduleName: "EddieApiModule",
}).build();

type ConfigModuleAsyncOptions = Parameters<
  typeof ConfigurableModuleClass["registerAsync"]
>[0];

@Module({
  imports: [
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
    DemoDataApiModule,
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
  private static withConfigRegistration(
    dynamicModule: DynamicModule,
    configImport: DynamicModule,
  ): DynamicModule {
    const imports = dynamicModule.imports ?? [];

    return {
      ...dynamicModule,
      imports: [...imports, configImport],
    };
  }

  static forRoot(
    options: CliRuntimeOptions,
  ): DynamicModule {
    const dynamicModule = super.register(options);
    const configRegistration = ConfigModule.register(options);

    return this.withConfigRegistration(dynamicModule, configRegistration);
  }

  static forRootAsync(
    options: ConfigModuleAsyncOptions,
  ): DynamicModule {
    const dynamicModule = super.registerAsync(options);
    const configRegistration = ConfigModule.registerAsync(options);

    return this.withConfigRegistration(dynamicModule, configRegistration);
  }
}
