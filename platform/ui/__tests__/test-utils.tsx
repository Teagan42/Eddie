import { render } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import type { ReactElement } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function ensureUIEnvironment(): void {
  if (!globalThis.ResizeObserver) {
    Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
  }

  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }

  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }

  if (typeof window !== 'undefined' && !window.scrollTo) {
    window.scrollTo = () => {};
  }
}

ensureUIEnvironment();

function withUIProviders(ui: ReactElement): ReactElement {
  ensureUIEnvironment();
  return <Theme>{ui}</Theme>;
}

export function renderWithUIProviders(
  ui: ReactElement,
  options?: RenderOptions,
): RenderResult {
  const result = render(withUIProviders(ui), options);

  return {
    ...result,
    rerender(nextUi: ReactElement) {
      return result.rerender(withUIProviders(nextUi));
    },
  };
}
