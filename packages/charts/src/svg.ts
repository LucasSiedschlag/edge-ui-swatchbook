import { init } from './register';
import type { ChartOption } from './types';

/** Render a standalone SVG in Node without creating a DOM. */
export function renderChartSvg(option: ChartOption, { width, height }: { width: number; height: number }): string {
  const chart = init(null, null, { renderer: 'svg', ssr: true, width, height });
  try {
    chart.setOption(option);
    // ECharts allocates IDs and CSS classes from process-wide counters. Keep
    // their references intact while giving this standalone artifact stable IDs.
    const ids = new Map<string, string>();
    return chart.renderToSVGString().replace(/((?:id|class)="|url\(#|\.)(zr\d+-(?:cls-\d+|[cgps]\d+))/g, (_, prefix: string, id: string) => {
      if (!ids.has(id)) ids.set(id, `chart-${ids.size}`);
      return prefix + ids.get(id);
    });
  } finally {
    chart.dispose();
  }
}
