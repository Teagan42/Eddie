import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Callout,
  Flex,
  Heading,
  IconButton,
  Select,
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
  TrashIcon,
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
import { Panel } from "@/components/common";
import { cn } from "@/vendor/lib/utils";
import {
  getSurfaceLayoutClasses,
  SURFACE_CONTENT_CLASS,
} from "@/styles/surfaces";

const YAML_OPTIONS = { lineWidth: 120, noRefs: true } as const;

interface ProviderProfileSnapshot {
  provider?: {
    name?: string;
    [key: string]: unknown;
  };
  model?: string;
  [key: string]: unknown;
}

interface ProviderOption {
  value: string;
  label: string;
  providerName: string;
  defaultModel?: string;
}

function extractProviderProfiles(
  config: EddieConfigSourceDto['config'] | undefined | null,
): Record<string, ProviderProfileSnapshot> {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const candidate = (config as { providers?: unknown }).providers;
  if (!candidate || typeof candidate !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(candidate).filter((entry): entry is [string, ProviderProfileSnapshot] => {
      const [, profile] = entry;
      return typeof profile === 'object' && profile !== null;
    }),
  );
}

function uniqueProviderNames(
  ...candidates: Array<string | null | undefined>
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    names.push(normalized);
  }
  return names;
}

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
    <Panel title={title} description={description}>
      <Separator className="opacity-40" />
      <div className="space-y-3">{children}</div>
    </Panel>
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
  const [includeDraft, setIncludeDraft] = useState<string>("");
  const [excludeDraft, setExcludeDraft] = useState<string>("");
  const [systemPromptExpanded, setSystemPromptExpanded] = useState<boolean>(
    false
  );
  const [managerPromptExpanded, setManagerPromptExpanded] = useState<boolean>(
    false
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
  const resolvedConfig = previewData?.config ?? sourceQuery.data?.config ?? null;
  const providerProfiles = useMemo(
    () => extractProviderProfiles(resolvedConfig),
    [resolvedConfig],
  );
  const selectedProviderName = effectiveInput.provider?.name ?? null;
  const selectedProviderModel =
    effectiveInput.provider?.model ??
    baselineInput.provider?.model ??
    currentConfig?.provider?.model ??
    null;
  const autoApproveChecked =
    effectiveInput.tools?.autoApprove ?? currentConfig?.tools?.autoApprove ?? false;
  const enableSubagentsChecked =
    effectiveInput.agents?.enableSubagents ??
    currentConfig?.agents?.enableSubagents ??
    false;

  const providerOptions = useMemo(() => {
    const entries = Object.entries(providerProfiles);
    if (entries.length === 0) {
      return [];
    }

    const options = entries.reduce<ProviderOption[]>((acc, [profileId, profile]) => {
      const providerName = profile?.provider?.name;
      if (!providerName) {
        return acc;
      }

      acc.push({
        value: profileId,
        label: profileId,
        providerName,
        defaultModel: typeof profile.model === 'string' ? profile.model : undefined,
      });
      return acc;
    }, []);

    const seen = new Set(options.map((option) => option.providerName));
    const fallbacks: ProviderOption[] = [];

    for (const fallbackName of uniqueProviderNames(
      selectedProviderName,
      baselineInput.provider?.name,
      currentConfig?.provider?.name,
    )) {
      if (seen.has(fallbackName)) {
        continue;
      }
      seen.add(fallbackName);
      fallbacks.push({
        value: fallbackName,
        label: fallbackName,
        providerName: fallbackName,
      });
    }

    return [...fallbacks, ...options];
  }, [
    providerProfiles,
    selectedProviderName,
    baselineInput.provider?.name,
    currentConfig?.provider?.name,
  ]);


  const providerOptionsByValue = useMemo(() => {
    const map = new Map<string, ProviderOption>();
    for (const option of providerOptions) {
      map.set(option.value, option);
    }
    return map;
  }, [providerOptions]);
  const selectedProviderOption = useMemo(() => {
    if (!selectedProviderName) {
      return null;
    }

    const activeModel =
      typeof selectedProviderModel === "string" ? selectedProviderModel : undefined;
    if (activeModel) {
      const matchByModel = providerOptions.find(
        (option) =>
          option.providerName === selectedProviderName && option.defaultModel === activeModel,
      );
      if (matchByModel) {
        return matchByModel;
      }
    }

    return (
      providerOptions.find((option) => option.providerName === selectedProviderName) ?? null
    );
  }, [providerOptions, selectedProviderModel, selectedProviderName]);
  const selectedProviderValue =
    selectedProviderOption?.value ?? (selectedProviderName ? selectedProviderName : "");
  const includeEntries =
    effectiveInput.context?.include ??
    baselineInput.context?.include ??
    currentConfig?.context?.include ??
    [];
  const excludeEntries =
    effectiveInput.context?.exclude ??
    baselineInput.context?.exclude ??
    currentConfig?.context?.exclude ??
    [];
  const configuredTools = useMemo(() => {
    const enabled = effectiveInput.tools?.enabled ?? [];
    const disabled = effectiveInput.tools?.disabled ?? [];
    const baselineEnabled = baselineInput.tools?.enabled ?? [];
    const baselineDisabled = baselineInput.tools?.disabled ?? [];
    const currentEnabled = currentConfig?.tools?.enabled ?? [];
    const currentDisabled = currentConfig?.tools?.disabled ?? [];
    return Array.from(
      new Set([
        ...baselineEnabled,
        ...baselineDisabled,
        ...currentEnabled,
        ...currentDisabled,
        ...enabled,
        ...disabled,
      ])
    ).sort();
  }, [
    baselineInput.tools?.disabled,
    baselineInput.tools?.enabled,
    currentConfig?.tools?.disabled,
    currentConfig?.tools?.enabled,
    effectiveInput.tools?.disabled,
    effectiveInput.tools?.enabled,
  ]);
  const logLevelOptions = useMemo(
    () => ["silent", "info", "debug"],
    []
  );

  useEffect(() => {
    if (!systemPromptExpanded && (effectiveInput.systemPrompt?.trim() ?? "")) {
      setSystemPromptExpanded(true);
    }
  }, [effectiveInput.systemPrompt, systemPromptExpanded]);

  useEffect(() => {
    const prompt = effectiveInput.agents?.manager?.prompt?.trim() ?? "";
    if (!managerPromptExpanded && prompt) {
      setManagerPromptExpanded(true);
    }
  }, [effectiveInput.agents?.manager?.prompt, managerPromptExpanded]);

  const handleAddInclude = (): void => {
    const trimmed = includeDraft.trim();
    if (!trimmed) {
      return;
    }
    updateInput((draft) => {
      draft.context = { ...(draft.context ?? {}) };
      const current = Array.isArray(draft.context.include)
        ? [...draft.context.include]
        : [...includeEntries];
      current.push(trimmed);
      draft.context.include = current;
    });
    setIncludeDraft("");
  };

  const handleRemoveInclude = (index: number): void => {
    updateInput((draft) => {
      draft.context = { ...(draft.context ?? {}) };
      const current = Array.isArray(draft.context.include)
        ? [...draft.context.include]
        : [...includeEntries];
      const nextEntries = current.filter((_, idx) => idx !== index);
      draft.context.include = nextEntries;
    });
  };

  const handleUpdateInclude = (index: number, value: string): void => {
    updateInput((draft) => {
      draft.context = { ...(draft.context ?? {}) };
      const nextEntries = Array.isArray(draft.context.include)
        ? [...draft.context.include]
        : [...includeEntries];
      nextEntries[index] = value;
      draft.context.include = nextEntries;
    });
  };

  const handleAddExclude = (): void => {
    const trimmed = excludeDraft.trim();
    if (!trimmed) {
      return;
    }
    updateInput((draft) => {
      draft.context = { ...(draft.context ?? {}) };
      const current = Array.isArray(draft.context.exclude)
        ? [...draft.context.exclude]
        : [...excludeEntries];
      current.push(trimmed);
      draft.context.exclude = current;
    });
    setExcludeDraft("");
  };

  const handleRemoveExclude = (index: number): void => {
    updateInput((draft) => {
      draft.context = { ...(draft.context ?? {}) };
      const current = Array.isArray(draft.context.exclude)
        ? [...draft.context.exclude]
        : [...excludeEntries];
      const nextEntries = current.filter((_, idx) => idx !== index);
      draft.context.exclude = nextEntries;
    });
  };

  const handleUpdateExclude = (index: number, value: string): void => {
    updateInput((draft) => {
      draft.context = { ...(draft.context ?? {}) };
      const nextEntries = Array.isArray(draft.context.exclude)
        ? [...draft.context.exclude]
        : [...excludeEntries];
      nextEntries[index] = value;
      draft.context.exclude = nextEntries;
    });
  };

  const handleToggleTool = (toolId: string, enabled: boolean): void => {
    updateInput((draft) => {
      draft.tools = { ...(draft.tools ?? {}) };
      const currentEnabled = new Set(
        draft.tools.enabled ??
          effectiveInput.tools?.enabled ??
          currentConfig?.tools?.enabled ??
          []
      );
      const currentDisabled = new Set(
        draft.tools.disabled ??
          effectiveInput.tools?.disabled ??
          currentConfig?.tools?.disabled ??
          []
      );
      if (enabled) {
        currentEnabled.add(toolId);
        currentDisabled.delete(toolId);
      } else {
        currentEnabled.delete(toolId);
        currentDisabled.add(toolId);
      }
      const nextEnabled = Array.from(currentEnabled).sort();
      if (nextEnabled.length > 0) {
        draft.tools.enabled = nextEnabled;
      } else {
        delete draft.tools.enabled;
      }
      const nextDisabled = Array.from(currentDisabled).sort();
      if (nextDisabled.length > 0) {
        draft.tools.disabled = nextDisabled;
      } else {
        delete draft.tools.disabled;
      }
      if (Object.keys(draft.tools).length === 0) {
        delete draft.tools;
      }
    });
  };

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

  const sourceSnapshot = sourceQuery.data;
  const locationLabel =
    sourceSnapshot?.path && sourceSnapshot.path.trim().length > 0
      ? sourceSnapshot.path
      : "In-memory workspace";
  const sourceSizeBytes = sourceSnapshot?.content?.length ?? 0;
  const sizeLabel =
    sourceSizeBytes > 0
      ? `${(sourceSizeBytes / 1024).toFixed(1)} KB`
      : "0 KB";
  const approxLines =
    sourceSnapshot?.content !== undefined
      ? sourceSnapshot.content.split(/\n/u).length
      : 0;
  const formatLabel = mode.toUpperCase();
  const approxLinesLabel =
    approxLines > 0 ? approxLines.toLocaleString() : "0";

  return (
    <div
      className={cn(
        getSurfaceLayoutClasses("config"),
        SURFACE_CONTENT_CLASS
      )}
    >
      <Flex direction="column" gap="7">
        <Panel
          title="Configuration studio"
          description="Compose runtime settings with live previews, schema validation, and guardrails tailored for Eddie orchestrations."
          actions={
            <Flex direction={{ initial: "column", md: "row" }} wrap="wrap" gap="3" className="w-full max-w-xl">
              <Flex
                direction="column"
                gap="1"
                className="flex-1 min-w-[12rem] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-[0_25px_55px_-45px_rgba(16,185,129,0.7)] backdrop-blur"
              >
                <Text
                  size="1"
                  color="gray"
                  className="font-medium uppercase tracking-[0.18em]"
                >
                  Active format
                </Text>
                <Text size="4" className="font-semibold text-emerald-200">
                  {formatLabel}
                </Text>
              </Flex>
              <Flex
                direction="column"
                gap="1"
                className="flex-1 min-w-[12rem] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-[0_25px_55px_-45px_rgba(56,189,248,0.65)] backdrop-blur"
              >
                <Text
                  size="1"
                  color="gray"
                  className="font-medium uppercase tracking-[0.18em]"
                >
                  Approx size
                </Text>
                <Text size="4" className="font-semibold text-sky-200">
                  {sizeLabel}
                </Text>
              </Flex>
            </Flex>
          }
        >
          <Flex
            direction={{ initial: "column", md: "row" }}
            wrap="wrap"
            gap="3"
            className="w-full"
          >
            <Flex
              direction="column"
              gap="1"
              className="flex-1 min-w-[16rem] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-[0_25px_55px_-45px_rgba(250,204,21,0.6)] backdrop-blur"
            >
              <Text
                size="1"
                color="gray"
                className="font-medium uppercase tracking-[0.18em]"
              >
                Source path
              </Text>
              <Text
                size="3"
                className="truncate font-semibold text-amber-200"
                title={locationLabel}
              >
                {locationLabel}
              </Text>
              <Text size="1" color="gray">
                {approxLinesLabel} lines tracked
              </Text>
            </Flex>
          </Flex>
        </Panel>

        {statusMessage ? (
          <Callout.Root
            color={statusVariant === "error" ? "red" : "jade"}
            className="border border-white/10 bg-white/10 text-white/90 backdrop-blur"
          >
            <Callout.Icon>
              <CheckIcon />
            </Callout.Icon>
            <Callout.Text>{statusMessage}</Callout.Text>
          </Callout.Root>
        ) : null}

        {parseError ? (
          <Callout.Root
            color="red"
            className="border border-white/10 bg-white/10 text-white/90 backdrop-blur"
          >
            <Callout.Icon>
              <MixerHorizontalIcon />
            </Callout.Icon>
            <Callout.Text>{parseError}</Callout.Text>
          </Callout.Root>
        ) : null}

        {previewError ? (
          <Callout.Root
            color="amber"
            className="border border-white/10 bg-white/10 text-white/90 backdrop-blur"
          >
            <Callout.Icon>
              <MixerHorizontalIcon />
            </Callout.Icon>
            <Callout.Text>{previewError}</Callout.Text>
          </Callout.Root>
        ) : null}

        {guardrailWarnings.length > 0 && !parseError ? (
          <Callout.Root
            color="amber"
            className="border border-white/10 bg-white/10 text-white/90 backdrop-blur"
          >
            <Callout.Icon>
              <EyeOpenIcon />
            </Callout.Icon>
            <Flex direction="column" gap="2">
              <Callout.Text asChild>
                <Text as="span" weight="medium">
                Guardrails
                </Text>
              </Callout.Text>
              <ul className="list-disc space-y-1 pl-6 text-sm">
                {guardrailWarnings.map((warning) => (
                  <Callout.Text asChild key={warning}>
                    <li>{warning}</li>
                  </Callout.Text>
                ))}
              </ul>
            </Flex>
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
                  aria-label="Model"
                />
                <Button
                  size="2"
                  variant="surface"
                  onClick={() =>
                    setSystemPromptExpanded((previous) => !previous)
                  }
                >
                  {systemPromptExpanded ? "Hide system prompt" : "Edit system prompt"}
                </Button>
                {systemPromptExpanded ? (
                  <TextArea
                    aria-label="System prompt"
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
                      currentConfig?.systemPrompt ??
                    "System prompt used for orchestration"
                    }
                    rows={3}
                  />
                ) : null}
              </Flex>
              <Separator className="opacity-30" />
              <Flex direction="column" gap="3">
                <Text size="2" color="gray">
                  Provider configuration
                </Text>
                {providerOptions.length > 0 ? (
                  <Select.Root
                    value={selectedProviderValue}
                    onValueChange={(value) => {
                      if (value === "__custom__") {
                        const next = window.prompt(
                          "Provider identifier",
                          selectedProviderName ?? ""
                        );
                        const manual = next?.trim() ?? "";
                        if (!manual) {
                          return;
                        }
                        updateInput((draft) => {
                          draft.provider = { ...(draft.provider ?? {}) };
                          draft.provider.name = manual;
                          delete draft.provider.model;
                          if (Object.keys(draft.provider).length === 0) {
                            delete draft.provider;
                          }
                        });
                        return;
                      }
                      if (value === "__clear__") {
                        updateInput((draft) => {
                          draft.provider = { ...(draft.provider ?? {}) };
                          delete draft.provider.name;
                          delete draft.provider.model;
                          if (Object.keys(draft.provider).length === 0) {
                            delete draft.provider;
                          }
                        });
                        return;
                      }
                      updateInput((draft) => {
                        draft.provider = { ...(draft.provider ?? {}) };
                        if (value) {
                          const option = providerOptionsByValue.get(value);
                          const providerName = option?.providerName ?? value;
                          draft.provider.name = providerName;
                          if (option?.defaultModel) {
                            draft.provider.model = option.defaultModel;
                          } else {
                            delete draft.provider.model;
                          }
                        } else {
                          delete draft.provider.name;
                          delete draft.provider.model;
                        }
                        if (Object.keys(draft.provider).length === 0) {
                          delete draft.provider;
                        }
                      });
                    }}
                  >
                    <Select.Trigger
                      aria-label="Provider"
                      placeholder={currentConfig?.provider?.name ?? "Provider"}
                    />
                    <Select.Content>
                      {providerOptions.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                      <Select.Separator />
                      <Select.Item value="__custom__">Custom provider…</Select.Item>
                      {selectedProviderName ? (
                        <Select.Item value="__clear__">Clear provider</Select.Item>
                      ) : null}
                    </Select.Content>
                  </Select.Root>
                ) : null}
                {selectedProviderName ? (
                  <TextField.Root
                    value={effectiveInput.provider?.model ?? ""}
                    onChange={(event) =>
                      updateInput((draft) => {
                        draft.provider = { ...(draft.provider ?? {}) };
                        const next = event.target.value.trim();
                        if (next) {
                          draft.provider.model = next;
                        } else {
                          delete draft.provider.model;
                        }
                        if (Object.keys(draft.provider).length === 0) {
                          delete draft.provider;
                        }
                      })
                    }
                    placeholder="Provider model (optional)"
                    aria-label="Provider model"
                  />
                ) : null}
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
              <Flex direction="column" gap="2">
                <Flex gap="2">
                  <TextField.Root
                    value={includeDraft}
                    onChange={(event) => setIncludeDraft(event.target.value)}
                    placeholder="Add include pattern"
                    aria-label="Add include pattern"
                  />
                  <Button
                    variant="surface"
                    onClick={handleAddInclude}
                    disabled={includeDraft.trim().length === 0}
                  >
                  Add include
                  </Button>
                </Flex>
                <Flex direction="column" gap="2">
                  {includeEntries.length === 0 ? (
                    <Text size="2" color="gray">
                    No include globs configured yet.
                    </Text>
                  ) : (
                    includeEntries.map((pattern, index) => {
                      const inputId = `include-entry-${index + 1}`;
                      return (
                        <Flex key={`${pattern}-${index}`} gap="2" align="center">
                          <label className="sr-only" htmlFor={inputId}>
                            {`Include entry ${index + 1}`}
                          </label>
                          <TextField.Root
                            id={inputId}
                            value={pattern}
                            onChange={(event) =>
                              handleUpdateInclude(index, event.target.value)
                            }
                          />
                          <IconButton
                            variant="surface"
                            color="red"
                            aria-label={`Remove include entry ${index + 1}`}
                            onClick={() => handleRemoveInclude(index)}
                          >
                            <TrashIcon />
                          </IconButton>
                        </Flex>
                      );
                    })
                  )}
                </Flex>
              </Flex>
              <Flex direction="column" gap="2">
                <Flex gap="2">
                  <TextField.Root
                    value={excludeDraft}
                    onChange={(event) => setExcludeDraft(event.target.value)}
                    placeholder="Add exclude pattern"
                    aria-label="Add exclude pattern"
                  />
                  <Button
                    variant="surface"
                    onClick={handleAddExclude}
                    disabled={excludeDraft.trim().length === 0}
                  >
                  Add exclude
                  </Button>
                </Flex>
                <Flex direction="column" gap="2">
                  {excludeEntries.length === 0 ? (
                    <Text size="2" color="gray">
                    No exclude globs configured yet.
                    </Text>
                  ) : (
                    excludeEntries.map((pattern, index) => {
                      const inputId = `exclude-entry-${index + 1}`;
                      return (
                        <Flex key={`${pattern}-${index}`} gap="2" align="center">
                          <label className="sr-only" htmlFor={inputId}>
                            {`Exclude entry ${index + 1}`}
                          </label>
                          <TextField.Root
                            id={inputId}
                            value={pattern}
                            onChange={(event) =>
                              handleUpdateExclude(index, event.target.value)
                            }
                          />
                          <IconButton
                            variant="surface"
                            color="red"
                            aria-label={`Remove exclude entry ${index + 1}`}
                            onClick={() => handleRemoveExclude(index)}
                          >
                            <TrashIcon />
                          </IconButton>
                        </Flex>
                      );
                    })
                  )}
                </Flex>
              </Flex>
            </Section>

            <Section
              title="Logging & Tools"
              description="Tune output verbosity and tool usage."
            >
              <Flex align="center" gap="3">
                <Text size="2">Logging level</Text>
                <Select.Root
                  value={effectiveInput.logging?.level ?? ""}
                  onValueChange={(value) => {
                    if (value === "__clear__") {
                      updateInput((draft) => {
                        draft.logging = { ...(draft.logging ?? {}) };
                        delete draft.logging.level;
                        if (Object.keys(draft.logging).length === 0) {
                          delete draft.logging;
                        }
                      });
                      return;
                    }
                    updateInput((draft) => {
                      draft.logging = { ...(draft.logging ?? {}) };
                      if (value) {
                        draft.logging.level = value as never;
                      } else {
                        delete draft.logging.level;
                      }
                      if (Object.keys(draft.logging).length === 0) {
                        delete draft.logging;
                      }
                    });
                  }}
                >
                  <Select.Trigger
                    aria-label="Log level"
                    placeholder={currentConfig?.logging?.level ?? "info"}
                  />
                  <Select.Content>
                    {logLevelOptions.map((level) => (
                      <Select.Item key={level} value={level}>
                        {level}
                      </Select.Item>
                    ))}
                    {(effectiveInput.logging?.level ?? "") ? (
                      <>
                        <Select.Separator />
                        <Select.Item value="__clear__">Clear log level</Select.Item>
                      </>
                    ) : null}
                  </Select.Content>
                </Select.Root>
              </Flex>
              <Flex direction="column" gap="3">
                <Text size="2" color="gray">
                Enabled tools
                </Text>
                {configuredTools.length === 0 ? (
                  <Text size="2" color="gray">
                  No tools discovered from the current configuration.
                  </Text>
                ) : (
                  configuredTools.map((toolId) => {
                    const toolSources = [
                      effectiveInput.tools,
                      baselineInput.tools,
                      currentConfig?.tools,
                    ].filter(
                      (value): value is NonNullable<EddieConfigInputDto["tools"]> =>
                        Boolean(value)
                    );
                    let resolvedState: boolean | null = null;
                    for (const source of toolSources) {
                      if ("enabled" in source) {
                        resolvedState = source.enabled?.includes(toolId) ?? false;
                        break;
                      }
                      if ("disabled" in source) {
                        resolvedState = !(source.disabled?.includes(toolId) ?? false);
                        break;
                      }
                    }
                    const isEnabled = resolvedState ?? false;
                    return (
                      <Flex key={toolId} align="center" gap="3" justify="between">
                        <Text size="2">{`${toolId} tool`}</Text>
                        <Switch
                          checked={isEnabled}
                          aria-label={`${toolId} tool`}
                          onCheckedChange={(checked) =>
                            handleToggleTool(toolId, checked)
                          }
                        />
                      </Flex>
                    );
                  })
                )}
                <Flex align="center" gap="3">
                  <Switch
                    checked={autoApproveChecked}
                    aria-label="Auto-approve tool calls"
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
              <Select.Root
                value={effectiveInput.agents?.mode ?? ""}
                onValueChange={(value) => {
                  if (value === "__clear__") {
                    updateInput((draft) => {
                      draft.agents = { ...(draft.agents ?? {}) };
                      delete draft.agents.mode;
                    });
                    return;
                  }
                  updateInput((draft) => {
                    draft.agents = { ...(draft.agents ?? {}) };
                    if (value) {
                      draft.agents.mode = value;
                    } else {
                      delete draft.agents.mode;
                    }
                  });
                }}
              >
                <Select.Trigger
                  aria-label="Agent mode"
                  placeholder={currentConfig?.agents?.mode ?? "single"}
                />
                <Select.Content>
                  <Select.Item value="single">single</Select.Item>
                  <Select.Item value="router">router</Select.Item>
                  <Select.Item value="manager">manager</Select.Item>
                  {(effectiveInput.agents?.mode ?? "") ? (
                    <>
                      <Select.Separator />
                      <Select.Item value="__clear__">Clear mode</Select.Item>
                    </>
                  ) : null}
                </Select.Content>
              </Select.Root>
              <Button
                size="2"
                variant="surface"
                onClick={() =>
                  setManagerPromptExpanded((previous) => !previous)
                }
              >
                {managerPromptExpanded
                  ? "Hide manager prompt"
                  : "Edit manager prompt"}
              </Button>
              {managerPromptExpanded ? (
                <TextArea
                  aria-label="Manager prompt"
                  value={effectiveInput.agents?.manager?.prompt ?? ""}
                  onChange={(event) =>
                    updateInput((draft) => {
                      draft.agents = { ...(draft.agents ?? {}) };
                      draft.agents.manager = {
                        ...(draft.agents.manager ?? {}),
                      };
                      const next = event.target.value || undefined;
                      if (next) {
                        draft.agents.manager.prompt = next;
                      } else {
                        delete draft.agents.manager.prompt;
                      }
                      if (Object.keys(draft.agents.manager).length === 0) {
                        delete draft.agents.manager;
                      }
                    })
                  }
                  placeholder={
                    currentConfig?.agents?.manager?.prompt ?? "Manager prompt"
                  }
                  rows={4}
                />
              ) : null}
              <Flex align="center" gap="3">
                <Switch
                  checked={enableSubagentsChecked}
                  aria-label="Enable subagents"
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
            <Panel
              title="Source editor"
              actions={
                <Flex align="center" gap="3">
                  <Badge color={isDirty ? "amber" : "jade"}>
                    {isDirty ? "Unsaved" : "Up to date"}
                  </Badge>
                  <Select.Root value={mode} onValueChange={handleFormatChange}>
                    <Select.Trigger aria-label="Editor mode" />
                    <Select.Content>
                      <Select.Item value="yaml">YAML</Select.Item>
                      <Select.Item value="json">JSON</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Flex>
              }
            >
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
            </Panel>

            <Panel title="Effective configuration preview">
              {isPreviewing ? (
                <Text color="gray">Validating configuration…</Text>
              ) : currentConfig ? (
                <Flex direction="column" gap="3">
                  <Flex gap="2" align="center">
                    <Text weight="medium">Provider:</Text>
                    <Text>{currentConfig.provider?.name ?? "Unknown"}</Text>
                  </Flex>
                  <Flex gap="2" align="center">
                    <Text
                      aria-label={`Model: ${currentConfig.model ?? "Unknown"}`}
                      asChild
                    >
                      <span>
                        <span className="font-medium">Model:</span>{" "}
                        <span aria-hidden="true">
                          {currentConfig.model
                            ? currentConfig.model.replace(/-/gu, "\u2011")
                            : "Unknown"}
                        </span>
                      </span>
                    </Text>
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
            </Panel>
          </Flex>
        </Flex>
      </Flex>
    </div>
  );
}

