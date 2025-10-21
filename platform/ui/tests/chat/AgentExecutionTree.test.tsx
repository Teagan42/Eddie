import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it } from "vitest";

import {
  AgentExecutionTree,
  createExecutionTreeStateFromMetadata,
  type ExecutionContextBundle,
  type ExecutionTreeState,
} from "../../src/chat";

describe("AgentExecutionTree", () => {
  it("groups tool invocations under each agent with previews and a details CTA", async () => {
    const user = userEvent.setup();
    const completedInvocation: ExecutionTreeState["toolInvocations"][number] = {
      id: "tool-1",
      agentId: "root-agent",
      name: "browse-web",
      status: "completed",
      createdAt: "2024-05-01T12:00:00.000Z",
      updatedAt: "2024-05-01T12:01:00.000Z",
      metadata: {
        args: { query: "latest weather updates near San Francisco, CA with details" },
        result: {
          output:
            "Partly cloudy with highs of 72°F. Expect light winds from the northwest and clear skies overnight.",
        },
      },
      children: [],
    } as ExecutionTreeState["toolInvocations"][number];
    const pendingInvocation: ExecutionTreeState["toolInvocations"][number] = {
      id: "tool-2",
      agentId: "root-agent",
      name: "fetch-weather",
      status: "pending",
      createdAt: "2024-05-01T12:02:00.000Z",
      updatedAt: "2024-05-01T12:02:00.000Z",
      metadata: { args: { location: "San Francisco, CA" } },
      children: [],
    } as ExecutionTreeState["toolInvocations"][number];
    const contextBundle: ExecutionContextBundle = {
      id: "bundle-1",
      label: "User Profile",
      summary: "Preferred travel destinations and preferences",
      sizeBytes: 128,
      fileCount: 1,
      files: [
        {
          path: "preferences.json",
          sizeBytes: 128,
          preview: '{"preferredCity":"San Francisco"}',
        },
      ],
      source: { type: "tool_result", agentId: "root-agent", toolCallId: "tool-1" },
    } as ExecutionContextBundle;

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: ["root-agent"],
          children: [],
        },
      ],
      toolInvocations: [completedInvocation, pendingInvocation],
      contextBundles: [contextBundle],
      agentLineageById: { "root-agent": ["root-agent"] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [pendingInvocation],
          running: [],
          completed: [completedInvocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { "root-agent": [contextBundle] },
      contextBundlesByToolCallId: { "tool-1": [contextBundle] },
      createdAt: "2024-05-01T12:00:00.000Z",
      updatedAt: "2024-05-01T12:02:00.000Z",
    } as ExecutionTreeState;

    const metadata = {
      executionTree,
    } as unknown;

    const tree = (
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />
    );

    render(tree);

    const agentSection = screen.getByRole("button", { name: /select orchestrator agent/i });
    expect(agentSection).toBeInTheDocument();

    const completedGroup = screen.getByRole("button", {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedGroup);

    const completedList = screen.getByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });
    const invocation = within(completedList).getByText(/browse-web/i);
    expect(invocation).toBeInTheDocument();
    expect(
      within(invocation.closest("li") as HTMLLIElement).getByText(/partly cloudy/i),
    ).toBeInTheDocument();

    const detailsButton = within(invocation.closest("li") as HTMLLIElement).getByRole("button", {
      name: /view full tool invocation details/i,
    });

    await user.click(detailsButton);

    expect(screen.getByRole("dialog", { name: /tool invocation details/i })).toBeInTheDocument();
    expect(screen.getByText(/preferences.json/)).toBeInTheDocument();
  });

  it("retains previews from invocation metadata when args and result fields are missing", async () => {
    const user = userEvent.setup();
    const invocation: ExecutionTreeState["toolInvocations"][number] = {
      id: "tool-with-metadata",
      agentId: "root-agent",
      name: "ingest-records",
      status: "completed",
      createdAt: "2024-05-01T12:03:00.000Z",
      updatedAt: "2024-05-01T12:03:30.000Z",
      metadata: {
        args: { source: "records.csv" },
        result: "All good",
      },
      children: [],
    } as ExecutionTreeState["toolInvocations"][number];

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: ["root-agent"],
          children: [],
        },
      ],
      toolInvocations: [invocation],
      contextBundles: [],
      agentLineageById: { "root-agent": ["root-agent"] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [invocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { "root-agent": [] },
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T12:00:00.000Z",
      updatedAt: "2024-05-01T12:03:30.000Z",
    } as ExecutionTreeState;

    const metadata = {
      executionTree,
    } as unknown;

    render(
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

    const agentSection = screen.getByRole("button", { name: /select orchestrator agent/i });
    await user.click(agentSection);

    const completedList = screen.getByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });

    expect(within(completedList).getByText(/ingest-records/i)).toBeInTheDocument();
    expect(within(completedList).getAllByText(/All good/i)[0]).toBeInTheDocument();
  });

  it("shows failed tool invocations grouped under the owning agent", async () => {
    const user = userEvent.setup();
    const failedInvocation: ExecutionTreeState["toolInvocations"][number] = {
      id: "tool-failed",
      agentId: "root-agent",
      name: "perform-analysis",
      status: "failed",
      createdAt: "2024-05-01T12:05:00.000Z",
      updatedAt: "2024-05-01T12:06:00.000Z",
      metadata: {
        args: { payload: { dataset: "records.json" } },
        error: { message: "Timed out" },
      },
      children: [],
    } as ExecutionTreeState["toolInvocations"][number];

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: ["root-agent"],
          children: [],
        },
      ],
      toolInvocations: [failedInvocation],
      contextBundles: [],
      agentLineageById: { "root-agent": ["root-agent"] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [],
          failed: [failedInvocation],
        },
      },
      contextBundlesByAgentId: { "root-agent": [] },
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T12:00:00.000Z",
      updatedAt: "2024-05-01T12:06:00.000Z",
    } as ExecutionTreeState;

    render(
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata({ executionTree } as unknown)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

    const agentSection = screen.getByRole("button", { name: /select orchestrator agent/i });
    await user.click(agentSection);

    const failedGroupToggle = screen.getByRole("button", {
      name: /toggle failed tool invocations for orchestrator/i,
    });
    await user.click(failedGroupToggle);

    const failedRegion = screen.getByRole("region", {
      name: /failed tool invocations for orchestrator/i,
    });

    expect(within(failedRegion).getByText(/perform-analysis/i)).toBeInTheDocument();
    expect(within(failedRegion).getByText(/Timed out/i)).toBeInTheDocument();
  });
});
