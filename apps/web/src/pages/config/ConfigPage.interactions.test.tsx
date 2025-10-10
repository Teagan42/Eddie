import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Theme } from "@radix-ui/themes";
import { ConfigPage } from "./ConfigPage";

const catalogMock = vi.fn();
const getSchemaMock = vi.fn();
const loadSourceMock = vi.fn();
const previewMock = vi.fn();
const saveMock = vi.fn();

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
        previewEddieConfig: previewMock,
        saveEddieConfig: saveMock,
      },
      providers: {
        catalog: catalogMock,
      },
    },
  }),
}));

beforeAll(() => {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = () => {};
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = () => {};
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
});

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

describe("ConfigPage interactions", () => {
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
      input: {
        model: "api-model-2",
        provider: { name: "api-provider" },
        context: { include: ["src/**/*"], exclude: ["dist/**"] },
        tools: { enabled: ["filesystem", "git"], autoApprove: true },
        agents: {
          mode: "router",
          manager: { prompt: "Coordinate the plan" },
          enableSubagents: true,
        },
        logging: { level: "info" },
      },
      config: {
        model: "api-model-2",
        provider: { name: "api-provider" },
        context: { include: ["src/**/*"], exclude: ["dist/**"] },
        tools: { enabled: ["filesystem", "git"], autoApprove: true },
        agents: {
          mode: "router",
          manager: { prompt: "Coordinate the plan" },
          enableSubagents: true,
        },
        logging: { level: "info" },
      },
      error: null,
    });
  });

  it("uses a provider dropdown populated from the catalog", async () => {
    const user = userEvent.setup();
    renderConfigPage();

    const trigger = await screen.findByRole("combobox", { name: /provider/i });
    await user.click(trigger);

    expect(
      await screen.findByRole("option", { name: "Provider From API" })
    ).toBeInTheDocument();
  });

  it("supports adding and removing include entries with dedicated controls", async () => {
    const user = userEvent.setup();
    renderConfigPage();

    const includeInput = await screen.findByPlaceholderText(
      /add include pattern/i
    );
    await user.type(includeInput, "docs/**/*.md");
    await user.click(screen.getByRole("button", { name: /add include/i }));

    expect(
      await screen.findByRole("textbox", { name: /include entry 2/i })
    ).toHaveValue("docs/**/*.md");

    await user.click(
      screen.getByRole("button", { name: /remove include entry 2/i })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /include entry 2/i })
      ).not.toBeInTheDocument()
    );
  });

  it("renders switches for each enabled tool", async () => {
    const user = userEvent.setup();
    renderConfigPage();

    const filesystemToggle = await screen.findByRole("switch", {
      name: /filesystem tool/i,
    });

    expect(filesystemToggle).toHaveAttribute("aria-checked", "true");
    await user.click(filesystemToggle);
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /filesystem tool/i })
      ).toHaveAttribute("aria-checked", "false")
    );
  });

  it("hides prompt editors until expanded", async () => {
    const user = userEvent.setup();
    renderConfigPage();

    const toggle = await screen.findByRole("button", {
      name: /edit system prompt/i,
    });

    expect(
      screen.queryByRole("textbox", { name: /system prompt/i })
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(
      await screen.findByRole("textbox", { name: /system prompt/i })
    ).toBeInTheDocument();
  });
});
