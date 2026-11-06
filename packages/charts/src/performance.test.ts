import { expect, it } from 'vitest';
import { buildOutputOption, buildParetoOption } from './options';
import { lightChartTheme } from './theme';

const theme = lightChartTheme;
const pareto = {
  data: [{ reason: 'change', minutes: 60 }, { reason: 'jam', minutes: 30 }, { reason: 'other', minutes: 10 }],
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
  expect(buildParetoOption({ ...pareto, data: [{ reason: 'zero', minutes: 0 }] }).series).toMatchObject([{}, { data: [0] }]);
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
