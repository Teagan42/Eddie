import type { EddieConfigSourceDto } from "@eddie/api-client";

export interface ProviderProfileSnapshot {
  provider?: {
    name?: string;
    [key: string]: unknown;
  };
  model?: string;
  label?: string;
  [key: string]: unknown;
}

export interface ProviderOption {
  value: string;
  label: string;
  providerName: string;
  defaultModel?: string;
}

export function extractProviderProfiles(
  config: EddieConfigSourceDto["config"] | undefined | null,
): Record<string, ProviderProfileSnapshot> {
  if (!config || typeof config !== "object") {
    return {};
  }

  const candidate = (config as { providers?: unknown }).providers;
  if (!candidate || typeof candidate !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(candidate).filter((entry): entry is [string, ProviderProfileSnapshot] => {
      const [, profile] = entry;
      return typeof profile === "object" && profile !== null;
    }),
  );
}

export function createProviderProfileOptions(
  providerProfiles: Record<string, ProviderProfileSnapshot>,
): ProviderOption[] {
  const entries = Object.entries(providerProfiles);
  if (entries.length === 0) {
    return [];
  }

  const options: ProviderOption[] = entries.reduce<ProviderOption[]>((acc, [profileId, profile]) => {
    const providerName = profile?.provider?.name;
    if (!providerName) {
      return acc;
    }

    const labelCandidate = typeof profile.label === "string" ? profile.label.trim() : "";
    const optionLabel = labelCandidate ? labelCandidate : profileId;

    acc.push({
      value: profileId,
      label: optionLabel,
      providerName,
      defaultModel: typeof profile.model === "string" ? profile.model : undefined,
    });
    return acc;
  }, []);

  options.sort((a, b) => a.label.localeCompare(b.label));

  return options;
}
