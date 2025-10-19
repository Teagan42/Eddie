import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import { DemoDataLoader } from "./demo-data.loader";

@Module({
  imports: [ConfigModule],
  providers: [DemoDataLoader],
})
export class DemoDataApiModule {}
