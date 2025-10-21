import { describe, expect, it } from "vitest";

import {
  AgentExecutionTree,
  ChatMessageContent,
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
  ChatWindowComposerRole,
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
    expect(typeof ChatMessageContent).toBe("function");
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

  it("describes the collapsible panel contract without UI dependencies", () => {
    type Expected = {
      id: string;
      title: string;
      description?: string;
      collapsed: boolean;
      onToggle: (id: string, collapsed: boolean) => void;
      className?: string;
    };

    expectTypeOf<CollapsiblePanelProps>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<CollapsiblePanelProps>();
    expectTypeOf<keyof CollapsiblePanelProps>().toEqualTypeOf<keyof Expected>();
    expectTypeOf<Extract<keyof CollapsiblePanelProps, "children">>().toEqualTypeOf<never>();
    expectTypeOf<CollapsiblePanelProps["id"]>().toEqualTypeOf<string>();
    expectTypeOf<CollapsiblePanelProps["title"]>().toEqualTypeOf<string>();
    expectTypeOf<CollapsiblePanelProps["description"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CollapsiblePanelProps["collapsed"]>().toEqualTypeOf<boolean>();
    expectTypeOf<CollapsiblePanelProps["onToggle"]>().toEqualTypeOf<
      (id: string, collapsed: boolean) => void
    >();
    expectTypeOf<CollapsiblePanelProps["className"]>().toEqualTypeOf<string | undefined>();
  });

  it("exposes composer role union for chat window", () => {
    expectTypeOf<ChatWindowComposerRole>().toEqualTypeOf<"user" | "system">();
  });
});
