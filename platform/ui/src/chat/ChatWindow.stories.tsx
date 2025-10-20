import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import type { SessionMetrics } from "./ChatWindow";
import { ChatWindow } from "./ChatWindow";

const sampleMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Summarise the last session in three bullet points.",
    timestamp: "Just now",
  },
  {
    id: "2",
    role: "assistant" as const,
    content: "Here is what happened: Eddie compiled metrics and delivered insights.",
    timestamp: "A moment ago",
  },
];

const metrics: SessionMetrics = {
  tokensConsumed: 1260,
  latencyMs: 540,
  toolInvocations: 3,
};

const meta = {
  title: "Chat/Chat Window",
  component: ChatWindow,
  parameters: {
    layout: "centered",
  },
  args: {
    messages: sampleMessages,
    composerValue: "",
    onComposerValueChange: fn(),
    onComposerSubmit: fn(),
    sessionMetrics: metrics,
  },
  argTypes: {
    sessionMetrics: {
      control: { type: "object" },
    },
  },
} satisfies Meta<typeof ChatWindow>;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    sessionMetrics: metrics,
  },
};

export const Empty: Story = {
  args: {
    messages: [],
  },
};

export const ErrorState: Story = {
  args: {
    messages: [],
    errorState: (
      <div className="space-y-2 text-center">
        <p className="text-sm text-red-500">Unable to load messages.</p>
        <p className="text-xs text-muted-foreground">Retry once connectivity is restored.</p>
      </div>
    ),
  },
};

export const SessionMetrics: Story = {
  args: {
    sessionMetrics: {
      tokensConsumed: 420,
      latencyMs: 820,
      toolInvocations: 6,
    },
  },
};

export default meta;
