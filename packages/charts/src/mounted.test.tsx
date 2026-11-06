// @vitest-environment happy-dom
import { act, StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LineTrendChart, OutputChart, ParetoChart } from './components';
import { outputInput, paretoInput, trendInput } from './fixtures';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

for (const strict of [false, true]) {
  for (const [name, Component, input] of [
    ['trend', LineTrendChart, trendInput], ['pareto', ParetoChart, paretoInput], ['output', OutputChart, outputInput],
  ] as const) {
    it(`${name} survives populated, empty, populated and unmount (StrictMode=${strict})`, async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const errors: unknown[] = [];
      const root = createRoot(container, { onUncaughtError: error => errors.push(error) });
      const render = (empty: boolean) => {
        // The union of chart prop types is safe here because each component stays paired with its input.
        const chart = createElement(Component as typeof LineTrendChart, { ...input, data: empty ? [] : input.data, testId: name, emptyTestId: 'performance.empty', height: 200 } as Parameters<typeof LineTrendChart>[0]);
        root.render(strict ? <StrictMode>{chart}</StrictMode> : chart);
      };
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await act(() => render(false));
        await act(() => render(true));
        const emptyLabel = container.querySelector('[data-testid="performance.empty"]');
        const imageParent = emptyLabel?.closest('[role="img"]');
        await act(() => render(false));
        await act(() => root.unmount());
        expect(errors).toEqual([]);
        expect(emptyLabel).not.toBeNull();
        expect(imageParent).toBeNull();
      } finally { warning.mockRestore(); container.remove(); }
    });
  }
}
