import { Module, type Provider } from "@nestjs/common";
import type { Knex } from "knex";
import { ModuleRef } from "@nestjs/core";
import { CqrsModule } from "@nestjs/cqrs";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { ConfigModule, ConfigStore } from "@eddie/config";
import { TracesModule } from "../traces/traces.module";
import { LogsModule } from "../logs/logs.module";
import { DatabaseModule } from "../persistence/database.module";
import { KNEX_INSTANCE } from "../persistence/knex.provider";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatSessionsController } from "./chat-sessions.controller";
import { ChatSessionsGateway } from "./chat-sessions.gateway";
import { ChatSessionsGatewayEventsHandler } from "./chat-sessions.gateway.events-handler";
import { ChatSessionsEngineListener } from "./chat-sessions-engine.listener";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import { ToolsModule } from "../tools/tools.module";
import { ChatSessionStreamRendererService } from "./chat-session-stream-renderer.service";
import { AgentStreamEventHandler } from "./agent-stream-event.handler";
import { ChatSessionEventsService } from "./chat-session-events.service";
import { chatSessionCommandHandlers } from "./commands";
import { chatSessionQueryHandlers } from "./queries";
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  KnexChatSessionsRepository,
} from "./chat-sessions.repository";

const createUnsupportedDriverError = (driver: unknown): Error =>
  new Error(
    `Unsupported chat sessions persistence driver "${String(
      driver
    )}". Supported drivers: memory, sqlite, postgres, mysql, mariadb.`
  );

export const CHAT_SESSIONS_REPOSITORY_PROVIDER: Provider = {
  provide: CHAT_SESSIONS_REPOSITORY,
  useFactory: (configStore: ConfigStore, moduleRef: ModuleRef) => {
    const config = configStore.getSnapshot();
    const persistence = config.api?.persistence;
    const driver =
      typeof persistence?.driver === "string"
        ? persistence.driver
        : "memory";

    const resolveKnex = (): Knex => {
      const knex = moduleRef.get<Knex>(KNEX_INSTANCE, { strict: false });
      if (!knex) {
        throw new Error(
          "DatabaseModule must provide a shared Knex instance for chat sessions persistence."
        );
      }
      return knex;
    };
    const createKnexRepository = (knex: Knex): KnexChatSessionsRepository =>
      new KnexChatSessionsRepository({ knex });

    switch (driver) {
      case "memory": {
        return new InMemoryChatSessionsRepository();
      }
      case "sqlite": {
        const knex = resolveKnex();
        if (typeof knex.raw === "function") {
          void knex.raw("PRAGMA foreign_keys = ON");
        }
        return createKnexRepository(knex);
      }
      case "postgres":
      case "mysql":
      case "mariadb": {
        return createKnexRepository(resolveKnex());
      }
      default: {
        throw createUnsupportedDriverError(driver);
      }
    }
  },
  inject: [ConfigStore, ModuleRef],
};

@Module({
  imports: [
    EngineModule,
    IoModule.register(),
    TracesModule,
    LogsModule,
    ConfigModule,
    ToolsModule,
    DatabaseModule,
    CqrsModule,
  ],
  providers: [
    ChatSessionsService,
    ChatSessionsGateway,
    ChatMessagesGateway,
    ChatSessionEventsService,
    ChatSessionsGatewayEventsHandler,
    ChatSessionsEngineListener,
    ...chatSessionCommandHandlers,
    ...chatSessionQueryHandlers,
    CHAT_SESSIONS_REPOSITORY_PROVIDER,
    ChatSessionStreamRendererService,
    AgentStreamEventHandler,
  ],
  controllers: [ ChatSessionsController ],
  exports: [ ChatSessionsService ],
})
export class ChatSessionsModule {}
