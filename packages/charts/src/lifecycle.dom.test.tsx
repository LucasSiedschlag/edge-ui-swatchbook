// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createChart } from './lifecycle';
import * as registration from './register';
import { LineTrendChart } from './components';
import { trendInput } from './fixtures';
import { buildLineTrendOption } from './options';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps real legend selection and an open tooltip across a data tick', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const original = registration.init;
  const engine = original(host, null, { renderer: 'svg', width: 600, height: 300 });
  const init = vi.spyOn(registration, 'init').mockReturnValue(engine);
  const chart = createChart(host);
  try {
    chart.update(buildLineTrendOption(trendInput));
    engine.dispatchAction({ type: 'legendUnSelect', name: 'Temperature' });
    chart.update(buildLineTrendOption({ ...trendInput, data: [{ ...trendInput.data[0]!, points: [{ tick: 3, value: 21, status: 'normal' }] }] }));
    expect(engine.getOption()).toMatchObject({ legend: [{ selected: { Temperature: false } }] });
    engine.dispatchAction({ type: 'legendSelect', name: 'Temperature' });
    engine.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(host.textContent).toContain('time:3');
    chart.update(buildLineTrendOption({ ...trendInput, data: [{ ...trendInput.data[0]!, points: [{ tick: 3, value: 22, status: 'normal' }] }] }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(host.textContent).toContain('time:3');
    expect(host.textContent).toContain('22 °C');
  } finally { chart.dispose(); init.mockRestore(); host.remove(); }
});

it('does not apply an option again for an unrelated React render', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const original = registration.init;
  const engine = original(document.createElement('div'), null, { renderer: 'svg', width: 600, height: 300 });
  const init = vi.spyOn(registration, 'init').mockReturnValue(engine);
  const update = vi.spyOn(engine, 'setOption');
  const root = createRoot(host);
  try {
    await act(() => root.render(<LineTrendChart {...trendInput} testId="trend" height={200} />));
    await act(() => root.render(<LineTrendChart {...trendInput} testId="trend" height={210} />));
    expect(update).toHaveBeenCalledTimes(1);
    await act(() => root.render(<LineTrendChart {...trendInput} data={[...trendInput.data]} testId="trend" height={210} />));
    expect(update).toHaveBeenCalledTimes(2);
  } finally { await act(() => root.unmount()); init.mockRestore(); update.mockRestore(); host.remove(); }
});
