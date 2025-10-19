import { Module } from "@nestjs/common";
import { ConfigModule, ConfigStore } from "@eddie/config";
import { DemoDataLoader } from "./demo-data.loader";

@Module({
  imports: [ConfigModule],
  providers: [ConfigStore, DemoDataLoader],
})
export class DemoDataApiModule {}
