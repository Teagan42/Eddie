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
import type {
  AgentExecutionTreeProps,
  ChatSessionsPanelProps,
  ChatWindowProps,
  CollapsiblePanelProps,
  MessageComposerProps,
  SessionDetailProps,
  SessionSelectorProps,
} from "../../src/chat";
import { expectTypeOf } from "vitest";

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

describe("chat types", () => {
  it("exposes prop contracts for each primitive", () => {
    expectTypeOf<AgentExecutionTreeProps>().toMatchTypeOf<object>();
    expectTypeOf<ChatSessionsPanelProps>().toMatchTypeOf<object>();
    expectTypeOf<ChatWindowProps>().toMatchTypeOf<object>();
    expectTypeOf<CollapsiblePanelProps>().toMatchTypeOf<object>();
    expectTypeOf<MessageComposerProps>().toMatchTypeOf<object>();
    expectTypeOf<SessionDetailProps>().toMatchTypeOf<object>();
    expectTypeOf<SessionSelectorProps>().toMatchTypeOf<object>();
  });
});
