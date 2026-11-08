import { DECIMALS_BY_UNIT, formatDate, formatDateTime, formatNumber, formatPercentValue, formatTime, generateMockDataset, performanceView } from '@swatchbook/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { OutputChart, ParetoChart } from './components';
import { expect, it } from 'vitest';
import { buildOutputOption, buildParetoOption } from './options';
import { lightChartTheme } from './theme';
import { outputInput } from './fixtures';
import type { OutputInput } from './types';

const theme = lightChartTheme;
const pareto = {
  data: [{ reason: 'change', minutes: 60, sharePct: 60, cumulativePct: 60 }, { reason: 'jam', minutes: 30, sharePct: 30, cumulativePct: 90 }, { reason: 'other', minutes: 10, sharePct: 10, cumulativePct: 100 }],
  labels: { caption: 'Downtime', empty: 'No downtime', reason: 'Reason', minutes: 'Minutes', share: 'Share', cumulative: 'Cumulative' },
  formatters: { formatReason: (reason: string) => `reason:${reason}`, formatMinutes: (value: number) => `${value} min`, formatPercent: (value: number) => `${value}%` },
  theme,
};

it('preserves Pareto order and shows cumulative percentages on a fixed secondary axis', () => {
  const option = buildParetoOption({ ...pareto, selectedReason: 'jam' });
  expect(option.animation).toBe(false);
  expect(option.xAxis).toMatchObject({ type: 'category', data: ['reason:change', 'reason:jam', 'reason:other'] });
  expect(option.yAxis).toMatchObject([{ type: 'value' }, { type: 'value', min: 0, max: 100 }]);
  expect(option.series).toMatchObject([
    { type: 'bar', name: 'Minutes', data: [{ value: 60, itemStyle: { color: theme.seriesColors[0] } }, { value: 30, itemStyle: { color: theme.warningColor } }, { value: 10 }] },
    { type: 'line', name: 'Cumulative', yAxisIndex: 1, data: [60, 90, 100] },
  ]);
});

it('avoids invalid percentages when all downtime is zero', () => {
  expect(buildParetoOption({ ...pareto, data: [{ reason: 'zero', minutes: 0, sharePct: 0, cumulativePct: 0 }] }).series).toMatchObject([{}, { data: [0] }]);
});

it('stacks good and scrap counts with the target as a separate line', () => {
  const option = buildOutputOption({
    data: [{ start: 1000, goodUnits: 12, scrapUnits: 3, targetUnits: 20 }, { start: 2000, goodUnits: 8, scrapUnits: 2, targetUnits: 11 }],
    labels: { caption: 'Output', empty: 'No output', bucket: 'Hour', value: 'Units', good: 'Good', scrap: 'Scrap', target: 'Target' },
    formatters: { formatBucket: (start: number) => `bucket:${start}`, formatValue: (value: number) => `${value} units` }, theme,
  });
  expect(option.animation).toBe(false);
  expect(option.xAxis).toMatchObject({ type: 'category', data: ['bucket:1000', 'bucket:2000'] });
  expect(option.yAxis).toMatchObject({ type: 'value', min: 0 });
  expect(option.series).toMatchObject([
    { type: 'bar', name: 'Good', stack: 'output', data: [12, 8], itemStyle: { color: theme.goodColor } },
    { type: 'bar', name: 'Scrap', stack: 'output', data: [3, 2], itemStyle: { color: theme.scrapColor } },
    { type: 'line', name: 'Target', data: [20, 11], lineStyle: { color: theme.targetColor } },
  ]);
  const series = option.series as { data: number[] }[];
  expect(series[0]!.data.map((good, i) => good + series[1]!.data[i]!)).toEqual([15, 10]);
});


it('uses the exact rounded core Pareto percentages in the chart and table', () => {
  const dataset = generateMockDataset();
  const data = performanceView(dataset, [], 0, { kind: 'site' }, 'last-7d').pareto;
  expect(data.length).toBeGreaterThan(0);
  const option = buildParetoOption({ ...pareto, data });
  expect(option.series).toMatchObject([{}, { data: data.map(row => row.cumulativePct) }]);
  const markup = renderToStaticMarkup(createElement(ParetoChart, { ...pareto, data, testId: 'pareto', height: 200 }));
  for (const row of data) {
    expect(markup).toContain(`<td>${row.sharePct}%</td>`);
    expect(markup).toContain(`<td>${row.cumulativePct}%</td>`);
  }
});

it('reserves a separate legend band and keeps dual-axis names at opposite edges', () => {
  const option = buildParetoOption({ ...pareto, selectedReason: 'jam' });
  expect(option.legend).toMatchObject({ type: 'scroll', top: 0, left: 12, right: 12 });
  expect(option.grid).toMatchObject({ left: 12, right: 12, top: 56, outerBoundsContain: 'all' });
  expect(option.yAxis).toMatchObject([
    { nameTextStyle: { align: 'left' } }, { position: 'right', nameTextStyle: { align: 'right' } },
  ]);
  expect(option.series).toMatchObject([
    { data: [{ itemStyle: { decal: { symbol: 'rect' }, borderWidth: 0 } }, { itemStyle: { borderWidth: 3 } }, {}] },
    { lineStyle: { type: 'dashed' } },
  ]);
});

it.each(['en', 'pt-BR'] as const)('keeps axis precision fixed when ECharts supplies tick indices in %s', locale => {
  const option = buildParetoOption({ ...pareto, formatters: {
    formatReason: pareto.formatters.formatReason,
    formatMinutes: value => formatNumber(locale, value, { decimals: DECIMALS_BY_UNIT.min }),
    // Pass the core formatter directly to reproduce the original index/precision bug.
    formatPercent: formatPercentValue.bind(null, locale),
  } });
  const axes = option.yAxis as { axisLabel: { formatter: (value: number, index: number) => string } }[];
  expect([0, 20, 40, 60, 80, 100].map((value, index) => axes[1]!.axisLabel.formatter(value, index)))
    .toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
  expect([0, 200, 400, 600, 800].map((value, index) => axes[0]!.axisLabel.formatter(value, index)))
    .toEqual(['0', '200', '400', '600', '800']);
  const series = option.series as { tooltip: { valueFormatter: (value: number) => string } }[];
  expect(series[0]!.tooltip.valueFormatter(712)).toBe('712');
  expect(series[1]!.tooltip.valueFormatter(66.7)).toBe(locale === 'en' ? '66.7%' : '66,7%');
});

it.each([
  ['en', 'hourly', 8, '22:00', '12/31/2025 22:00'],
  ['en', 'hourly', 24, '22:00', '12/31/2025 22:00'],
  ['en', 'daily', 7, '12/31/2025', '12/31/2025 22:00'],
  ['en', 'daily', 30, '12/31/2025', '12/31/2025 22:00'],
  ['pt-BR', 'hourly', 8, '22:00', '31/12/2025 22:00'],
  ['pt-BR', 'hourly', 24, '22:00', '31/12/2025 22:00'],
  ['pt-BR', 'daily', 7, '31/12/2025', '31/12/2025 22:00'],
  ['pt-BR', 'daily', 30, '31/12/2025', '31/12/2025 22:00'],
] as const)('uses concise %s %s ticks for %s buckets and retains full tooltip/table labels', (locale, kind, count, tick, full) => {
  const input: OutputInput = {
    ...outputInput,
    labels: { ...outputInput.labels, bucket: kind === 'hourly' ? 'Hour' : 'Day' },
    data: Array.from({ length: count }, (_, index) => ({ ...outputInput.data[0]!, start: Date.UTC(2026, 0, 1, 1) + index * (kind === 'hourly' ? 1 : 24) * 3_600_000 })),
    formatters: {
      formatBucket: formatDateTime.bind(null, locale),
      formatBucketTick: (kind === 'hourly' ? formatTime : formatDate).bind(null, locale),
      formatValue: formatNumber.bind(null, locale),
    },
  };
  const option = buildOutputOption(input);
  expect(option.xAxis).toMatchObject({
    type: 'category', name: kind === 'hourly' ? 'Hour' : 'Day', nameLocation: 'middle', nameGap: 36,
    nameTextStyle: { align: 'center' }, axisLabel: { interval: 'auto', hideOverlap: true, margin: 8 },
  });
  const axis = option.xAxis as { data: string[]; axisLabel: { formatter: (value: string, index: number) => string } };
  expect(axis.data).toHaveLength(count);
  expect(axis.data[0]).toBe(full);
  expect(axis.axisLabel.formatter(axis.data[0]!, 0)).toBe(tick);
  // Category values remain complete for ECharts' default tooltip headers.
  const markup = renderToStaticMarkup(createElement(OutputChart, { ...input, testId: 'output', height: 360 }));
  expect(markup).toContain(`<th scope="row">${full}</th>`);
});
