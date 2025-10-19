import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrchestratorController } from "../../../src/orchestrator/orchestrator.controller";
import { OrchestratorMetadataService } from "../../../src/orchestrator/orchestrator.service";
import { ExecutionTreeStateStore } from "../../../src/orchestrator/execution-tree-state.store";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ExecutionTreeStateUpdatedEvent } from "@eddie/types";
import type { ExecutionTreeState } from "@eddie/types";

const defineParamTypes = (target: object, types: unknown[]): void => {
  Reflect.defineMetadata("design:paramtypes", types, target);
};

describe("OrchestratorController HTTP", () => {
  let app: INestApplication;
  let store: ExecutionTreeStateStore;

  beforeEach(async () => {
    defineParamTypes(OrchestratorController, [
      OrchestratorMetadataService,
      ExecutionTreeStateStore,
    ]);

    const moduleRef = await Test.createTestingModule({
      controllers: [OrchestratorController],
      providers: [
        ExecutionTreeStateStore,
        OrchestratorMetadataService,
        {
          provide: ChatSessionsService,
          useValue: {
            getSession: vi.fn(),
            listMessages: vi.fn(),
            listAgentInvocations: vi.fn(),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    store = app.get(ExecutionTreeStateStore);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns execution tree snapshots via GET /orchestrator/execution-state", async () => {
    const sessionId = "session-http";
    const state = createExecutionTreeState();

    store.handle(new ExecutionTreeStateUpdatedEvent(sessionId, state));

    const response = await request(app.getHttpServer())
      .get("/orchestrator/execution-state")
      .query({ sessionId })
      .expect(200);

    expect(response.body).toEqual(state);
  });
});

function createExecutionTreeState(): ExecutionTreeState {
  const timestamp = new Date("2024-07-01T12:00:00.000Z").toISOString();
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies ExecutionTreeState;
}
