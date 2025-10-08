import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { HealthController } from "./controllers/health.controller";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule],
  controllers: [HealthController],
  providers: [HttpLoggerMiddleware],
})
export class ApiModule {}
