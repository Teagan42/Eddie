import type { ComponentType } from 'react';

import { EddieButton } from '../components/EddieButton';
import { EddieIcon } from '../components/EddieIcon';
import { Panel } from '../common/Panel';
import { AppHeader } from '../layout/AppHeader';
import { NavigationLink } from '../navigation/NavigationLink';

export interface ComponentLibraryEntry {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
  readonly component: ComponentType<unknown>;
}

export interface ComponentLibraryCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly components: ReadonlyArray<ComponentLibraryEntry>;
}

export interface ComponentLibrary {
  readonly categories: ReadonlyArray<ComponentLibraryCategory>;
}

export interface ComponentLibraryLookupResult {
  readonly category: ComponentLibraryCategory;
  readonly entry: ComponentLibraryEntry;
}

const categories: ComponentLibraryCategory[] = [
  {
    id: 'core',
    title: 'Core primitives',
    description: 'Hero components that power Eddie surfaces.',
    components: [
      {
        slug: 'eddie-button',
        name: 'Eddie Button',
        description: 'Gradient call-to-action button styled for hero surfaces.',
        tags: [ 'cta', 'button' ],
        component: EddieButton,
      },
      {
        slug: 'eddie-icon',
        name: 'Eddie Icon',
        description: 'Hero console icon wrapper with Eddie theming.',
        tags: [ 'icon', 'branding' ],
        component: EddieIcon,
      },
    ],
  },
  {
    id: 'layout',
    title: 'Layout primitives',
    description: 'Reusable layout structures for dashboards and shells.',
    components: [
      {
        slug: 'panel',
        name: 'Panel',
        description: 'Composable panel surface with themed chrome and controls.',
        tags: [ 'layout', 'surface' ],
        component: Panel,
      },
      {
        slug: 'app-header',
        name: 'App Header',
        description: 'Navigation shell header with status and session actions.',
        tags: [ 'layout', 'navigation' ],
        component: AppHeader,
      },
      {
        slug: 'navigation-link',
        name: 'Navigation Link',
        description: 'Router-aware navigation link for Eddie control planes.',
        tags: [ 'navigation', 'link' ],
        component: NavigationLink,
      },
    ],
  },
];

export const COMPONENT_LIBRARY: ComponentLibrary = freezeComponentLibrary({ categories });

const componentIndex = buildComponentLibraryIndex(COMPONENT_LIBRARY);

export function getComponentLibraryEntry(
  slug: string
): ComponentLibraryLookupResult | undefined {
  return componentIndex.get(slug);
}

function buildComponentLibraryIndex(
  library: ComponentLibrary
): Map<string, ComponentLibraryLookupResult> {
  const index = new Map<string, ComponentLibraryLookupResult>();

  for (const category of library.categories) {
    for (const entry of category.components) {
      index.set(entry.slug, { category, entry });
    }
  }

  return index;
}

function freezeComponentLibrary(library: ComponentLibrary): ComponentLibrary {
  for (const category of library.categories) {
    for (const entry of category.components) {
      Object.freeze(entry);
    }

    Object.freeze(category.components);
    Object.freeze(category);
  }

  Object.freeze(library.categories);

  return Object.freeze(library);
}
