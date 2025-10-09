import { Module } from "@nestjs/common";
import { ChatSessionsModule } from "./chat-sessions/chat-sessions.module";
import { TracesModule } from "./traces/traces.module";
import { LogsModule } from "./logs/logs.module";
import { RuntimeConfigModule } from "./runtime-config/runtime-config.module";
import { ConfigEditorModule } from "./config-editor/config-editor.module";
import { HealthController } from "./controllers/health.controller";

@Module({
  imports: [
    ChatSessionsModule,
    TracesModule,
    LogsModule,
    RuntimeConfigModule,
    ConfigEditorModule,
  ],
  controllers: [HealthController],
})
export class OpenApiModule {}
