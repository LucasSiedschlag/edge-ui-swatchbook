import { expect, it } from 'vitest';
import { buildLineTrendOption } from './options';
import { darkChartTheme } from './theme';

const formatters = { formatTime: (time: number) => `time:${time}`, formatValue: (value: number, unit: string) => `${value} ${unit}`, formatStatus: (status: string) => `status:${status}` };
const labels = { caption: 'Trend', unsupported: 'Select at most four Tags with at most two units', empty: 'Select tags', time: 'Time', value: 'Value', series: 'Tag', status: 'Status', minimum: 'Minimum', maximum: 'Maximum', setpoint: 'Setpoint' };
const data = [
  { id: 'temperature', name: 'Temperature', unit: '°C', min: 10, max: 30, setpoint: 20, points: [{ time: 1000, value: 18, status: 'normal' }, { time: 2000, value: 19, status: 'stale' }] },
  { id: 'pressure', name: 'Pressure', unit: 'bar', points: [{ tick: 1000, value: 7, status: 'high' }] },
  { id: 'temperature2', name: 'Temperature 2', unit: '°C', points: [{ time: 1000, value: 22, status: 'normal' }] },
];

it('builds a time trend with two unit axes, caller formatting and stale gaps', () => {
  const option = buildLineTrendOption({ data, labels, formatters, theme: darkChartTheme });
  expect(option.animation).toBe(false);
  expect(option.xAxis).toMatchObject({ type: 'value', axisLabel: { formatter: formatters.formatTime } });
  expect(option.yAxis).toMatchObject([{ type: 'value', name: '°C' }, { type: 'value', name: 'bar' }]);
  expect(option.series).toMatchObject([
    { name: 'Temperature', type: 'line', yAxisIndex: 0, connectNulls: false, data: [[1000, 18], [2000, null]] },
    { name: 'Pressure', type: 'line', yAxisIndex: 1, data: [[1000, 7]] },
    { name: 'Temperature 2', type: 'line', yAxisIndex: 0 },
  ]);
});

it('adds only supplied limits and setpoint with translated names', () => {
  const option = buildLineTrendOption({ data, labels, formatters, theme: darkChartTheme });
  expect(option.series).toMatchObject([{ markLine: { data: [{ name: 'Minimum', yAxis: 10 }, { name: 'Maximum', yAxis: 30 }, { name: 'Setpoint', yAxis: 20 }] } }, {}, {}]);
  const series = option.series as object[];
  expect(series[1]).not.toHaveProperty('markLine');
  expect(series[2]).not.toHaveProperty('markLine');
});

it('returns no plotted series for unsupported selections', () => {
  expect(buildLineTrendOption({ data: Array(5).fill(data[0]), labels, formatters, theme: darkChartTheme }).series).toEqual([]);
  expect(buildLineTrendOption({ data: [...data.slice(0, 2), { ...data[2]!, unit: 'kPa' }], labels, formatters, theme: darkChartTheme }).series).toEqual([]);
});


it('pads measured and reference bounds without forcing zero', () => {
  for (const [min, max, low, high] of [[190, 210, 189, 211], [150, 250, 145, 255]]) {
    const option = buildLineTrendOption({ data: [{ ...data[0]!, min, max, setpoint: 200, points: [{ tick: 1, value: 200, status: 'normal' }] }], labels, formatters, theme: darkChartTheme });
    expect(option.yAxis).toMatchObject([{ scale: true, min: low, max: high }]);
  }
});

it('plots changing per point setpoints as a step line and includes them in bounds', () => {
  const option = buildLineTrendOption({ data: [{ ...data[0]!, points: [{ tick: 0, value: 18, status: 'normal', setpoint: 20 }, { tick: 1, value: 19, status: 'normal', setpoint: 40 }] }], labels, formatters, theme: darkChartTheme });
  expect(option.series).toMatchObject([{}, { name: 'Temperature: Setpoint', step: 'end', data: [[0, 20], [1, 40]] }]);
  expect(option.yAxis).toMatchObject([{ max: 41.5 }]);
});

it('formats null and nonfinite tooltip values as missing', () => {
  const option = buildLineTrendOption({ data, labels, formatters, theme: darkChartTheme });
  const series = option.series as { tooltip: { valueFormatter: (value: unknown) => string } }[];
  for (const value of [null, undefined, NaN, Infinity, -Infinity]) expect(series[0]!.tooltip.valueFormatter(value)).toBe('-');
  expect(series[0]!.tooltip.valueFormatter(0)).toBe('0 °C');
});

it('bounds point setpoints without including an unused series fallback', () => {
  const option = buildLineTrendOption({ data: [{ id: 'temp', name: 'Temperature', unit: '°C', setpoint: 0,
    points: [{ tick: 0, value: 200, status: 'normal', setpoint: 190 }, { tick: 1, value: 200, status: 'normal', setpoint: 210 }],
  }], labels, formatters, theme: darkChartTheme });
  expect(option.yAxis).toMatchObject([{ min: 189, max: 211 }]);
});
