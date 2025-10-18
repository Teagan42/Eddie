import "reflect-metadata";
import { ParseUUIDPipe } from "@nestjs/common";
import { HTTP_CODE_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { describe, expect, it, vi } from "vitest";

import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { ChatSessionsController } from "../../../src/chat-sessions/chat-sessions.controller";
import { ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import { UpdateChatSessionDto } from "../../../src/chat-sessions/dto/update-chat-session.dto";
import { UpdateChatSessionCommand } from "../../../src/chat-sessions/commands/update-chat-session.command";
import { DeleteChatSessionCommand } from "../../../src/chat-sessions/commands/delete-chat-session.command";
import { CreateChatSessionDto } from "../../../src/chat-sessions/dto/create-chat-session.dto";
import { CreateChatSessionCommand } from "../../../src/chat-sessions/commands/create-chat-session.command";
import { GetChatSessionQuery } from "../../../src/chat-sessions/queries/get-chat-session.query";
import { GetChatMessagesQuery } from "../../../src/chat-sessions/queries/get-chat-messages.query";
import { SendChatMessageCommand } from "../../../src/chat-sessions/commands/send-chat-message.command";
import { CreateChatMessageDto } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import { ArchiveChatSessionCommand } from "../../../src/chat-sessions/commands/archive-chat-session.command";

type MockCommandBus = Pick<CommandBus, "execute">;
type MockQueryBus = Pick<QueryBus, "execute">;

describe("ChatSessionsController", () => {
  const createController = ({
    commandBus,
    queryBus,
  }: {
    commandBus?: MockCommandBus;
    queryBus?: MockQueryBus;
  } = {}): {
    controller: ChatSessionsController;
    commandBus: MockCommandBus;
    queryBus: MockQueryBus;
  } => {
    const mockCommandBus: MockCommandBus = {
      execute: vi.fn(),
      ...commandBus,
    };
    const mockQueryBus: MockQueryBus = {
      execute: vi.fn(),
      ...queryBus,
    };

    return {
      controller: new ChatSessionsController(
        mockCommandBus as CommandBus,
        mockQueryBus as QueryBus
      ),
      commandBus: mockCommandBus,
      queryBus: mockQueryBus,
    };
  };

  const getIdParamMetadata = (method: "rename" | "delete") => {
    const metadata =
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ChatSessionsController,
        method
      ) ?? {};

    return Object.values(metadata).find(
      (value: unknown) =>
        typeof value === "object" && value !== null && (value as { data?: string }).data === "id"
    ) as { pipes?: unknown[] } | undefined;
  };

  it.skip("renames a session via the service and returns the DTO", async () => {
    const dto: UpdateChatSessionDto = { title: "Updated" };
    const updated: ChatSessionDto = {
      id: "a3b54e59-6c07-4e92-b918-7a6f8503a3fa",
      title: dto.title!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };

    const { controller, commandBus } = createController({
      commandBus: {
        execute: vi.fn().mockResolvedValue(updated),
      },
    });

    await expect(controller.rename(updated.id, dto)).resolves.toBe(updated);
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const command = (commandBus.execute as unknown as ReturnType<
      typeof vi.fn
    >).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(UpdateChatSessionCommand);
    expect(command).toMatchObject({ sessionId: updated.id, dto });
  });

  it("uses ParseUUIDPipe on the :id parameter when renaming", () => {
    const idParam = getIdParamMetadata("rename");

    expect(idParam).toBeDefined();
    expect(idParam?.pipes ?? []).toContain(ParseUUIDPipe);
  });

  it.skip("deletes a session through the service", async () => {
    const id = "7e664c1f-690b-4b47-9ce3-03a4f418b226";
    const { controller, commandBus } = createController();
    (commandBus.execute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    await expect(controller.delete(id)).resolves.toBeUndefined();
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const command = (commandBus.execute as unknown as ReturnType<
      typeof vi.fn
    >).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteChatSessionCommand);
    expect(command).toMatchObject({ sessionId: id });
  });

  it("marks DELETE /chat-sessions/:id as returning 204", () => {
    const httpCode = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      ChatSessionsController.prototype.delete
    );

    expect(httpCode).toBe(204);
  });

  it("documents DELETE /chat-sessions/:id with ApiNoContentResponse", () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ChatSessionsController.prototype.delete
    ) as Record<string | number, unknown> | undefined;

    expect(responses).toBeDefined();
    expect(Object.keys(responses ?? {})).toContain("204");
  });

  it("uses ParseUUIDPipe on the :id parameter when deleting", () => {
    const idParam = getIdParamMetadata("delete");

    expect(idParam).toBeDefined();
    expect(idParam?.pipes ?? []).toContain(ParseUUIDPipe);
  });

  it.skip("archives a session through the command bus", async () => {
    const archived: ChatSessionDto = {
      id: "f29990d4-675b-4b30-a533-a11b7d1d0a71",
      title: "Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: new Date().toISOString(),
    };

    const { controller, commandBus } = createController({
      commandBus: {
        execute: vi.fn().mockResolvedValue(archived),
      },
    });

    await expect(controller.archive(archived.id)).resolves.toBe(archived);
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const command = (commandBus.execute as unknown as ReturnType<
      typeof vi.fn
    >).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(ArchiveChatSessionCommand);
    expect(command).toMatchObject({ sessionId: archived.id });
  });

  it.skip("creates a session through the command bus", async () => {
    const dto: CreateChatSessionDto = { title: "New session" };
    const created: ChatSessionDto = {
      id: "9c9c7f25-5b8f-49f3-9f10-2c0cbfdd8b31",
      title: dto.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };

    const { controller, commandBus } = createController({
      commandBus: {
        execute: vi.fn().mockResolvedValue(created),
      },
    });

    await expect(controller.create(dto)).resolves.toBe(created);
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const command = (commandBus.execute as unknown as ReturnType<
      typeof vi.fn
    >).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(CreateChatSessionCommand);
    expect(command).toMatchObject({ dto });
  });

  it("lists sessions through the query bus", async () => {
    const sessions: ChatSessionDto[] = [
      {
        id: "4a5e7d3e-0f5a-4bf5-8bb6-84d0a14318b1",
        title: "Session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: null,
      },
    ];

    const { controller, queryBus } = createController({
      queryBus: {
        execute: vi.fn().mockResolvedValue(sessions),
      },
    });

    await expect(controller.list()).resolves.toEqual(sessions);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    const query = (queryBus.execute as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(query?.constructor?.name).toBe("ListChatSessionsQuery");
  });

  it.skip("fetches a session via the query bus", async () => {
    const session: ChatSessionDto = {
      id: "f6f12f17-2d45-4331-9bd4-52d90d7c4c81",
      title: "Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };

    const { controller, queryBus } = createController({
      queryBus: {
        execute: vi.fn().mockResolvedValue(session),
      },
    });

    await expect(controller.get(session.id)).resolves.toBe(session);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    const query = (queryBus.execute as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(query).toBeInstanceOf(GetChatSessionQuery);
    expect(query).toMatchObject({ sessionId: session.id });
  });

  it.skip("lists session messages via the query bus", async () => {
    const messages = [];
    const sessionId = "5f4d2d47-8a64-4a6d-b58a-dc06fd44f4b1";

    const { controller, queryBus } = createController({
      queryBus: {
        execute: vi.fn().mockResolvedValue(messages),
      },
    });

    await expect(controller.listMessages(sessionId)).resolves.toBe(messages);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    const query = (queryBus.execute as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(query).toBeInstanceOf(GetChatMessagesQuery);
    expect(query).toMatchObject({ sessionId });
  });

  it.skip("creates a message through the command bus", async () => {
    const sessionId = "c8bc8a73-1d27-4f5c-b9c6-4d2a1aa946e1";
    const dto: CreateChatMessageDto = { role: "user", content: "hello" };
    const message = {
      id: "b7c8d17a-6fa4-4bde-b012-0d66d4e2c6db",
      sessionId,
      role: dto.role,
      content: dto.content,
      createdAt: new Date().toISOString(),
    };

    const { controller, commandBus } = createController({
      commandBus: {
        execute: vi.fn().mockResolvedValue({ message }),
      },
    });

    await expect(controller.createMessage(sessionId, dto)).resolves.toBe(message);
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const command = (commandBus.execute as unknown as ReturnType<
      typeof vi.fn
    >).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(SendChatMessageCommand);
    expect(command).toMatchObject({ sessionId, dto });
  });
});
