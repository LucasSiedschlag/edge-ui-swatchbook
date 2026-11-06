import { expect, it } from 'vitest';
import { buildLineTrendOption } from './options';
import { darkChartTheme } from './theme';

const formatters = { formatTime: (time: number) => `time:${time}`, formatValue: (value: number, unit: string) => `${value} ${unit}`, formatStatus: (status: string) => `status:${status}` };
const labels = { caption: 'Trend', empty: 'Select tags', time: 'Time', value: 'Value', series: 'Tag', status: 'Status', minimum: 'Minimum', maximum: 'Maximum', setpoint: 'Setpoint' };
const data = [
  { id: 'temperature', name: 'Temperature', unit: '°C', min: 10, max: 30, setpoint: 20, points: [{ time: 1000, value: 18, status: 'normal' }, { time: 2000, value: 19, status: 'stale' }] },
  { id: 'pressure', name: 'Pressure', unit: 'bar', points: [{ tick: 1000, value: 7, status: 'high' }] },
  { id: 'temperature2', name: 'Temperature 2', unit: '°C', points: [{ time: 1000, value: 22, status: 'normal' }] },
];

it('builds a time trend with two unit axes, caller formatting and stale gaps', () => {
  const option = buildLineTrendOption({ data, labels, formatters, theme: darkChartTheme });
  expect(option.animation).toBe(false);
  expect(option.xAxis).toMatchObject({ type: 'time', axisLabel: { formatter: formatters.formatTime } });
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

it('rejects more than four series or two unit groups', () => {
  expect(() => buildLineTrendOption({ data: Array(5).fill(data[0]), labels, formatters, theme: darkChartTheme })).toThrow(/four/);
  expect(() => buildLineTrendOption({ data: [...data.slice(0, 2), { ...data[2]!, unit: 'kPa' }], labels, formatters, theme: darkChartTheme })).toThrow(/two/);
});
