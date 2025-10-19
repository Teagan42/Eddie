import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { ConfigPage } from "./ConfigPage";

const catalogMock = vi.fn();
const getSchemaMock = vi.fn();
const loadSourceMock = vi.fn();

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

vi.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: () => <div data-testid="monaco-editor" />,
  DiffEditor: () => <div data-testid="monaco-diff-editor" />,
  useMonaco: () => null,
}));

vi.mock("monaco-yaml", () => ({
  configureMonacoYaml: vi.fn(),
}));

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      config: {
        getSchema: getSchemaMock,
        loadEddieConfig: loadSourceMock,
        previewEddieConfig: vi.fn(),
        saveEddieConfig: vi.fn(),
      },
      providers: {
        catalog: catalogMock,
      },
    },
  }),
}));

function renderConfigPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <Theme>
      <QueryClientProvider client={client}>
        <ConfigPage />
      </QueryClientProvider>
    </Theme>
  );
}

describe("ConfigPage provider catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogMock.mockResolvedValue([
      {
        name: "api-provider",
        label: "Provider From API",
        models: ["api-model-1", "api-model-2"],
      },
    ]);
    getSchemaMock.mockResolvedValue({
      id: "schema-id",
      version: "1.0.0",
      schema: {},
      inputSchema: {},
    });
    loadSourceMock.mockResolvedValue({
      path: null,
      format: "yaml",
      content: "model: api-model-2\nprovider:\n  name: api-provider\n",
      input: { model: "api-model-2", provider: { name: "api-provider" } },
      config: {
        model: "api-model-2",
        provider: { name: "api-provider" },
        providers: {
          "profile-openai": {
            provider: { name: "openai" },
            model: "gpt-4.1",
          },
          "profile-anthropic": {
            provider: { name: "anthropic" },
            model: "claude-3.5",
          },
        },
      },
      error: null,
    });
  });

  it("does not render a model selector when using the provider catalog", async () => {
    renderConfigPage();

    await waitFor(() => expect(loadSourceMock).toHaveBeenCalledTimes(1));

    await waitForElementToBeRemoved(() =>
      screen.queryByText("Loading configuration editor…")
    );

    expect(
      screen.queryByRole("combobox", { name: "Model" })
    ).not.toBeInTheDocument();
  });

  it("populates provider options from configuration profiles", async () => {
    renderConfigPage();

    await waitFor(() => expect(loadSourceMock).toHaveBeenCalledTimes(1));

    const trigger = await screen.findByRole("combobox", { name: /provider/i });
    await userEvent.click(trigger);

    expect(
      await screen.findByRole("option", { name: "profile-openai" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "profile-anthropic" })
    ).toBeInTheDocument();
  });

  it("hides provider controls when configuration profiles are unavailable", async () => {
    loadSourceMock.mockResolvedValueOnce({
      path: null,
      format: "yaml",
      content: "model: api-model-2\nprovider:\n  name: api-provider\n",
      input: { model: "api-model-2", provider: { name: "api-provider" } },
      config: {
        model: "api-model-2",
        provider: { name: "api-provider" },
        providers: {},
      },
      error: null,
    });

    renderConfigPage();

    await waitFor(() => expect(loadSourceMock).toHaveBeenCalledTimes(1));

    await waitForElementToBeRemoved(() =>
      screen.queryByText("Loading configuration editor…")
    );

    expect(
      screen.queryByRole("combobox", { name: /provider/i })
    ).not.toBeInTheDocument();
  });
});
