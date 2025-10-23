import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';

import {
  AppHeader,
  COMPONENT_LIBRARY,
  EddieButton,
  EddieIcon,
  NavigationLink,
  Panel,
  getComponentLibraryEntry,
} from '../../src';

const findCategory = (id: string) =>
  COMPONENT_LIBRARY.categories.find((category) => category.id === id);

const getEntry = (categoryId: string, slug: string) =>
  findCategory(categoryId)?.components.find((entry) => entry.slug === slug);

describe('component library catalog', () => {
  it('groups hero primitives under the core category for browsing', () => {
    const coreCategory = findCategory('core');

    expect(coreCategory?.title).toMatch(/core/i);
    expect(coreCategory?.components.map((entry) => entry.slug)).toEqual(
      expect.arrayContaining(['eddie-button', 'eddie-icon'])
    );

    expect(getEntry('core', 'eddie-button')?.component).toBe(EddieButton);
    expect(getEntry('core', 'eddie-icon')?.component).toBe(EddieIcon);
  });

  it('organizes layout primitives separately for navigation surfaces', () => {
    const layoutCategory = findCategory('layout');

    expect(layoutCategory?.components.map((entry) => entry.slug)).toEqual(
      expect.arrayContaining(['panel', 'app-header', 'navigation-link'])
    );

    expect(getEntry('layout', 'panel')?.component).toBe(Panel);
    expect(getEntry('layout', 'app-header')?.component).toBe(AppHeader);
    expect(getEntry('layout', 'navigation-link')?.component).toBe(NavigationLink);
  });

  it('retrieves rich metadata for slug-based lookups', () => {
    const lookup = getComponentLibraryEntry('eddie-icon');

    expect(lookup?.category.id).toBe('core');
    expect(lookup?.entry.component).toBe(EddieIcon);
    expect(lookup?.entry.name.length).toBeGreaterThan(0);
    expect(lookup?.entry.description.length).toBeGreaterThan(0);
    expect(Array.isArray(lookup?.entry.tags)).toBe(true);
    expect(lookup?.entry.tags.length).toBeGreaterThan(0);
  });
});
