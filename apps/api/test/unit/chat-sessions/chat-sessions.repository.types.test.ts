import { describe, expectTypeOf, it } from "vitest";

import type {
  ChatSessionAgentInvocationMessageSnapshot,
} from "../../../src/chat-sessions/chat-sessions.repository";
import type { AgentInvocationMessageSnapshot } from "@eddie/types";

describe("ChatSessionsRepository type exports", () => {
  it("aliases agent invocation message snapshot to API contract", () => {
    expectTypeOf<ChatSessionAgentInvocationMessageSnapshot>().toEqualTypeOf<
      AgentInvocationMessageSnapshot
    >();
  });
});
