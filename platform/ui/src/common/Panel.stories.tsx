import type { Meta, StoryObj } from "@storybook/react";
import { Panel } from "./Panel";

const baseActions = (
  <button className="rounded-full border px-3 py-1">Manage</button>
);

const baseChildren = (
  <div className="space-y-4">
    <p>
      Panels present high-level overviews and interactive controls for
      different agent workflows.
    </p>
    <ul className="list-disc pl-6 text-left">
      <li>Inject custom controls into the actions slot</li>
      <li>Provide semantic headings for accessibility</li>
      <li>Compose children for flexible content</li>
    </ul>
  </div>
);

const meta = {
  title: "Common/Panel",
  component: Panel,
  parameters: {
    layout: "centered",
  },
  args: {
    title: "Streaming Session",
    description: "Showcases agent context, history, and metrics",
    actions: baseActions,
    children: baseChildren,
  },
} satisfies Meta<typeof Panel>;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const loadingSkeleton = (
  <div className="space-y-3">
    <div className="h-4 w-full animate-pulse rounded bg-muted" />
    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
  </div>
);

export const Loading: Story = {
  args: {
    actions: (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        Loading session data…
      </div>
    ),
    children: loadingSkeleton,
  },
};

export const ErrorState: Story = {
  args: {
    actions: null,
    children: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-red-500">Unable to load</h3>
        <p>Check your network connection or retry after a few minutes.</p>
      </div>
    ),
  },
  parameters: {
    background: { default: "dark" },
  },
};

export default meta;
