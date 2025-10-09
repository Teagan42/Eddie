import { Module } from "@nestjs/common";
import { RuntimeConfigService } from "./runtime-config.service";
import { RuntimeConfigController } from "./runtime-config.controller";
import { RuntimeConfigGateway } from "./runtime-config.gateway";

@Module({
  providers: [RuntimeConfigService, RuntimeConfigGateway],
  controllers: [RuntimeConfigController],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}
