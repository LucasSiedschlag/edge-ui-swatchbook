import { expect, it } from 'vitest';
import { init } from './register';

it('renders an SVG string on the server, so tests can read a chart without a browser', () => {
  const chart = init(null, null, { renderer: 'svg', ssr: true, width: 300, height: 200 });
  chart.setOption({ animation: false, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'line', data: [1, 2] }] });
  const svg = chart.renderToSVGString();
  chart.dispose();
  expect(svg.startsWith('<svg')).toBe(true);
});
