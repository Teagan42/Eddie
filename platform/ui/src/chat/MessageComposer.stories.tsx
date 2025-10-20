import type { Meta, StoryObj } from "@storybook/react";
import { MessageComposer } from "./MessageComposer";

const baseArgs = {
  disabled: false,
  value: "",
  placeholder: "Send a message",
  submitDisabled: false,
  onChange: () => undefined,
  onSubmit: () => undefined,
};

const meta = {
  title: "Chat/Message Composer",
  component: MessageComposer,
  parameters: {
    layout: "centered",
  },
  args: baseArgs,
  argTypes: {
    onChange: { action: "change" },
    onSubmit: { action: "submit" },
  },
} satisfies Meta<typeof MessageComposer>;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ...baseArgs,
    value: "How do I connect Eddie to a new workspace?",
  },
};

export const Loading: Story = {
  args: {
    ...baseArgs,
    disabled: true,
    value: "Let me know when the session is available.",
  },
};

export const Disabled: Story = {
  args: {
    ...baseArgs,
    submitDisabled: true,
    value: "Agent is paused for maintenance.",
  },
};

export const WithPlaceholder: Story = {
  args: {
    ...baseArgs,
    placeholder: "Ask Eddie about tool usage policies",
    value: "",
  },
};

export default meta;
