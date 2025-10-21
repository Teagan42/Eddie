import type { JSX } from "react";

export interface OverviewAuthPanelProps {
  readonly apiKey?: string | null;
  readonly onApiKeyChange?: (value: string) => void;
}

export function OverviewAuthPanel(_props: OverviewAuthPanelProps): JSX.Element | null {
  return null;
}
