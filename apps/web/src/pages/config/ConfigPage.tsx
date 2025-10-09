import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Box,
  Button,
  Card,
  Callout,
  Flex,
  Heading,
  IconButton,
  Separator,
  Switch,
  Tabs,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  DownloadIcon,
  ReloadIcon,
  UploadIcon,
  MixerHorizontalIcon,
  EyeOpenIcon,
  FileTextIcon,
  CheckIcon,
} from "@radix-ui/react-icons";
import Editor, { DiffEditor, useMonaco } from "@monaco-editor/react";
import { configureMonacoYaml } from "monaco-yaml";
import YAML from "js-yaml";
import {
  type ConfigFileFormat,
  type EddieConfigInputDto,
  type EddieConfigPreviewDto,
  type EddieConfigSchemaDto,
  type EddieConfigSourceDto,
  type UpdateEddieConfigPayload,
} from "@eddie/api-client";
import { useApi } from "@/api/api-provider";

const YAML_OPTIONS = { lineWidth: 120, noRefs: true } as const;

function cloneInput(input?: EddieConfigInputDto): EddieConfigInputDto {
  return JSON.parse(JSON.stringify(input ?? {}));
}

function formatInput(
  input: EddieConfigInputDto,
  format: ConfigFileFormat
): string {
  const normalized = cloneInput(input);
  if (format === "json") {
    return `${JSON.stringify(normalized, null, 2)}\n`;
  }
  return YAML.dump(normalized, YAML_OPTIONS);
}

function parseInput(
  value: string,
  format: ConfigFileFormat
): EddieConfigInputDto {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  if (format === "json") {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Configuration JSON must describe an object.");
    }
    return parsed as EddieConfigInputDto;
  }

  const parsed = YAML.load(value) ?? {};
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Configuration YAML must describe an object.");
  }
  return parsed as EddieConfigInputDto;
}

function toMultiline(values?: string[]): string {
  return values && values.length > 0 ? values.join("\n") : "";
}

function fromMultiline(value: string): string[] | undefined {
  const entries = value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card className="space-y-4">
      <Box>
        <Heading as="h3" size="4">
          {title}
        </Heading>
        {description ? (
          <Text size="2" color="gray">
            {description}
          </Text>
        ) : null}
      </Box>
      <Separator className="opacity-40" />
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

export function ConfigPage(): JSX.Element {
  const api = useApi();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const monaco = useMonaco();

  const schemaQuery = useQuery<EddieConfigSchemaDto>({
    queryKey: ["config", "eddie", "schema"],
    queryFn: () => api.http.config.getSchema(),
    staleTime: 600_000,
  });

  const sourceQuery = useQuery<EddieConfigSourceDto>({
    queryKey: ["config", "eddie", "source"],
    queryFn: () => api.http.config.loadEddieConfig(),
  });

  const [mode, setMode] = useState<ConfigFileFormat>("yaml");
  const [editorValue, setEditorValue] = useState<string>("");
  const [originalValue, setOriginalValue] = useState<string>("");
  const [baselineInput, setBaselineInput] = useState<EddieConfigInputDto>({});
  const [parsedInput, setParsedInput] = useState<EddieConfigInputDto>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<EddieConfigPreviewDto | null>(
    null
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<"success" | "error" | null>(
    null
  );

  const {
    mutate: requestPreview,
    isPending: isPreviewing,
  } = useMutation({
    mutationFn: (payload: UpdateEddieConfigPayload) =>
      api.http.config.previewEddieConfig(payload),
    onSuccess: (data) => {
      setPreviewData(data);
      setPreviewError(null);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to preview configuration.";
      setPreviewError(message);
    },
  });

  const { mutate: saveConfig, isPending: isSaving } = useMutation({
    mutationFn: (payload: UpdateEddieConfigPayload) =>
      api.http.config.saveEddieConfig(payload),
    onSuccess: (snapshot) => {
      setBaselineInput(cloneInput(snapshot.input));
      setOriginalValue(snapshot.content);
      setEditorValue(snapshot.content);
      setParsedInput(cloneInput(snapshot.input));
      setPreviewData(
        snapshot.config
          ? { input: snapshot.input, config: snapshot.config }
          : null
      );
      setParseError(null);
      setPreviewError(snapshot.error ?? null);
      setStatusMessage(
        `Configuration saved at ${new Date().toLocaleTimeString()}`
      );
      setStatusVariant("success");
      queryClient.setQueryData(["config", "eddie", "source"], snapshot);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to save configuration.";
      setStatusMessage(message);
      setStatusVariant("error");
    },
  });

  useEffect(() => {
    if (!schemaQuery.data || !monaco) {
      return;
    }

    const schema = schemaQuery.data;
    const jsonFile = "eddie.config.json";
    const yamlFile = "eddie.config.yaml";

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      schemas: [
        {
          uri: schema.id,
          fileMatch: [jsonFile],
          schema: schema.inputSchema,
        },
      ],
    });

    const yaml = configureMonacoYaml(monaco, {
      enableSchemaRequest: false,
      validate: true,
      hover: true,
      completion: true,
      format: true,
      schemas: [
        {
          uri: `${schema.id}#yaml`,
          fileMatch: [yamlFile],
          schema: schema.inputSchema,
        },
      ],
    });

    return () => {
      yaml.dispose();
    };
  }, [schemaQuery.data, monaco]);

  useEffect(() => {
    if (!sourceQuery.data) {
      return;
    }
    const snapshot = sourceQuery.data;
    setMode(snapshot.format);
    setBaselineInput(cloneInput(snapshot.input));
    setOriginalValue(snapshot.content);
    setEditorValue(snapshot.content);
    setParsedInput(cloneInput(snapshot.input));
    setPreviewData(
      snapshot.config ? { input: snapshot.input, config: snapshot.config } : null
    );
    setParseError(null);
    setPreviewError(snapshot.error ?? null);
    setStatusMessage(null);
    setStatusVariant(null);
  }, [sourceQuery.data]);

  useEffect(() => {
    try {
      const parsed = parseInput(editorValue, mode);
      setParsedInput(parsed);
      setParseError(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to parse configuration.";
      setParseError(message);
    }
  }, [editorValue, mode]);

  useEffect(() => {
    if (parseError) {
      return;
    }
    const handle = window.setTimeout(() => {
      if (editorValue.trim().length === 0) {
        return;
      }
      requestPreview({ content: editorValue, format: mode });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [editorValue, mode, parseError, requestPreview]);

  const isLoading =
    schemaQuery.isLoading || sourceQuery.isLoading || !sourceQuery.data;
  const isDirty = editorValue.trim() !== originalValue.trim();

  const guardrailWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (parseError) {
      warnings.push("The configuration source cannot be parsed.");
      return warnings;
    }
    const config = previewData?.config;
    if (!config) {
      return warnings;
    }
    if (!config.provider?.name) {
      warnings.push("Provider name is required.");
    }
    if (!config.model) {
      warnings.push("A default model should be specified.");
    }
    if (!config.context?.include || config.context.include.length === 0) {
      warnings.push("Provide at least one context include glob.");
    }
    if (!config.agents?.manager?.prompt) {
      warnings.push("Agent manager prompt must not be empty.");
    }
    return warnings;
  }, [parseError, previewData]);

  const currentConfig = previewData?.config;
  const effectiveInput = parsedInput ?? {};
  const autoApproveChecked =
    effectiveInput.tools?.autoApprove ?? currentConfig?.tools?.autoApprove ?? false;
  const enableSubagentsChecked =
    effectiveInput.agents?.enableSubagents ??
    currentConfig?.agents?.enableSubagents ??
    false;

  const handleFormatChange = (next: ConfigFileFormat): void => {
    if (mode === next) {
      return;
    }
    setMode(next);
    setEditorValue(formatInput(parsedInput, next));
    setOriginalValue(formatInput(baselineInput, next));
    setParseError(null);
    setPreviewError(null);
  };

  const handleDownload = (): void => {
    const blob = new Blob([editorValue], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const extension = mode === "json" ? "json" : "yaml";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `eddie.config.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = (file: File): void => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? "");
      const inferred: ConfigFileFormat = file.name.endsWith(".json")
        ? "json"
        : "yaml";
      setMode(inferred);
      setEditorValue(text);
    };
    reader.readAsText(file);
  };

  const updateInput = (
    updater: (draft: EddieConfigInputDto) => void
  ): void => {
    setParsedInput((prev) => {
      const draft = cloneInput(prev);
      updater(draft);
      setEditorValue(formatInput(draft, mode));
      setParseError(null);
      setPreviewError(null);
      return draft;
    });
  };

  if (isLoading) {
    return (
      <Flex direction="column" gap="4">
        <Heading size="6">Configuration</Heading>
        <Text color="gray">Loading configuration editor…</Text>
      </Flex>
    );
  }

  if (schemaQuery.isError || sourceQuery.isError || !sourceQuery.data) {
    return (
      <Callout.Root color="red">
        <Callout.Icon>
          <ReloadIcon />
        </Callout.Icon>
        <Callout.Text>
          Unable to load configuration details. Please verify the API is reachable.
        </Callout.Text>
      </Callout.Root>
    );
  }

  const editorPath = mode === "json" ? "eddie.config.json" : "eddie.config.yaml";

  return (
    <Flex direction="column" gap="7">
      <Box>
        <Heading size="7">Configuration</Heading>
        <Text color="gray">
          Manage Eddie orchestrator settings with schema-backed validation or a
          guided form.
        </Text>
      </Box>

      {statusMessage ? (
        <Callout.Root color={statusVariant === "error" ? "red" : "jade"}>
          <Callout.Icon>
            <CheckIcon />
          </Callout.Icon>
          <Callout.Text>{statusMessage}</Callout.Text>
        </Callout.Root>
      ) : null}

      {parseError ? (
        <Callout.Root color="red">
          <Callout.Icon>
            <MixerHorizontalIcon />
          </Callout.Icon>
          <Callout.Text>{parseError}</Callout.Text>
        </Callout.Root>
      ) : null}

      {previewError ? (
        <Callout.Root color="amber">
          <Callout.Icon>
            <MixerHorizontalIcon />
          </Callout.Icon>
          <Callout.Text>{previewError}</Callout.Text>
        </Callout.Root>
      ) : null}

      {guardrailWarnings.length > 0 && !parseError ? (
        <Callout.Root color="amber">
          <Callout.Icon>
            <EyeOpenIcon />
          </Callout.Icon>
          <Callout.Text>
            <Flex direction="column" gap="2">
              <Text weight="medium">Guardrails</Text>
              <ul className="list-disc space-y-1 pl-6 text-sm">
                {guardrailWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      ) : null}

      <Flex
        direction={{ initial: "column", lg: "row" }}
        gap="6"
        align="start"
      >
        <Flex direction="column" gap="5" className="w-full lg:w-1/2">
          <Section
            title="Identity"
            description="Configure providers, models, and system prompts."
          >
            <Flex direction="column" gap="3">
              <TextField.Root
                value={effectiveInput.model ?? ""}
                onChange={(event) =>
                  updateInput((draft) => {
                    const next = event.target.value || undefined;
                    if (next) {
                      draft.model = next;
                    } else {
                      delete draft.model;
                    }
                  })
                }
                placeholder={currentConfig?.model ?? "Model identifier"}
              />
              <TextArea
                value={effectiveInput.systemPrompt ?? ""}
                onChange={(event) =>
                  updateInput((draft) => {
                    const next = event.target.value || undefined;
                    if (next) {
                      draft.systemPrompt = next;
                    } else {
                      delete draft.systemPrompt;
                    }
                  })
                }
                placeholder={
                  currentConfig?.systemPrompt ?? "System prompt used for orchestration"
                }
                minRows={3}
              />
            </Flex>
            <Separator className="opacity-30" />
            <Flex direction="column" gap="3">
              <Text size="2" color="gray">
                Provider configuration
              </Text>
              <TextField.Root
                value={effectiveInput.provider?.name ?? ""}
                onChange={(event) =>
                  updateInput((draft) => {
                    draft.provider = { ...(draft.provider ?? {}) };
                    const next = event.target.value || undefined;
                    if (next) {
                      draft.provider.name = next;
                    } else {
                      delete draft.provider.name;
                    }
                    if (Object.keys(draft.provider).length === 0) {
                      delete draft.provider;
                    }
                  })
                }
                placeholder={currentConfig?.provider?.name ?? "Provider"}
              />
              <TextField.Root
                value={effectiveInput.provider?.baseUrl ?? ""}
                onChange={(event) =>
                  updateInput((draft) => {
                    draft.provider = { ...(draft.provider ?? {}) };
                    const next = event.target.value || undefined;
                    if (next) {
                      draft.provider.baseUrl = next;
                    } else {
                      delete draft.provider.baseUrl;
                    }
                    if (Object.keys(draft.provider).length === 0) {
                      delete draft.provider;
                    }
                  })
                }
                placeholder="Base URL (optional)"
              />
              <TextField.Root
                value={effectiveInput.provider?.apiKey ?? ""}
                onChange={(event) =>
                  updateInput((draft) => {
                    draft.provider = { ...(draft.provider ?? {}) };
                    const next = event.target.value || undefined;
                    if (next) {
                      draft.provider.apiKey = next;
                    } else {
                      delete draft.provider.apiKey;
                    }
                    if (Object.keys(draft.provider).length === 0) {
                      delete draft.provider;
                    }
                  })
                }
                placeholder="API key (optional)"
              />
            </Flex>
          </Section>

          <Section
            title="Context"
            description="Control which files and resources are bundled."
          >
            <TextField.Root
              value={effectiveInput.context?.baseDir ?? ""}
              onChange={(event) =>
                updateInput((draft) => {
                  draft.context = { ...(draft.context ?? {}) };
                  const next = event.target.value || undefined;
                  if (next) {
                    draft.context.baseDir = next;
                  } else {
                    delete draft.context.baseDir;
                  }
                })
              }
              placeholder={currentConfig?.context?.baseDir ?? "Base directory"}
            />
            <TextArea
              value={toMultiline(effectiveInput.context?.include)}
              onChange={(event) =>
                updateInput((draft) => {
                  draft.context = { ...(draft.context ?? {}) };
                  const next = fromMultiline(event.target.value);
                  if (next) {
                    draft.context.include = next;
                  } else {
                    delete draft.context.include;
                  }
                })
              }
              placeholder={
                currentConfig?.context?.include?.join("\n") ??
                "src/**/*\nREADME.md"
              }
              minRows={3}
            />
            <TextArea
              value={toMultiline(effectiveInput.context?.exclude)}
              onChange={(event) =>
                updateInput((draft) => {
                  draft.context = { ...(draft.context ?? {}) };
                  const next = fromMultiline(event.target.value);
                  if (next) {
                    draft.context.exclude = next;
                  } else {
                    delete draft.context.exclude;
                  }
                })
              }
              placeholder="Optional exclusion globs"
              minRows={2}
            />
          </Section>

          <Section
            title="Logging & Tools"
            description="Tune output verbosity and tool usage."
          >
            <Flex align="center" gap="3">
              <Text size="2">Logging level</Text>
              <TextField.Root
                value={effectiveInput.logging?.level ?? ""}
                onChange={(event) =>
                  updateInput((draft) => {
                    draft.logging = { ...(draft.logging ?? {}) };
                    const next = event.target.value || undefined;
                    if (next) {
                      draft.logging.level = next as never;
                    } else {
                      delete draft.logging.level;
                    }
                  })
                }
                placeholder={currentConfig?.logging?.level ?? "info"}
              />
            </Flex>
            <Flex direction="column" gap="3">
              <Text size="2" color="gray">
                Enabled tools
              </Text>
              <TextArea
                value={toMultiline(effectiveInput.tools?.enabled)}
                onChange={(event) =>
                  updateInput((draft) => {
                    draft.tools = { ...(draft.tools ?? {}) };
                    const next = fromMultiline(event.target.value);
                    if (next) {
                      draft.tools.enabled = next;
                    } else {
                      delete draft.tools.enabled;
                    }
                  })
                }
                placeholder={currentConfig?.tools?.enabled?.join("\n") ?? ""}
                minRows={2}
              />
              <Flex align="center" gap="3">
                <Switch
                  checked={autoApproveChecked}
                  onCheckedChange={(checked) =>
                    updateInput((draft) => {
                      draft.tools = { ...(draft.tools ?? {}) };
                      draft.tools.autoApprove = checked;
                    })
                  }
                />
                <Text size="2">Auto-approve tool calls</Text>
              </Flex>
            </Flex>
          </Section>

          <Section
            title="Agents"
            description="Control routing and agent behaviour."
          >
            <TextField.Root
              value={effectiveInput.agents?.mode ?? ""}
              onChange={(event) =>
                updateInput((draft) => {
                  draft.agents = { ...(draft.agents ?? {}) };
                  const next = event.target.value || undefined;
                  if (next) {
                    draft.agents.mode = next;
                  } else {
                    delete draft.agents.mode;
                  }
                })
              }
              placeholder={currentConfig?.agents?.mode ?? "single"}
            />
            <TextArea
              value={effectiveInput.agents?.manager?.prompt ?? ""}
              onChange={(event) =>
                updateInput((draft) => {
                  draft.agents = { ...(draft.agents ?? {}) };
                  draft.agents.manager = { ...(draft.agents.manager ?? {}) };
                  const next = event.target.value || undefined;
                  if (next) {
                    draft.agents.manager.prompt = next;
                  } else {
                    delete draft.agents.manager.prompt;
                  }
                })
              }
              placeholder={
                currentConfig?.agents?.manager?.prompt ?? "Manager prompt"
              }
              minRows={4}
            />
            <Flex align="center" gap="3">
              <Switch
                checked={enableSubagentsChecked}
                onCheckedChange={(checked) =>
                  updateInput((draft) => {
                    draft.agents = { ...(draft.agents ?? {}) };
                    draft.agents.enableSubagents = checked;
                  })
                }
              />
              <Text size="2">Enable subagents</Text>
            </Flex>
          </Section>
        </Flex>

        <Flex direction="column" gap="5" className="w-full lg:w-1/2">
          <Card className="space-y-4">
            <Flex align="center" justify="between">
              <Heading as="h3" size="4">
                Source editor
              </Heading>
              <Flex align="center" gap="3">
                <Badge color={isDirty ? "amber" : "jade"}>
                  {isDirty ? "Unsaved" : "Up to date"}
                </Badge>
                <Flex gap="2">
                  <Button
                    size="2"
                    variant={mode === "yaml" ? "solid" : "surface"}
                    onClick={() => handleFormatChange("yaml")}
                  >
                    YAML
                  </Button>
                  <Button
                    size="2"
                    variant={mode === "json" ? "solid" : "surface"}
                    onClick={() => handleFormatChange("json")}
                  >
                    JSON
                  </Button>
                </Flex>
              </Flex>
            </Flex>

            <Tabs.Root
              value={showDiff ? "diff" : "editor"}
              onValueChange={(value) => setShowDiff(value === "diff")}
            >
              <Tabs.List>
                <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
                <Tabs.Trigger value="diff" disabled={!isDirty}>
                  Diff
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="editor" className="mt-3">
                <Editor
                  height="520px"
                  language={mode === "json" ? "json" : "yaml"}
                  value={editorValue}
                  path={editorPath}
                  onChange={(value) => setEditorValue(value ?? "")}
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    tabSize: 2,
                    scrollBeyondLastLine: false,
                  }}
                />
              </Tabs.Content>
              <Tabs.Content value="diff" className="mt-3">
                <DiffEditor
                  height="520px"
                  language={mode === "json" ? "json" : "yaml"}
                  original={originalValue}
                  modified={editorValue}
                  options={{
                    renderSideBySide: true,
                    automaticLayout: true,
                    minimap: { enabled: false },
                    enableSplitViewResizing: true,
                  }}
                />
              </Tabs.Content>
            </Tabs.Root>

            <Flex align="center" justify="between">
              <Flex align="center" gap="3">
                <Button
                  size="2"
                  variant="surface"
                  onClick={handleDownload}
                >
                  <Flex align="center" gap="2">
                    <DownloadIcon />
                    <span>Download</span>
                  </Flex>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".yaml,.yml,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleUpload(file);
                    }
                    event.target.value = "";
                  }}
                />
                <Button
                  size="2"
                  variant="surface"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Flex align="center" gap="2">
                    <UploadIcon />
                    <span>Upload</span>
                  </Flex>
                </Button>
              </Flex>
              <Flex align="center" gap="3">
                <IconButton
                  size="3"
                  variant="surface"
                  aria-label="Reset to last saved"
                  disabled={!isDirty}
                  onClick={() => {
                    setEditorValue(originalValue);
                    setParseError(null);
                    setPreviewError(null);
                  }}
                >
                  <ReloadIcon />
                </IconButton>
                <Button
                  size="3"
                  disabled={isSaving || !isDirty}
                  onClick={() =>
                    saveConfig({
                      content: editorValue,
                      format: mode,
                    })
                  }
                >
                  <Flex align="center" gap="2">
                    {isSaving ? (
                      <ReloadIcon className="animate-spin" />
                    ) : (
                      <FileTextIcon />
                    )}
                    <span>{isSaving ? "Saving…" : "Save changes"}</span>
                  </Flex>
                </Button>
              </Flex>
            </Flex>
          </Card>

          <Card className="space-y-4">
            <Heading as="h3" size="4">
              Effective configuration preview
            </Heading>
            {isPreviewing ? (
              <Text color="gray">Validating configuration…</Text>
            ) : currentConfig ? (
              <Flex direction="column" gap="3">
                <Flex gap="2" align="center">
                  <Text weight="medium">Provider:</Text>
                  <Text>{currentConfig.provider?.name ?? "Unknown"}</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Text weight="medium">Model:</Text>
                  <Text>{currentConfig.model}</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Text weight="medium">Context base:</Text>
                  <Text>{currentConfig.context?.baseDir ?? "cwd"}</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Text weight="medium">Include globs:</Text>
                  <Text>
                    {currentConfig.context?.include?.length ?? 0} entries
                  </Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Text weight="medium">Enabled tools:</Text>
                  <Text>
                    {currentConfig.tools?.enabled?.length ?? 0} configured
                  </Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Text weight="medium">Agent mode:</Text>
                  <Text>{currentConfig.agents?.mode ?? "single"}</Text>
                </Flex>
              </Flex>
            ) : (
              <Text color="gray">No preview available.</Text>
            )}
          </Card>
        </Flex>
      </Flex>
    </Flex>
  );
}
