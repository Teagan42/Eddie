import '@testing-library/jest-dom'
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from 'vitest';

if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  class ResizeObserverMock implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(): void {
      // No-op for tests
    }

    unobserve(): void {
      // No-op for tests
    }

    disconnect(): void {
      // No-op for tests
    }
  }

  const resizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = resizeObserver;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = resizeObserver;
}

if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => { };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => { };
  }
}

afterEach(() => {
  cleanup();
});