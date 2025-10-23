import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  AgentExecutionTree,
  createExecutionTreeStateFromMetadata,
} from "../../src/chat";
import type {
  ExecutionContextBundle,
  ExecutionTreeState,
} from "@eddie/types";
import { OrchestratorAgentMetadataDto } from '@eddie/api-client';

const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

describe.skip("AgentExecutionTree", () => {
  it(
    "groups tool invocations under each agent with previews and a details CTA",
    async () => {
      const user = setupUser();
      const completedInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
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
      } as ExecutionTreeState[ "toolInvocations" ][ number ];
      const pendingInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
        id: "tool-2",
        agentId: "root-agent",
        name: "fetch-weather",
        status: "pending",
        createdAt: "2024-05-01T12:02:00.000Z",
        updatedAt: "2024-05-01T12:02:00.000Z",
        metadata: { args: { location: "San Francisco, CA" } },
        children: [],
      } as ExecutionTreeState[ "toolInvocations" ][ number ];
      const contextBundle: ExecutionContextBundle = {
        id: "bundle-1",
        label: "User Profile",
        summary: "Preferred travel destinations and preferences",
        sizeBytes: 128,
        fileCount: 1,
        files: [
          {
            id: "bundle-file-1",
            name: "preferences.json",
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
            lineage: [ "root-agent" ],
            children: [],
          },
        ],
        toolInvocations: [ completedInvocation, pendingInvocation ],
        contextBundles: [ contextBundle ],
        agentLineageById: { "root-agent": [ "root-agent" ] },
        toolGroupsByAgentId: {
          "root-agent": {
            pending: [ pendingInvocation ],
            running: [],
            completed: [ completedInvocation ],
            failed: [],
          },
        },
        contextBundlesByAgentId: { "root-agent": [ contextBundle ] },
        contextBundlesByToolCallId: { "tool-1": [ contextBundle ] },
        createdAt: "2024-05-01T12:00:00.000Z",
        updatedAt: "2024-05-01T12:02:00.000Z",
      } as ExecutionTreeState;

      const tree = (
        <AgentExecutionTree
          state={executionTree}
          selectedAgentId={null}
          onSelectAgent={() => { }}
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

      const dialog = await screen.findByRole(
        "dialog",
        { name: /tool invocation details/i },
        { timeout: 10_000 },
      );
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText(/preferences.json/)).toBeInTheDocument();
    },
    15_000,
  );

  it("retains previews from invocation metadata when args and result fields are missing", async () => {
    const user = setupUser();
    const invocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
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
    } as ExecutionTreeState[ "toolInvocations" ][ number ];

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: [ "root-agent" ],
          children: [],
        },
      ],
      toolInvocations: [ invocation ],
      contextBundles: [],
      agentLineageById: { "root-agent": [ "root-agent" ] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [ invocation ],
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
        onSelectAgent={() => { }}
      />,
    );

    const agentSection = screen.getByRole("button", { name: /select orchestrator agent/i });
    await user.click(agentSection);

    const completedToggle = screen.getByRole("button", {
      name: /toggle completed tool invocations for orchestrator/i,
    });

    await waitFor(() => {
      expect(completedToggle).toHaveAttribute("aria-expanded", "true");
    });

    const completedList = screen.getByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });

    expect(within(completedList).getByText(/ingest-records/i)).toBeInTheDocument();
    expect(
      within(completedList).getByText(/All good/i, { selector: 'span.rt-Text' }),
    ).toBeInTheDocument();
  });

  it("shows context bundle labels when titles are absent",
    async () => {
      const user = setupUser();

      const completedInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
        id: "tool-with-bundle",
        agentId: "root-agent",
        name: "bundle-tool",
        status: "completed",
        createdAt: "2024-05-01T12:10:00.000Z",
        updatedAt: "2024-05-01T12:11:00.000Z",
        metadata: { args: { source: "bundle" } },
        children: [],
      } as ExecutionTreeState[ "toolInvocations" ][ number ];

      const contextBundle: ExecutionContextBundle = {
        id: "bundle-context",
        label: "Research briefing",
        summary: "Key findings and sources",
        sizeBytes: 256,
        fileCount: 1,
        files: [
          {
            id: "bundle-file",
            name: "notes.md",
            path: "notes.md",
            sizeBytes: 256,
          },
        ],
        source: { type: "tool_result", agentId: "root-agent", toolCallId: "tool-with-bundle" },
      } as ExecutionContextBundle;

      const executionTree: ExecutionTreeState = {
        agentHierarchy: [
          {
            id: "root-agent",
            name: "orchestrator",
            provider: "openai",
            model: "gpt-4o",
            depth: 0,
            lineage: [ "root-agent" ],
            children: [],
          },
        ],
        toolInvocations: [ completedInvocation ],
        contextBundles: [ contextBundle ],
        agentLineageById: { "root-agent": [ "root-agent" ] },
        toolGroupsByAgentId: {
          "root-agent": {
            pending: [],
            running: [],
            completed: [ completedInvocation ],
            failed: [],
          },
        },
        contextBundlesByAgentId: { "root-agent": [ contextBundle ] },
        contextBundlesByToolCallId: { "tool-with-bundle": [ contextBundle ] },
        createdAt: "2024-05-01T12:10:00.000Z",
        updatedAt: "2024-05-01T12:11:00.000Z",
      } as ExecutionTreeState;

      render(
        <AgentExecutionTree
          state={executionTree}
          selectedAgentId={null}
          onSelectAgent={() => { }}
        />,
      );

      const agentToggle = screen.getByRole("button", { name: /select orchestrator agent/i });
      await user.click(agentToggle);

      const completedToggle = screen.getByRole("button", {
        name: /toggle completed tool invocations for orchestrator/i,
      });

      await user.click(completedToggle);

      const completedRegion = await screen.findByRole(
        "region",
        { name: /completed tool invocations for orchestrator/i },
        { timeout: 10_000 },
      );

      const detailsButton = within(completedRegion).getByRole("button", {
        name: /view full tool invocation details/i,
      });

      await user.click(detailsButton);
      try {
        const dialog = await screen.findByText(
          (content: string, element: Element | null) =>
            content.toLowerCase().includes("tool invocation details"),
          { exact: false },
          { timeout: 10_000 },
        );

        expect(dialog).toBeInTheDocument();
        await user.click(await screen.findByRole("button", {
          name: /toggle contextbundles/i,
        }));
        const contextBundlesRegion = await screen.findByTestId("json-entry-contextBundles[0]");
        await user.click(await within(contextBundlesRegion).findByRole("button"));
        const researchBriefingTexts = await screen.findAllByText(/research briefing/i, {}, { timeout: 10_000 });
        expect(researchBriefingTexts[ 0 ]).toBeInTheDocument();
      } catch (error) {
        screen.debug(document.body, Infinity);
        throw error;
      }
    },
    15_000,
  );

  it("opens tool invocation details for nested entries", async () => {
    const user = setupUser();

    const nestedInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
      id: "child-invocation",
      agentId: "root-agent",
      name: "summarize-report",
      status: "completed",
      createdAt: "2024-05-01T12:12:00.000Z",
      updatedAt: "2024-05-01T12:12:30.000Z",
      metadata: { result: { summary: "Key findings" } },
      children: [],
    } as ExecutionTreeState[ "toolInvocations" ][ number ];

    const rootInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
      id: "root-invocation",
      agentId: "root-agent",
      name: "delegate-analysis",
      status: "completed",
      createdAt: "2024-05-01T12:11:00.000Z",
      updatedAt: "2024-05-01T12:11:30.000Z",
      metadata: { result: { status: "done" } },
      children: [],
    } as ExecutionTreeState[ "toolInvocations" ][ number ];

    const state = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: [ "root-agent" ],
          children: [],
        },
      ],
      toolInvocations: [ rootInvocation ],
      contextBundles: [],
      agentLineageById: { "root-agent": [ "root-agent" ] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [ rootInvocation, nestedInvocation ],
          failed: [],
        },
      },
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T12:10:00.000Z",
      updatedAt: "2024-05-01T12:13:00.000Z",
    } satisfies ExecutionTreeState;

    render(
      <AgentExecutionTree state={state} selectedAgentId={null} onSelectAgent={() => { }} />,
    );

    const agentToggle = screen.getByRole("button", { name: /select orchestrator agent/i });
    await user.click(agentToggle);

    const completedToggle = screen.getByRole("button", {
      name: /toggle completed tool invocations for orchestrator/i,
    });

    await user.click(completedToggle);

    const completedRegion = await screen.findByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });

    const nestedInvocationEntry = within(completedRegion).getByText(/summarize-report/i).closest("li");
    if (!nestedInvocationEntry) {
      throw new Error("Expected nested invocation entry to be present");
    }

    const nestedDetailsButton = within(nestedInvocationEntry).getByRole("button", {
      name: /view full tool invocation details/i,
    });

    await user.click(nestedDetailsButton);
    try {
      const dialog = await screen.findByRole("dialog", {
        name: /tool invocation details/i,
      }, { timeout: 10_000 });

      expect(dialog).toHaveAccessibleName(/tool invocation details/i);
    } catch (error) {
      screen.debug(document.body, Infinity);
      throw error;
    }
  });

  it("retains tool invocation details when groups change after opening", async () => {
    const user = setupUser();

    const nestedInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
      id: "child-invocation",
      agentId: "delegate-agent",
      name: "summarize-report",
      status: "completed",
      createdAt: "2024-05-01T12:12:00.000Z",
      updatedAt: "2024-05-01T12:12:30.000Z",
      metadata: { result: { summary: "Key findings" } },
      children: [],
    } as ExecutionTreeState[ "toolInvocations" ][ number ];

    const rootInvocation: ExecutionTreeState[ "toolInvocations" ][ number ] = {
      id: "root-invocation",
      agentId: "root-agent",
      name: "delegate-analysis",
      status: "completed",
      createdAt: "2024-05-01T12:11:00.000Z",
      updatedAt: "2024-05-01T12:11:30.000Z",
      metadata: { result: { status: "done" } },
      children: [],
    } as ExecutionTreeState[ "toolInvocations" ][ number ];

    const initialState = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: [ "root-agent" ],
          children: [],
        },
      ],
      toolInvocations: [ rootInvocation ],
      contextBundles: [],
      agentLineageById: { "root-agent": [ "root-agent" ] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [ rootInvocation, nestedInvocation ],
          failed: [],
        },
      },
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T12:10:00.000Z",
      updatedAt: "2024-05-01T12:13:00.000Z",
    } satisfies ExecutionTreeState;

    const { rerender } = render(
      <AgentExecutionTree
        state={initialState}
        selectedAgentId={null}
        onSelectAgent={() => { }}
      />,
    );

    const agentToggle = screen.getByRole("button", { name: /select orchestrator agent/i });
    await user.click(agentToggle);

    const completedToggle = screen.getByRole("button", {
      name: /toggle completed tool invocations for orchestrator/i,
    });

    await user.click(completedToggle);

    const completedRegion = await screen.findByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });

    const nestedInvocationEntry = within(completedRegion).getByText(/summarize-report/i).closest("li");
    if (!nestedInvocationEntry) {
      throw new Error("Expected nested invocation entry to be present");
    }

    const nestedDetailsButton = within(nestedInvocationEntry).getByRole("button", {
      name: /view full tool invocation details/i,
    });

    await user.click(nestedDetailsButton);

    await screen.findByRole("dialog", { name: /tool invocation details/i });

    const updatedState = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: [ "root-agent" ],
          children: [
            {
              id: "delegate-agent",
              name: "delegate",
              provider: "openai",
              model: "gpt-4o-mini",
              depth: 1,
              lineage: [ "root-agent", "delegate-agent" ],
              children: [],
            },
          ],
        },
      ],
      toolInvocations: [ rootInvocation ],
      contextBundles: [],
      agentLineageById: {
        "root-agent": [ "root-agent" ],
        "delegate-agent": [ "root-agent", "delegate-agent" ],
      },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [ rootInvocation ],
          failed: [],
        },
        "delegate-agent": {
          pending: [],
          running: [],
          completed: [ nestedInvocation ],
          failed: [],
        },
      },
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T12:10:00.000Z",
      updatedAt: "2024-05-01T12:14:00.000Z",
    } satisfies ExecutionTreeState;

    rerender(
      <AgentExecutionTree
        state={updatedState}
        selectedAgentId={null}
        onSelectAgent={() => { }}
      />,
    );

    const dialogAfterUpdate = await screen.findByRole("dialog", {
      name: /tool invocation details/i,
    });

    expect(within(dialogAfterUpdate).getByText(/summarize-report/i)).toBeInTheDocument();
  });
  it("focuses tool invocation details for grouped entries", async () => {
    const state = {
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: [ "root-agent" ],
          children: [],
        },
      ],
      toolInvocations: [],
      contextBundles: [],
      agentLineageById: { "root-agent": [ "root-agent" ] },
      toolGroupsByAgentId: {
        "root-agent": {
          pending: [],
          running: [],
          completed: [
            {
              id: "child-invocation",
              agentId: "root-agent",
              name: "summarize-report",
              status: "completed",
              createdAt: "2024-05-01T12:12:00.000Z",
              updatedAt: "2024-05-01T12:12:30.000Z",
              metadata: { result: { summary: "Key findings" } },
              children: [],
            },
          ],
          failed: [],
        },
      },
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T12:10:00.000Z",
      updatedAt: "2024-05-01T12:13:00.000Z",
    } satisfies ExecutionTreeState;

    render(
      <AgentExecutionTree
        state={state}
        selectedAgentId={null}
        onSelectAgent={() => { }}
        focusedInvocationId="child-invocation"
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /tool invocation details/i,
    });

    expect(dialog).toHaveAccessibleName(/tool invocation details/i);
    expect(within(dialog).getByText(/summarize-report/i)).toBeInTheDocument();
  });
});
