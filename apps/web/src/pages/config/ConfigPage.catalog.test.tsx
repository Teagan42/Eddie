import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  default: () => <div data-testid="monaco-editor" />, // eslint-disable-line react/display-name
  DiffEditor: () => <div data-testid="monaco-diff-editor" />, // eslint-disable-line react/display-name
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
      },
      error: null,
    });
  });

  it("renders the model selector with catalog-driven options", async () => {
    renderConfigPage();

    await waitFor(() => expect(catalogMock).toHaveBeenCalledTimes(1));

    expect(await screen.findByText("api-model-2")).toBeInTheDocument();
  });
});
