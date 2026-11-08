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

it.each([871, 1031])('renders four unit axes and a scroll legend without limit end labels at width %s', width => {
  const data = ['A', 'V', 'degC', 'kW'].map((unit, index) => ({
    id: `tag-${index}`, name: `E1-machine-${index} measured Tag`, unit, min: 0, max: 40,
    points: [{ tick: 0, value: 10, setpoint: 20, status: 'normal' }, { tick: 300, value: 12, setpoint: 20, status: 'normal' }],
  }));
  const svg = renderChartSvg(buildLineTrendOption({ ...trendInput, data }), { width, height: 320 });
  for (const { unit, name } of data) {
    expect(svg).toContain(`>${unit}</text>`);
    expect(svg).toContain(name);
  }
  expect(svg).toContain('Setpoint');
  expect(svg).toContain('Time');
  expect(svg).not.toContain('Minimum:');
  expect(svg).not.toContain('Maximum:');
});

it('keeps unit names above their own axes when time zero is at the right edge', () => {
  const data = ['A', 'degC', 'V', 'kW'].map((unit, index) => ({
    id: `tag-${index}`, name: `Tag ${index}`, unit,
    points: [{ tick: -300, value: 10, status: 'normal' }, { tick: 0, value: 12, status: 'normal' }],
  }));
  const svg = renderChartSvg(buildLineTrendOption({ ...trendInput, data }), { width: 1440, height: 320 });
  const positions = ['V', 'A', 'degC', 'kW'].map(unit => {
    const text = svg.match(new RegExp(`<text[^>]*>${unit}</text>`))?.[0];
    expect(text).toBeDefined();
    return Number(text?.match(/transform="translate\(([-\d.]+)/)?.[1]);
  });
  expect(positions.every(Number.isFinite)).toBe(true);
  for (let i = 1; i < positions.length; i++) expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(95);
});
