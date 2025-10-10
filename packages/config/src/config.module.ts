import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { ConfigService } from "./config.service";
import { eddieConfig } from "./config.namespace";

@Module({
  imports: [NestConfigModule.forFeature(eddieConfig)],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
