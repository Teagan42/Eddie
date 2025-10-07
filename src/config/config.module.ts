import { Module } from "@nestjs/common";
import { ConfigService } from "./loader";

@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
