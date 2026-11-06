import { init } from './register';
import type { ChartOption } from './types';

/** One mounted chart owns its instance and observer for their entire lifetime. */
export function createChart(element: HTMLDivElement) {
  const chart = init(element, null, { renderer: 'svg' });
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => chart.resize());
  observer?.observe(element);
  return {
    update(option: ChartOption) { chart.setOption(option, { notMerge: true }); },
    dispose() { observer?.disconnect(); chart.dispose(); },
  };
}
