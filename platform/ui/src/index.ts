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

export { EddieButton, type EddieButtonProps } from './components/EddieButton';
export { EddieIcon, type EddieIconProps } from './components/EddieIcon';
export { AuroraBackground, JsonTreeView, Panel } from './common';
export type {
  AuroraBackgroundProps,
  JsonTreeViewProps,
  PanelProps,
} from './common';
export { AppHeader } from './layout';
export type { AppHeaderProps } from './layout';
export { NavigationLink } from './navigation';
export type { NavigationLinkProps } from './navigation';
export * from './chat';
export * from './overview';
