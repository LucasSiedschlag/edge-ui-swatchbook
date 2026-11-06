import { expect, it } from 'vitest';
import { buildLineTrendOption, buildOutputOption, buildParetoOption } from './options';
import { outputInput, paretoInput, trendInput } from './fixtures';
import { renderChartSvg } from './svg';

it.each([
  ['trend', buildLineTrendOption(trendInput), 'Temperature'],
  ['pareto', buildParetoOption(paretoInput), 'reason:change'],
  ['output', buildOutputOption(outputInput), 'Good'],
] as const)('renders %s using only registered modules and produces identical SVG bytes twice', (_, option, content) => {
  const svg = renderChartSvg(option, { width: 640, height: 320 });
  expect(svg).toMatch(/^<svg/);
  expect(svg).toContain(content);
  expect(svg).toContain('<path');
  expect(renderChartSvg(option, { width: 640, height: 320 })).toBe(svg);
});
