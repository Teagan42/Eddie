import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { ThemeProvider, useTheme } from "@/theme";

const getConfigMock = vi.fn(() =>
  Promise.resolve({ theme: initialTheme } satisfies Pick<RuntimeConfigDto, "theme">)
);
const updateConfigMock = vi.fn((input: Partial<RuntimeConfigDto>) =>
  Promise.resolve({ theme: input.theme })
);

vi.mock("@/api/api-provider", () => {
  return {
    useApi: () => ({
      http: {
        config: {
          get: getConfigMock,
          update: updateConfigMock,
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
    getConfigMock.mockImplementation(() =>
      Promise.resolve({ theme: initialTheme } satisfies Pick<RuntimeConfigDto, "theme">)
    );
    updateConfigMock.mockImplementation((input: Partial<RuntimeConfigDto>) =>
      Promise.resolve({ theme: input.theme })
    );
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

  it("keeps the user-selected theme when the config query resolves later", async () => {
    const queryClient = new QueryClient();
    let resolveConfig: ((value: Pick<RuntimeConfigDto, "theme">) => void) | null = null;

    initialTheme = "dark";
    getConfigMock.mockImplementationOnce(
      () =>
        new Promise<Pick<RuntimeConfigDto, "theme">>((resolve) => {
          resolveConfig = resolve;
        })
    );

    const { result } = renderHook(() => useTheme(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.setTheme("light");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(result.current.theme).toBe("light");

    act(() => {
      resolveConfig?.({ theme: "dark" });
    });

    await waitFor(() => expect(result.current.theme).toBe("light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    queryClient.clear();
  });

  it("applies a temporary transition class when the theme changes", async () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useTheme(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.theme).toBe("light"));

    vi.useFakeTimers();

    act(() => {
      result.current.setTheme("dark");
    });

    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);

    vi.useRealTimers();
    queryClient.clear();
  });

  it("syncs data-theme attribute and dark class for extended palettes", async () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useTheme(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.theme).toBe("light"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => {
      result.current.setTheme("midnight");
    });

    await waitFor(() => expect(result.current.theme).toBe("midnight"));
    expect(document.documentElement.dataset.theme).toBe("midnight");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("aurora");
    });

    await waitFor(() => expect(result.current.theme).toBe("aurora"));
    expect(document.documentElement.dataset.theme).toBe("aurora");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    queryClient.clear();
  });
});
