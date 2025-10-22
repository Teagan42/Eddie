import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/auth-context";
import { ChatPage } from "./ChatPage";
import type { OrchestratorMetadataDto } from "@eddie/api-client";
import { ThemeProvider } from "@/theme";

type ToolInvocationNode = OrchestratorMetadataDto["toolInvocations"][number];

export interface ToolInvocationFixture {
  id: string;
  name: string;
  status: ToolInvocationNode["status"];
  agentId: string;
  metadata?: Partial<ToolInvocationNode["metadata"]>;
  children?: ToolInvocationFixture[];
}

export function buildToolInvocationFixture(fixture: ToolInvocationFixture): ToolInvocationNode {
  const metadata = {
    agentId: fixture.agentId,
    createdAt: new Date().toISOString(),
    ...fixture.metadata,
  } as ToolInvocationNode["metadata"];

  return {
    id: fixture.id,
    name: fixture.name,
    status: fixture.status,
    metadata,
    children: (fixture.children ?? []).map((child) => buildToolInvocationFixture(child)),
  };
}

export interface ChatPageRenderHandle extends RenderResult {
  client: QueryClient;
  rerender: () => void;
}

export function createChatPageRenderer(
  createClient: () => QueryClient,
): () => ChatPageRenderHandle {
  return () => {
    const client = createClient();
    const renderElement = (): ReactElement => (
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <AuthProvider>
            <ChatPage />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );

    const result = render(renderElement());

    return {
      ...result,
      client,
      rerender: () => {
        result.rerender(renderElement());
      },
    };
  };
}
