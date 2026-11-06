import { afterEach, expect, it, vi } from 'vitest';
import { createChart } from './lifecycle';
import { init } from './register';

vi.mock('./register', () => ({ init: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('keeps one SVG instance for updates, observes size and disposes on cleanup', () => {
  const chart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
  vi.mocked(init).mockReturnValue(chart as unknown as ReturnType<typeof init>);
  const observe = vi.fn();
  const disconnect = vi.fn();
  let resize: () => void = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe = observe; disconnect = disconnect; });
  const element = {} as HTMLDivElement;
  const instance = createChart(element);
  instance.update({ animation: false });
  instance.update({ animation: false, series: [] });
  expect(init).toHaveBeenCalledExactlyOnceWith(element, null, { renderer: 'svg' });
  expect(chart.setOption.mock.calls).toEqual([[{ animation: false }, { replaceMerge: ['series', 'xAxis', 'yAxis'] }], [{ animation: false, series: [] }, { replaceMerge: ['series', 'xAxis', 'yAxis'] }]]);
  expect(observe).toHaveBeenCalledWith(element);
  resize();
  expect(chart.resize).toHaveBeenCalledOnce();
  instance.dispose();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(chart.dispose).toHaveBeenCalledOnce();
});
