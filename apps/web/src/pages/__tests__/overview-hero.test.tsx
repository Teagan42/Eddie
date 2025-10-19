import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { OverviewHero } from "../components";
import { ThemeProvider, useTheme } from "@/theme";

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      config: {
        get: vi.fn(() => Promise.resolve({ theme: initialTheme } satisfies Pick<RuntimeConfigDto, "theme">)),
        update: vi.fn((input: Partial<RuntimeConfigDto>) => Promise.resolve({ theme: input.theme })),
      },
    },
  }),
}));

let initialTheme: RuntimeConfigDto["theme"] = "light";

function ThemeHarness(): JSX.Element {
  const { theme, setTheme, isThemeStale } = useTheme();
  const handleToggleTheme = (): void => {
    const nextTheme = (theme === "dark" ? "light" : "dark") as RuntimeConfigDto["theme"];
    setTheme(nextTheme);
  };

  return (
    <MemoryRouter>
      <OverviewHero
        apiKey="demo"
        apiUrl="https://api.example.com"
        onRemoveApiKey={vi.fn()}
        onToggleTheme={handleToggleTheme}
        isToggleThemeDisabled={isThemeStale}
        stats={[
          {
            label: "Stat",
            value: 1,
            hint: "Hint",
            icon: ({ className }: { className?: string }) => <span data-testid="dummy-icon" className={className} />,
          },
        ]}
      />
    </MemoryRouter>
  );
}

describe("OverviewHero", () => {
  it("cycles the theme via provider when button clicked", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));

    await user.click(screen.getByRole("button", { name: /cycle theme/i }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    queryClient.clear();
  });

  it("uses theme tokens for hero surface styling", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>
    );

    const hero = await screen.findByTestId("overview-hero");

    expect(hero).toHaveClass("text-foreground");
    expect(hero.className).toContain("border-border/60");
    expect(hero.className).toContain("from-[hsl(var(--hero-surface-from))]");
    expect(hero.className).toContain("via-[hsl(var(--hero-surface-via))]");
    expect(hero.className).toContain("to-[hsl(var(--hero-surface-to))]");
    expect(hero.className).toContain("dark:from-[hsl(var(--hero-surface-from-dark))]");
    expect(hero.className).toContain("dark:via-[hsl(var(--hero-surface-via-dark))]");
    expect(hero.className).toContain("dark:to-[hsl(var(--hero-surface-to-dark))]");

    await user.click(screen.getByRole("button", { name: /cycle theme/i }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    queryClient.clear();
  });

  it("keeps the toggled theme when the config query replays the previous value", async () => {
    initialTheme = "light";
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));

    await user.click(screen.getByRole("button", { name: /cycle theme/i }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    act(() => {
      queryClient.setQueryData<Pick<RuntimeConfigDto, "theme">>(["config"], { theme: "dark" });
    });

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    act(() => {
      queryClient.setQueryData<Pick<RuntimeConfigDto, "theme">>(["config"], { theme: "light" });
    });

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    queryClient.clear();
  });

  it("disables the cycle theme button while stale config theme is replayed", async () => {
    initialTheme = "light";
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>
    );

    const toggleButton = await screen.findByRole("button", { name: /cycle theme/i });

    await waitFor(() => expect(toggleButton).not.toBeDisabled());

    await user.click(toggleButton);

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    act(() => {
      queryClient.setQueryData<Pick<RuntimeConfigDto, "theme">>(["config"], { theme: "light" });
    });

    await waitFor(() => expect(toggleButton).toBeDisabled());

    act(() => {
      queryClient.setQueryData<Pick<RuntimeConfigDto, "theme">>(["config"], { theme: "dark" });
    });

    await waitFor(() => expect(toggleButton).not.toBeDisabled());

    queryClient.clear();
  });
});
