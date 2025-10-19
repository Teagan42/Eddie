import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { ChatSessionsModule } from "../chat-sessions/chat-sessions.module";
import { TracesModule } from "../traces/traces.module";
import { LogsModule } from "../logs/logs.module";
import { RuntimeConfigModule } from "../runtime-config/runtime-config.module";
import { DemoFixturesLoader } from "./demo-fixtures-loader.service";

@Module({
  imports: [
    ChatSessionsModule,
    TracesModule,
    LogsModule,
    RuntimeConfigModule,
    IoModule,
  ],
  providers: [DemoFixturesLoader],
})
export class DemoModule {}
