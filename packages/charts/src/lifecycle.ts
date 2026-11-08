import { init } from './register';
import type { ChartOption } from './types';

/** One mounted chart owns its instance and observer for their entire lifetime. */
export function createChart(element: HTMLDivElement, onDataClick?: (index: number) => void) {
  const chart = init(element, null, { renderer: 'svg' });
  if (onDataClick) chart.on('click', params => {
    if (params.componentType === 'series' && Number.isInteger(params.dataIndex)) onDataClick(params.dataIndex);
  });
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => chart.resize());
  observer?.observe(element);
  return {
    update(option: ChartOption) { chart.setOption(option, { replaceMerge: ['series', 'xAxis', 'yAxis'] }); },
    dispose() { observer?.disconnect(); chart.dispose(); },
  };
}
