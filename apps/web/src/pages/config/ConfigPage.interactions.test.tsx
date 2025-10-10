import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Theme } from "@radix-ui/themes";
import { ConfigPage } from "./ConfigPage";
import { load as loadYaml } from "js-yaml";
import type { UpdateEddieConfigPayload } from "@eddie/api-client";

const catalogMock = vi.fn();
const getSchemaMock = vi.fn();
const loadSourceMock = vi.fn();
const previewMock = vi.fn();
const saveMock = vi.fn();

const baseSourceResponse = {
  path: null,
  format: "yaml" as const,
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
};

const cloneSourceResponse = () =>
  JSON.parse(JSON.stringify(baseSourceResponse)) as typeof baseSourceResponse;

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
    loadSourceMock.mockResolvedValue(cloneSourceResponse());
    saveMock.mockImplementation(async (payload: UpdateEddieConfigPayload) => {
      const parsed =
        payload.format === "json"
          ? (JSON.parse(payload.content) as unknown)
          : loadYaml(payload.content);
      return {
        path: null,
        format: payload.format,
        content: payload.content,
        input: (parsed ?? {}) as Record<string, unknown>,
        config: (parsed ?? {}) as Record<string, unknown>,
        error: null,
      };
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

  it("removes a re-enabled tool from the disabled list before saving", async () => {
    const user = userEvent.setup();
    const disabledToolSource = cloneSourceResponse();
    disabledToolSource.input.tools = {
      enabled: ["filesystem"],
      disabled: ["git"],
      autoApprove: true,
    };
    disabledToolSource.config.tools = {
      enabled: ["filesystem"],
      disabled: ["git"],
      autoApprove: true,
    };
    loadSourceMock.mockResolvedValueOnce(disabledToolSource);

    renderConfigPage();

    const gitToggle = await screen.findByRole("switch", { name: /git tool/i });
    expect(gitToggle).toHaveAttribute("aria-checked", "false");

    await user.click(gitToggle);

    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /git tool/i })
      ).toHaveAttribute("aria-checked", "true")
    );

    const saveButton = await screen.findByRole("button", {
      name: /save changes/i,
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload || typeof payload.content !== "string") {
      throw new Error("Expected save payload to include serialized content");
    }
    const saved = loadYaml(payload.content) as {
      tools?: { enabled?: string[]; disabled?: string[] };
    };
    expect(saved.tools?.enabled ?? []).toContain("git");
    expect(saved.tools?.disabled ?? []).not.toContain("git");
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
