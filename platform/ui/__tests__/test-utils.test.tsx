import { describe, expect, it } from 'vitest';
import { renderWithUIProviders } from './test-utils';

function deleteGlobalResizeObserver(): void {
  Reflect.deleteProperty(globalThis as Record<string, unknown>, 'ResizeObserver');
}

describe('renderWithUIProviders environment guards', () => {
  it('restores DOM shims when they are removed between tests', () => {
    const originalResizeObserver = (globalThis as {
      ResizeObserver?: typeof ResizeObserver;
    }).ResizeObserver;
    const originalHasPointerCapture = HTMLElement.prototype
      .hasPointerCapture;

    deleteGlobalResizeObserver();
    // @ts-expect-error -- simulate DOM missing pointer capture support
    delete HTMLElement.prototype.hasPointerCapture;

    renderWithUIProviders(<div />);

    expect(globalThis.ResizeObserver).toBeTypeOf('function');
    expect(HTMLElement.prototype.hasPointerCapture).toBeTypeOf('function');

    if (originalResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
        originalResizeObserver;
    } else {
      deleteGlobalResizeObserver();
    }
    if (originalHasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
    } else {
      // @ts-expect-error -- match deletion we performed earlier
      delete HTMLElement.prototype.hasPointerCapture;
    }
  });
});
