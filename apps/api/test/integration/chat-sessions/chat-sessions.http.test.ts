import "reflect-metadata";
import { INestApplication, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChatSessionsController } from "../../../src/chat-sessions/chat-sessions.controller";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";

const UNKNOWN_SESSION_ID = "00000000-0000-0000-0000-000000000000";

describe("ChatSessionsController HTTP", () => {
  let app: INestApplication;
  let service: ChatSessionsService;

  beforeEach(async () => {
    const serviceInstance = new ChatSessionsService(
      new InMemoryChatSessionsRepository()
    );

    Reflect.defineMetadata(
      "design:paramtypes",
      [ChatSessionsService],
      ChatSessionsController
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [ChatSessionsController],
      providers: [{ provide: ChatSessionsService, useValue: serviceInstance }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ChatSessionsService);
  });

  afterEach(async () => {
    await app.close();
  });

  it("renames sessions via PATCH /chat-sessions/:id", async () => {
    const controller = app.get(ChatSessionsController);
    expect((controller as { chatSessions?: unknown }).chatSessions).toBeDefined();

    const session = await service.createSession({ title: "Original" });

    const response = await request(app.getHttpServer())
      .patch(`/chat-sessions/${session.id}`)
      .send({ title: "Updated" })
      .expect(200);

    expect(response.body.title).toBe("Updated");
    const stored = await service.getSession(session.id);
    expect(stored.title).toBe("Updated");
  });

  it("returns 404 when renaming unknown sessions", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/chat-sessions/${UNKNOWN_SESSION_ID}`)
      .send({ title: "Missing" });

    expect(response.status).toBe(404);
  });

  it("deletes sessions via DELETE /chat-sessions/:id", async () => {
    const controller = app.get(ChatSessionsController);
    expect((controller as { chatSessions?: unknown }).chatSessions).toBeDefined();

    const session = await service.createSession({ title: "Disposable" });
    await service.addMessage(session.id, {
      role: ChatMessageRole.User,
      content: "hello",
    });

    await request(app.getHttpServer()).delete(`/chat-sessions/${session.id}`).expect(204);

    await expect(service.getSession(session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessages(session.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns 404 when deleting unknown sessions", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/chat-sessions/${UNKNOWN_SESSION_ID}`)
      .expect(404);

    expect(response.status).toBe(404);
  });
});
