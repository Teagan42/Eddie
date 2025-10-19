import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { OverviewHero } from "../components";
import {
  AVAILABLE_THEMES,
  ThemeProvider,
  isDarkTheme,
  useTheme,
} from "@/theme";

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
  const handleSelectTheme = (nextTheme: RuntimeConfigDto["theme"]): void => {
    setTheme(nextTheme);
  };

  return (
    <MemoryRouter>
      <OverviewHero
        apiKey="demo"
        apiUrl="https://api.example.com"
        onRemoveApiKey={vi.fn()}
        theme={theme}
        onSelectTheme={handleSelectTheme}
        isThemeSelectorDisabled={isThemeStale}
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
  async function chooseTheme(
    user: ReturnType<typeof userEvent.setup>,
    theme: RuntimeConfigDto["theme"]
  ): Promise<void> {
    const trigger = await screen.findByRole("combobox", { name: /theme/i });
    await user.click(trigger);
    const option = await screen.findByRole("option", { name: new RegExp(theme, "i") });
    await user.click(option);
  }

  it("lists all available themes in the dropdown and applies the selection", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe(AVAILABLE_THEMES[0]));

    const trigger = await screen.findByRole("combobox", { name: /theme/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    for (const nextTheme of AVAILABLE_THEMES) {
      await chooseTheme(user, nextTheme);
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe(nextTheme));
      expect(document.documentElement.classList.contains("dark")).toBe(isDarkTheme(nextTheme));
    }

    expect(trigger).toHaveTextContent(new RegExp(AVAILABLE_THEMES.at(-1) ?? "", "i"));

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

    await chooseTheme(user, "midnight");

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

    await chooseTheme(user, "dark");

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

  it("disables the theme dropdown while stale config theme is replayed", async () => {
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

    const toggleButton = await screen.findByRole("combobox", { name: /theme/i });

    await waitFor(() => expect(toggleButton).not.toBeDisabled());

    await chooseTheme(user, "dark");

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
