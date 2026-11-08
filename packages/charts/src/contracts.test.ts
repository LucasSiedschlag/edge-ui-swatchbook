import { expect, it } from 'vitest';
import * as api from './index';
import { buildLineTrendOption, buildOutputOption, buildParetoOption } from './options';
import { outputInput, paretoInput, trendInput } from './fixtures';
import type { ChartTheme } from './theme';

it('exports the complete public wrapper API', () => {
  for (const name of ['LineTrendChart', 'ParetoChart', 'OutputChart', 'ChartThemeProvider', 'useChartTheme', 'lightChartTheme', 'darkChartTheme', 'buildLineTrendOption', 'buildParetoOption', 'buildOutputOption', 'renderChartSvg']) {
    expect(api).toHaveProperty(name);
  }
});

it('keeps supplied limits and setpoints inside each unit axis, with padding', () => {
  const option = buildLineTrendOption({ ...trendInput, data: [{ ...trendInput.data[0]!, min: 0, max: 30, setpoint: 40 }] });
  expect(option.yAxis).toMatchObject([{ min: -2, max: 42, scale: true }]);
  expect(option.series).toMatchObject([{ markLine: { data: [{ yAxis: 0 }, { yAxis: 30 }, { yAxis: 40 }] } }]);
});

it('gets every explicit color and font from the supplied Library tokens, including emphasis', () => {
  const theme: ChartTheme = {
    fontFamily: 'Library Font', fontSize: 17,
    textColor: '#010101', mutedTextColor: '#020202', gridColor: '#030303', backgroundColor: '#040404',
    seriesColors: ['#050505', '#060606', '#070707', '#080808', '#090909', '#101010'],
    goodColor: '#111111', scrapColor: '#121212', targetColor: '#131313', limitColor: '#141414', warningColor: '#151515',
    tooltipBackgroundColor: '#161616', tooltipTextColor: '#171717', tooltipBorderColor: '#181818',
  };
  const allowed = new Set(Object.entries(theme).filter(([key]) => /color/i.test(key)).flatMap(([, value]) => Array.isArray(value) ? value : [value]));
  const options = [buildLineTrendOption({ ...trendInput, theme }), buildParetoOption({ ...paretoInput, theme, selectedReason: 'jam' }), buildOutputOption({ ...outputInput, theme })];
  function inspect(value: unknown, key = '') {
    if (typeof value === 'string' && (/color/i.test(key) || /^(#|rgba?\(|hsla?\()/.test(value))) expect(allowed.has(value)).toBe(true);
    if (key === 'fontFamily') expect(value).toBe('Library Font');
    if (key === 'fontSize') expect(value).toBe(17);
    if (Array.isArray(value)) value.forEach((item) => inspect(item, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => inspect(child, childKey));
  }
  options.forEach((option) => {
    inspect(option);
    for (const series of option.series as object[]) expect(series).toHaveProperty('emphasis.itemStyle.color');
  });
  expect(options[0]!.series).toMatchObject([{ symbol: 'circle' }]);
});

it('builds four 180-point series and 1000 Pareto bars with a generous 1000 ms median', () => {
  const trend = { ...trendInput, data: Array.from({ length: 4 }, (_, index) => ({ ...trendInput.data[0]!, id: `tag${index}`, points: Array.from({ length: 180 }, (_, tick) => ({ tick, value: tick + index, status: 'normal' })) })) };
  const pareto = { ...paretoInput, data: Array.from({ length: 1000 }, (_, i) => ({ reason: `reason${i}`, minutes: 1000 - i, sharePct: 0.1, cumulativePct: (i + 1) / 10 })) };
  buildLineTrendOption(trend);
  buildParetoOption(pareto);
  const elapsed = Array.from({ length: 9 }, () => {
    const start = performance.now();
    buildLineTrendOption(trend);
    buildParetoOption(pareto);
    return performance.now() - start;
  }).sort((a, b) => a - b)[4]!;
  const line = buildLineTrendOption(trend);
  const bars = buildParetoOption(pareto);
  expect(line.series).toHaveLength(4);
  expect((bars.series as { data: unknown[] }[])[0]!.data).toHaveLength(1000);
  expect(elapsed).toBeLessThan(1000);
});
