// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ParetoChart } from './components';
import { createChart } from './lifecycle';
import { paretoInput } from './fixtures';

vi.mock('./lifecycle', () => ({ createChart: vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() })) }));

it('routes chart data clicks to reason IDs and keeps the latest data and callback under StrictMode', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  try {
    await act(() => root.render(<StrictMode><ParetoChart {...paretoInput} testId="pareto" height={300} onReasonSelect={select} /></StrictMode>));
    const initialInstances = vi.mocked(createChart).mock.calls.length;
    const handler = vi.mocked(createChart).mock.calls.at(-1)![1]!;
    handler(1);
    handler(100);
    expect(select.mock.calls).toEqual([['jam']]);
    const next = vi.fn();
    await act(() => root.render(<StrictMode><ParetoChart {...paretoInput} data={[paretoInput.data[2]!]} testId="pareto" height={300} selectedReason="other" onReasonSelect={next} /></StrictMode>));
    expect(vi.mocked(createChart).mock.calls.length).toBe(initialInstances);
    handler(0);
    expect(next).toHaveBeenCalledExactlyOnceWith('other');
    expect(select).toHaveBeenCalledTimes(1);
    expect(host.querySelector('tbody')?.textContent).toContain('reason:other');
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
  const instances = vi.mocked(createChart).mock.results.map(result => result.value);
  for (const instance of instances) expect(instance.dispose).toHaveBeenCalledOnce();
});
