import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { AuthProvider } from "@/auth/auth-context";
import { ChatPage } from "./ChatPage";

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
      <Theme>
        <AuthProvider>
          <QueryClientProvider client={client}>
            <ChatPage />
          </QueryClientProvider>
        </AuthProvider>
      </Theme>
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
