import { describe, expect, it } from "vitest";

import {
  AgentExecutionTree,
  ChatSessionsPanel,
  ChatWindow,
  CollapsiblePanel,
  MessageComposer,
  SessionDetail,
  SessionSelector,
} from "../../src/chat";

describe("chat barrel", () => {
  it("exposes reusable chat building blocks", () => {
    expect(typeof AgentExecutionTree).toBe("function");
    expect(typeof ChatSessionsPanel).toBe("function");
    expect(typeof ChatWindow).toBe("function");
    expect(typeof CollapsiblePanel).toBe("function");
    expect(typeof MessageComposer).toBe("function");
    expect(typeof SessionDetail).toBe("function");
    expect(typeof SessionSelector).toBe("function");
  });
});
