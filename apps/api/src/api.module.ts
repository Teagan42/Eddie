import { Module } from "@nestjs/common";
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
} from "@nestjs/core";
import { ConfigModule } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { HealthController } from "./controllers/health.controller";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";
import { ApiValidationPipe } from "./validation.pipe";
import { ApiHttpExceptionFilter } from "./http-exception.filter";
import { ApiKeyGuard } from "./auth/api-key.guard";
import { RequestLoggingInterceptor } from "./logging.interceptor";
import { ApiCacheInterceptor } from "./cache.interceptor";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule],
  controllers: [HealthController],
  providers: [
    HttpLoggerMiddleware,
    ApiValidationPipe,
    ApiHttpExceptionFilter,
    ApiKeyGuard,
    RequestLoggingInterceptor,
    ApiCacheInterceptor,
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
export class ApiModule {}
