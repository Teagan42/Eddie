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
