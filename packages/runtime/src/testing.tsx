import { act, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export async function mount(node: ReactNode, strict = false) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next: ReactNode) => {
    await act(() => root.render(strict ? <StrictMode>{next}</StrictMode> : next));
  };
  await render(node);
  return { container, render, async unmount() { await act(() => root.unmount()); container.remove(); } };
}
