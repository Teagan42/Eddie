import type { ComponentType } from "react";

export interface OverviewTheme {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly previewUrl?: string;
}

export interface OverviewStat {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
  readonly icon: ComponentType<{ readonly className?: string }>;
}

export interface OverviewStatsGridProps {
  readonly stats?: readonly OverviewStat[];
}

export interface OverviewHeroProps {
  readonly apiKey?: string | null;
  readonly apiUrl?: string | null;
  readonly theme: OverviewTheme["id"];
  readonly themes: readonly OverviewTheme[];
  readonly stats: readonly OverviewStat[];
  readonly onSelectTheme: (theme: OverviewTheme["id"]) => void;
  readonly onRemoveApiKey?: () => void;
  readonly isThemeSelectorDisabled?: boolean;
}

export interface OverviewAuthPanelProps {
  readonly apiKey?: string | null;
  readonly onApiKeyChange?: (value: string) => void;
}

export interface SessionItem {
  readonly id: string;
  readonly title: string;
}

export interface SessionsListProps {
  readonly sessions: readonly SessionItem[];
}
