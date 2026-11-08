// Ant Design reads layout and media APIs that happy-dom does not provide.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
