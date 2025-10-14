import "reflect-metadata";
import { ParseUUIDPipe } from "@nestjs/common";
import { HTTP_CODE_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { describe, expect, it, vi } from "vitest";

import { ChatSessionsController } from "../../../src/chat-sessions/chat-sessions.controller";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import { UpdateChatSessionDto } from "../../../src/chat-sessions/dto/update-chat-session.dto";

describe("ChatSessionsController", () => {
  const createController = (
    overrides: Partial<ChatSessionsService> = {}
  ): { controller: ChatSessionsController; service: ChatSessionsService } => {
    const service = {
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
      ...overrides,
    } as unknown as ChatSessionsService;

    return { controller: new ChatSessionsController(service), service };
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

  it("renames a session via the service and returns the DTO", async () => {
    const dto: UpdateChatSessionDto = { title: "Updated" };
    const updated: ChatSessionDto = {
      id: "a3b54e59-6c07-4e92-b918-7a6f8503a3fa",
      title: dto.title!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };

    const { controller, service } = createController({
      renameSession: vi.fn().mockResolvedValue(updated),
    });

    await expect(controller.rename(updated.id, dto)).resolves.toBe(updated);
    expect(service.renameSession).toHaveBeenCalledWith(updated.id, dto);
  });

  it("uses ParseUUIDPipe on the :id parameter when renaming", () => {
    const idParam = getIdParamMetadata("rename");

    expect(idParam).toBeDefined();
    expect(idParam?.pipes ?? []).toContain(ParseUUIDPipe);
  });

  it("deletes a session through the service", async () => {
    const id = "7e664c1f-690b-4b47-9ce3-03a4f418b226";
    const { controller, service } = createController();

    await expect(controller.delete(id)).resolves.toBeUndefined();
    expect(service.deleteSession).toHaveBeenCalledWith(id);
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
});
