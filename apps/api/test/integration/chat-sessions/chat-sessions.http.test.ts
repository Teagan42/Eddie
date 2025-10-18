import "reflect-metadata";
import { INestApplication, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CqrsModule, CommandBus, EventBus, QueryBus } from "@nestjs/cqrs";
import { WsAdapter } from "@nestjs/platform-ws";
import { ChatSessionsController } from "../../../src/chat-sessions/chat-sessions.controller";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
} from "../../../src/chat-sessions/chat-sessions.repository";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import { chatSessionCommandHandlers } from "../../../src/chat-sessions/commands";
import { chatSessionQueryHandlers } from "../../../src/chat-sessions/queries";
import { ChatSessionsGatewayEventsHandler } from "../../../src/chat-sessions/chat-sessions.gateway.events-handler";
import { ChatSessionsGateway } from "../../../src/chat-sessions/chat-sessions.gateway";
import { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";
import { ToolsGateway } from "../../../src/tools/tools.gateway";
import { ToolsModule } from "../../../src/tools/tools.module";
import {
  StartToolCallCommand,
  CompleteToolCallCommand,
} from "../../../src/tools/commands";
import { SendChatMessagePayloadDto } from "../../../src/chat-sessions/dto/send-chat-message.dto";
import { ChatSessionToolCallEvent, ChatSessionToolResultEvent } from "@eddie/types";
import { ChatMessageSent } from "../../../src/chat-sessions/events";

const UNKNOWN_SESSION_ID = "00000000-0000-0000-0000-000000000000";

const defineParamTypes = (target: object, types: unknown[]): void => {
  Reflect.defineMetadata("design:paramtypes", types, target);
};

describe("ChatSessionsController HTTP", () => {
  let app: INestApplication;
  let service: ChatSessionsService;
  let eventBus: EventBus;
  let commandBus: CommandBus;

  beforeEach(async () => {
    defineParamTypes(ChatSessionsController, [CommandBus, QueryBus]);

    for (const handler of chatSessionCommandHandlers) {
      defineParamTypes(handler, [ChatSessionsService]);
    }

    for (const handler of chatSessionQueryHandlers) {
      defineParamTypes(handler, [ChatSessionsService]);
    }

    defineParamTypes(ChatSessionsGatewayEventsHandler, [ChatSessionsGateway]);

    defineParamTypes(ChatSessionEventsService, [ChatMessagesGateway, CommandBus]);

    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule, ToolsModule],
      controllers: [ChatSessionsController],
      providers: [
        {
          provide: ChatSessionsService,
          useFactory: (
            repository: InMemoryChatSessionsRepository,
            bus: EventBus
          ) => new ChatSessionsService(repository, bus),
          inject: [CHAT_SESSIONS_REPOSITORY, EventBus],
        },
        ChatSessionsGatewayEventsHandler,
        ChatSessionsGateway,
        ChatMessagesGateway,
        ChatSessionEventsService,
        ToolsGateway,
        ...chatSessionCommandHandlers,
        ...chatSessionQueryHandlers,
        {
          provide: CHAT_SESSIONS_REPOSITORY,
          useClass: InMemoryChatSessionsRepository,
        },
      ],
    })
      .overrideProvider(ToolsGateway)
      .useValue({
        emitToolCall: vi.fn(),
        emitToolResult: vi.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.init();
    service = app.get(ChatSessionsService);
    eventBus = app.get(EventBus);
    commandBus = app.get(CommandBus);
  });

  afterEach(async () => {
    await app?.close();
  });

  it.skip("renames sessions via PATCH /chat-sessions/:id", async () => {
    const controller = app.get(ChatSessionsController);
    expect(controller).toBeInstanceOf(ChatSessionsController);

    const session = await service.createSession({ title: "Original" });

    const response = await request(app.getHttpServer())
      .patch(`/chat-sessions/${session.id}`)
      .send({ title: "Updated" })
      .expect(200);

    expect(response.body.title).toBe("Updated");
    const stored = await service.getSession(session.id);
    expect(stored.title).toBe("Updated");
  });

  it.skip("returns 404 when renaming unknown sessions", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/chat-sessions/${UNKNOWN_SESSION_ID}`)
      .send({ title: "Missing" });

    expect(response.status).toBe(404);
  });

  it.skip("archives sessions via PATCH /chat-sessions/:id/archive", async () => {
    const session = await service.createSession({ title: "Original" });
    const gateway = app.get(ChatSessionsGateway);
    const emitSpy = vi
      .spyOn(gateway, "emitSessionUpdated")
      .mockImplementation(() => undefined);

    const response = await request(app.getHttpServer())
      .patch(`/chat-sessions/${session.id}/archive`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: session.id,
      status: "archived",
    });

    await vi.waitFor(() =>
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id, status: "archived" })
      )
    );
  });

  it.skip("deletes sessions via DELETE /chat-sessions/:id", async () => {
    const controller = app.get(ChatSessionsController);
    expect(controller).toBeInstanceOf(ChatSessionsController);

    const session = await service.createSession({ title: "Disposable" });
    await service.addMessage(session.id, {
      role: ChatMessageRole.User,
      content: "hello",
    });

    await request(app.getHttpServer()).delete(`/chat-sessions/${session.id}`).expect(204);

    await expect(service.getSession(session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessages(session.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.skip("returns 404 when deleting unknown sessions", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/chat-sessions/${UNKNOWN_SESSION_ID}`)
      .expect(404);

    expect(response.status).toBe(404);
  });

  it.skip("forwards stream events to websocket gateways", async () => {
    const session = await service.createSession({ title: "Original" });
    const payload: SendChatMessagePayloadDto = {
      sessionId: session.id,
      message: { role: ChatMessageRole.User, content: "Hello" },
    };

    const gateway = app.get(ChatSessionsGateway);
    const emitSpy = vi
      .spyOn(gateway, "emitMessageCreated")
      .mockImplementation(() => undefined);
    const executeSpy = vi.spyOn(commandBus, "execute");

    await eventBus.publishAll([
      new ChatSessionToolCallEvent(
        session.id,
        "call-1",
        "tool",
        { foo: "bar" },
        new Date().toISOString(),
        "agent-123"
      ),
      new ChatSessionToolResultEvent(
        session.id,
        "call-1",
        "tool",
        { ok: true },
        new Date().toISOString(),
        "agent-123"
      ),
    ]);

    await request(app.getHttpServer())
      .post(`/chat-sessions/${session.id}/messages`)
      .send(payload.message)
      .expect(201);

    const messages = await service.listMessages(session.id);
    const latest = messages.at(-1);
    const sessionDto = await service.getSession(session.id);

    if (!latest) {
      throw new Error("Expected a chat message to be persisted");
    }

    await eventBus.publish(
      new ChatMessageSent(session.id, latest, "created", sessionDto)
    );

    await vi.waitFor(() => expect(emitSpy).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(
        executeSpy.mock.calls.some(([command]) => {
          if (!(command instanceof StartToolCallCommand)) {
            return false;
          }
          return command.input.agentId === "agent-123";
        })
      ).toBe(true)
    );
    await vi.waitFor(() =>
      expect(
        executeSpy.mock.calls.some(
          ([command]) =>
            command instanceof CompleteToolCallCommand &&
            command.input.agentId === "agent-123"
        )
      ).toBe(true)
    );
  });
});
