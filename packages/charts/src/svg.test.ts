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

it.each([
  // Observed SVG bounds at 640 x 320: legend text top/bottom and plot top/bottom.
  [12, 6.5, 18.5, 75, 288],
  [14, 5.5, 19.5, 79, 286],
  [24, 5, 29, 99, 276],
])('keeps the rendered legend above the plot at font size %s', (fontSize, legendTop, legendBottom, plotTop, plotBottom) => {
  const svg = renderChartSvg(buildLineTrendOption({ ...trendInput, theme: { ...trendInput.theme, fontSize } }), { width: 640, height: 320 });
  const legendText = svg.match(/<text[^>]*>Temperature<\/text>/)![0];
  const translateY = Number(legendText.match(/transform="translate\([^ ]+ ([^)]+)\)"/)![1]);
  const localY = Number(legendText.match(/ y="([^"]+)"/)![1]);
  expect(translateY + localY - fontSize / 2).toBe(legendTop);
  expect(translateY + localY + fontSize / 2).toBe(legendBottom);
  // Read vertical grid lines from the SVG, independently of option-builder formulas.
  const gridLines = [...svg.matchAll(/<path d="M[\d.]+ ([\d.]+)L[\d.]+ ([\d.]+)"[^>]*stroke="#dedede"[^>]*>/g)]
    .map(match => [Number(match[1]), Number(match[2])]).filter(([start, end]) => start !== end);
  const longLines = gridLines.filter(([start, end]) => Math.abs(end! - start!) > 100);
  expect(longLines.length).toBeGreaterThanOrEqual(4);
  for (const coordinates of longLines) expect(coordinates.sort((a, b) => a! - b!)).toEqual([plotTop, plotBottom]);
  expect(legendBottom).toBeLessThan(plotTop);
});
