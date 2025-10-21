import type { JSX } from "react";

export interface SessionItem {
  readonly id: string;
  readonly title: string;
}

export interface SessionsListProps {
  readonly sessions: readonly SessionItem[];
}

export function SessionsList(_props: SessionsListProps): JSX.Element | null {
  return null;
}
