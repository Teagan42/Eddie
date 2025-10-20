/**
 * Shared metadata for the Eddie UI package.
 */
export const UI_PACKAGE_NAME = '@eddie/ui';

export type UiSurface = 'cli' | 'web' | 'api';

export interface UiPackageMetadata {
  /**
   * Name of the consuming surface, used for display purposes.
   */
  surface: UiSurface;
  /**
   * Semver version string for the UI feature set.
   */
  version: string;
}

export type UiMetadata = Readonly<UiPackageMetadata>;

/**
 * Creates a metadata record for UI consumers to advertise their surface.
 */
export function createUiMetadata(metadata: UiPackageMetadata): UiMetadata {
  return { ...metadata };
}

export { EddieButton } from './components/eddie-button';
export type { EddieButtonProps } from './components/eddie-button';
export { EddieIcon } from './components/eddie-icon';
export type { EddieIconProps } from './components/eddie-icon';
export { AuroraBackground, JsonTreeView, Panel } from './common';
export type {
  AuroraBackgroundProps,
  JsonTreeViewProps,
  PanelProps,
} from './common';
export { ChatWindow, MessageComposer } from './chat';
export type {
  ChatMessage,
  ChatRole,
  ChatWindowProps,
  MessageComposerProps,
  SessionMetrics,
} from './chat';
export { AppHeader } from './layout';
export type { AppHeaderProps } from './layout';
export { NavigationLink } from './navigation';
export type { NavigationLinkProps } from './navigation';
