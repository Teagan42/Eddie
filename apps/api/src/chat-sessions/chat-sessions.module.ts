import { Module, type Provider } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { EngineModule } from "@eddie/engine";
import { StreamRendererService } from "@eddie/io";
import { ConfigModule, ConfigStore } from "@eddie/config";
import { TracesModule } from "../traces/traces.module";
import { LogsModule } from "../logs/logs.module";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatSessionsController } from "./chat-sessions.controller";
import { ChatSessionsGateway } from "./chat-sessions.gateway";
import { ChatSessionsEngineListener } from "./chat-sessions-engine.listener";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import { ToolsModule } from "../tools/tools.module";
import { ChatSessionStreamRendererService } from "./chat-session-stream-renderer.service";
import { ChatSessionEventsService } from "./chat-session-events.service";
import { CHAT_SESSION_EVENT_CLASSES } from "@eddie/types";
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  SqliteChatSessionsRepository,
} from "./chat-sessions.repository";

export const CHAT_SESSIONS_REPOSITORY_PROVIDER: Provider = {
  provide: CHAT_SESSIONS_REPOSITORY,
  useFactory: (configStore: ConfigStore) => {
    const config = configStore.getSnapshot();
    const persistence = config.api?.persistence ?? { driver: "memory" };
    if (persistence.driver === "sqlite") {
      const filename =
                persistence.sqlite?.filename ?? "data/chat-sessions.sqlite";
      return new SqliteChatSessionsRepository({ filename });
    }
    return new InMemoryChatSessionsRepository();
  },
  inject: [ ConfigStore ],
};

const CHAT_SESSION_EVENT_PROVIDERS = [...CHAT_SESSION_EVENT_CLASSES];

@Module({
  imports: [
    EngineModule,
    TracesModule,
    LogsModule,
    ConfigModule,
    ToolsModule,
    CqrsModule,
  ],
  providers: [
    ChatSessionsService,
    ChatSessionsGateway,
    ChatMessagesGateway,
    ChatSessionEventsService,
    ChatSessionsEngineListener,
    ...CHAT_SESSION_EVENT_PROVIDERS,
    CHAT_SESSIONS_REPOSITORY_PROVIDER,
    {
      provide: StreamRendererService,
      useClass: ChatSessionStreamRendererService,
    },
    {
      provide: ChatSessionStreamRendererService,
      useExisting: StreamRendererService,
    },
  ],
  controllers: [ ChatSessionsController ],
  exports: [ ChatSessionsService ],
})
export class ChatSessionsModule {
  constructor(
        // Ensures the engine listener is instantiated so it can self-register
        private readonly _engineListener: ChatSessionsEngineListener
  ) { }
}
