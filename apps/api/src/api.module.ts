import { Module } from "@nestjs/common";
import { ConfigModule } from "../../cli/src/config/config.module";
import { ContextModule } from "../../cli/src/core/context/context.module";
import { EngineModule } from "../../cli/src/core/engine/engine.module";
import { IoModule } from "../../cli/src/io/io.module";
import { HealthController } from "./controllers/health.controller";
import { HttpLoggerMiddleware } from "./middleware/http-logger.middleware";

@Module({
  imports: [ConfigModule, ContextModule, IoModule, EngineModule],
  controllers: [HealthController],
  providers: [HttpLoggerMiddleware],
})
export class ApiModule {}
