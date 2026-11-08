import { expect, it } from 'vitest';
import { buildLineTrendOption } from './options';
import { darkChartTheme } from './theme';

const formatters = { formatTime: (time: number) => `time:${time}`, formatValue: (value: number, unit: string) => `${value} ${unit}`, formatStatus: (status: string) => `status:${status}` };
const labels = { caption: 'Trend', unsupported: 'Select at most four Tags', empty: 'Select tags', time: 'Time', value: 'Value', series: 'Tag', status: 'Status', minimum: 'Minimum', maximum: 'Maximum', setpoint: 'Setpoint' };
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


it('uses four offset axes and keeps every measured, limit and setpoint line on its unit axis', () => {
  const units = ['°C', 'bar', 'rpm', 'm/min'];
  const selected = units.map((unit, i) => ({ ...data[0]!, id: `tag-${i}`, unit, min: i + 1, max: i + 10,
    points: [{ tick: 0, value: i + 4, setpoint: i + 5, status: 'normal' }] }));
  const option = buildLineTrendOption({ data: selected, labels, formatters, theme: darkChartTheme });
  expect(option.yAxis).toMatchObject([
    { name: '°C', position: 'left', offset: 0 }, { name: 'bar', position: 'right', offset: 0 },
    { name: 'rpm', position: 'left', offset: 96 }, { name: 'm/min', position: 'right', offset: 96 },
  ]);
  expect(option.grid).toMatchObject({ left: 12, right: 12, outerBoundsMode: 'same', outerBoundsContain: 'all' });
  expect(option.legend).toMatchObject({ type: 'scroll', top: 0, left: 12, right: 12 });
  const plotted = option.series as { yAxisIndex: number; markLine?: { data: { yAxis: number }[] } }[];
  expect(plotted).toHaveLength(8);
  for (let i = 0; i < 4; i++) {
    expect(plotted[i * 2]!.yAxisIndex).toBe(i);
    expect(plotted[i * 2]!.markLine).toMatchObject({ label: { show: false } });
    expect(plotted[i * 2]!.markLine!.data.map(l => l.yAxis)).toEqual([i + 1, i + 10]);
    expect(plotted[i * 2 + 1]!.yAxisIndex).toBe(i);
  }
});

it('anchors four unit names to distinct axis sides and offsets with matching alignment', () => {
  const units = ['A', 'degC', 'V', 'kW'];
  const option = buildLineTrendOption({
    data: units.map((unit, index) => ({ ...data[0]!, id: `tag-${index}`, unit })),
    labels, formatters, theme: darkChartTheme,
  });
  const axes = option.yAxis as {
    name: string; position: string; offset: number; nameLocation: string; nameGap: number;
    nameTextStyle: { align: string }; axisLine: { onZero: boolean };
  }[];
  expect(axes.map(axis => axis.name)).toEqual(units);
  for (const axis of axes) {
    expect(axis.axisLine.onZero).toBe(false);
    expect(axis.nameLocation).toBe('end');
    expect(axis.nameGap).toBeGreaterThan(0);
    expect(axis.nameTextStyle.align).toBe(axis.position);
  }
  expect(new Set(axes.map(axis => `${axis.position}:${axis.offset}`)).size).toBe(4);
});

it('reserves a top legend band for caller fonts without taking space from the time labels', () => {
  for (const fontSize of [12, 14, 24]) {
    const option = buildLineTrendOption({ data, labels, formatters, theme: { ...darkChartTheme, fontSize } });
    const legend = option.legend as { top: number; height: number };
    const grid = option.grid as { top: number; bottom: number };
    expect(legend.height).toBeGreaterThanOrEqual(fontSize + 12);
    expect(grid.top).toBeGreaterThanOrEqual(legend.top + legend.height + 24);
    expect(grid.bottom).toBeGreaterThan(0);
  }
});

it('keeps single Tag limit labels inside the plot and hides them when another Tag is selected', () => {
  for (const selected of [data.slice(0, 1), data.slice(0, 2), data]) {
    const option = buildLineTrendOption({ data: selected, labels, formatters, theme: darkChartTheme });
    expect((option.series as object[])[0]).toMatchObject({ markLine: {
      label: { show: selected.length === 1, position: 'insideEndTop' },
      data: [{ name: labels.minimum, yAxis: 10 }, { name: labels.maximum, yAxis: 30 }, { name: labels.setpoint, yAxis: 20 }],
    } });
  }
});
