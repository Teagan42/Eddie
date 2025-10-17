import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { ThemeProvider, useTheme } from "@/theme";

vi.mock("@/api/api-provider", () => {
  return {
    useApi: () => ({
      http: {
        config: {
          get: vi.fn(() => Promise.resolve({ theme: initialTheme } satisfies Pick<RuntimeConfigDto, "theme">)),
          update: vi.fn((input: Partial<RuntimeConfigDto>) => Promise.resolve({ theme: input.theme }))
        },
      },
    }),
  };
});

let initialTheme: RuntimeConfigDto["theme"];

function createWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
  Wrapper.displayName = "ThemeProviderTestWrapper";
  return Wrapper;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    initialTheme = "light";
  });

  it("syncs document class and query cache when theme changes", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useTheme(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.theme).toBe("light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => {
      result.current.setTheme("dark");
    });

    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(queryClient.getQueryData<RuntimeConfigDto>(["config"])?.theme).toBe("dark");

    queryClient.clear();
  });
});
