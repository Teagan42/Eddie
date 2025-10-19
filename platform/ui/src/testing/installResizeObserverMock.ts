export function installResizeObserverMock(): void {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
}
