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
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  SqliteChatSessionsRepository,
} from "./chat-sessions.repository";

const createUnsupportedDriverError = (driver: unknown): Error =>
  new Error(
    `Unsupported chat sessions persistence driver "${String(
      driver
    )}". Supported drivers: memory, sqlite. Set "api.persistence.driver" to either "memory" or "sqlite".`
  );

const UNSUPPORTED_SQL_DRIVERS = new Set(["postgres", "mysql", "mariadb"]);

export const CHAT_SESSIONS_REPOSITORY_PROVIDER: Provider = {
  provide: CHAT_SESSIONS_REPOSITORY,
  useFactory: (configStore: ConfigStore) => {
    const config = configStore.getSnapshot();
    const persistence = config.api?.persistence;
    const driver =
      typeof persistence?.driver === "string"
        ? persistence.driver
        : "memory";

    if (driver === "memory") {
      return new InMemoryChatSessionsRepository();
    }

    if (driver === "sqlite") {
      const sqliteConfig =
        persistence && "sqlite" in persistence
          ? persistence.sqlite
          : undefined;
      const filename =
        sqliteConfig?.filename ?? "data/chat-sessions.sqlite";
      return new SqliteChatSessionsRepository({ filename });
    }

    if (UNSUPPORTED_SQL_DRIVERS.has(driver)) {
      throw createUnsupportedDriverError(driver);
    }

    throw createUnsupportedDriverError(driver);
  },
  inject: [ ConfigStore ],
};

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
export class ChatSessionsModule {}
