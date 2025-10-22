import { describe, expect, it } from "vitest";

import {
  AgentExecutionTree,
  ChatWindow,
  CollapsiblePanel,
  SessionSelector,
} from "../../src/chat";
import {
  MessageComposer
} from "../../src/common";
import {
  ChatSessionsPanel,
  SessionDetail,
} from "../../src/overview";

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
