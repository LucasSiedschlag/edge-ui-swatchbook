import type { ChartTheme } from './theme';
import type { ChartOption, LineTrendInput, OutputInput, ParetoInput } from './types';
import { paretoPercentages, pointTime } from './types';

function base(theme: ChartTheme): ChartOption {
  return {
    animation: false,
    backgroundColor: theme.backgroundColor,
    color: [...theme.seriesColors],
    textStyle: { color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
    grid: { left: 64, right: 64, top: 48, bottom: 48, outerBoundsMode: 'same', outerBoundsContain: 'all' },
    legend: { textStyle: { color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize }, inactiveColor: theme.mutedTextColor },
    tooltip: {
      trigger: 'axis', renderMode: 'richText',
      backgroundColor: theme.tooltipBackgroundColor, borderColor: theme.tooltipBorderColor,
      textStyle: { color: theme.tooltipTextColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
      axisPointer: { lineStyle: { color: theme.mutedTextColor }, crossStyle: { color: theme.mutedTextColor }, label: { color: theme.tooltipTextColor, backgroundColor: theme.tooltipBackgroundColor } },
    },
  };
}

export function buildParetoOption({ data, labels, formatters, theme, selectedReason }: ParetoInput): ChartOption {
  const percentages = paretoPercentages(data);
  return {
    ...base(theme),
    xAxis: { ...axis(theme), type: 'category', data: data.map((row) => formatters.formatReason(row.reason)) },
    yAxis: [
      { ...axis(theme), type: 'value', min: 0, name: labels.minutes, axisLabel: { ...axis(theme).axisLabel, formatter: formatters.formatMinutes } },
      { ...axis(theme), type: 'value', min: 0, max: 100, name: labels.cumulative, position: 'right', axisLabel: { ...axis(theme).axisLabel, formatter: formatters.formatPercent } },
    ],
    series: [
      { type: 'bar', name: labels.minutes, emphasis: { itemStyle: { color: theme.seriesColors[0] } }, tooltip: { valueFormatter: (value) => formatters.formatMinutes(Number(value)) }, data: data.map((row) => ({ value: row.minutes, itemStyle: { color: row.reason === selectedReason ? theme.warningColor : theme.seriesColors[0] }, emphasis: { itemStyle: { color: row.reason === selectedReason ? theme.warningColor : theme.seriesColors[0] } } })) },
      { type: 'line', name: labels.cumulative, symbol: 'circle', emphasis: { itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor } }, yAxisIndex: 1, itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor }, tooltip: { valueFormatter: (value) => formatters.formatPercent(Number(value)) }, data: percentages.map((row) => row.cumulative) },
    ],
  };
}

export function buildOutputOption({ data, labels, formatters, theme }: OutputInput): ChartOption {
  return {
    ...base(theme),
    xAxis: { ...axis(theme), type: 'category', name: labels.bucket, data: data.map((bucket) => formatters.formatBucket(bucket.start)) },
    yAxis: { ...axis(theme), type: 'value', min: 0, name: labels.value, axisLabel: { ...axis(theme).axisLabel, formatter: formatters.formatValue } },
    series: [
      { type: 'bar', name: labels.good, emphasis: { itemStyle: { color: theme.goodColor } }, stack: 'output', itemStyle: { color: theme.goodColor }, data: data.map((bucket) => bucket.goodUnits), tooltip: { valueFormatter: (value) => formatters.formatValue(Number(value)) } },
      { type: 'bar', name: labels.scrap, emphasis: { itemStyle: { color: theme.scrapColor } }, stack: 'output', itemStyle: { color: theme.scrapColor }, data: data.map((bucket) => bucket.scrapUnits), tooltip: { valueFormatter: (value) => formatters.formatValue(Number(value)) } },
      { type: 'line', name: labels.target, symbol: 'circle', emphasis: { itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor } }, itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor }, data: data.map((bucket) => bucket.targetUnits), tooltip: { valueFormatter: (value) => formatters.formatValue(Number(value)) } },
    ],
  };
}

function axis(theme: ChartTheme) {
  return {
    nameTextStyle: { color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
    axisLabel: { color: theme.mutedTextColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
    axisLine: { lineStyle: { color: theme.gridColor } },
    axisTick: { lineStyle: { color: theme.gridColor } },
    splitLine: { lineStyle: { color: theme.gridColor } },
  };
}

// Reference lines must remain visible even when every measured value is below them.
function trendBounds(data: LineTrendInput['data'], unit: string): { min?: number; max?: number } {
  const group = data.filter((series) => series.unit === unit);
  const references = group.flatMap((series) => [series.min, series.max, series.setpoint]).filter((value): value is number => value !== undefined);
  if (!references.length) return {};
  let min = 0;
  let max = 0;
  for (const value of references) { min = Math.min(min, value); max = Math.max(max, value); }
  for (const series of group) for (const point of series.points) {
    if (point.status !== 'stale') { min = Math.min(min, point.value); max = Math.max(max, point.value); }
  }
  return { min, max };
}

export function buildLineTrendOption({ data, labels, formatters, theme }: LineTrendInput): ChartOption {
  if (data.length > 4) throw new Error('A trend supports at most four series.');
  const units = [...new Set(data.map((series) => series.unit))];
  if (units.length > 2) throw new Error('A trend supports at most two unit groups.');
  return {
    ...base(theme),
    xAxis: { ...axis(theme), type: 'time', name: labels.time, axisLabel: { ...axis(theme).axisLabel, formatter: formatters.formatTime }, axisPointer: { label: { formatter: ({ value }) => formatters.formatTime(Number(value)) } } },
    yAxis: units.map((unit, index) => ({ ...axis(theme), ...trendBounds(data, unit), type: 'value', name: unit, position: index === 0 ? 'left' : 'right', axisLabel: { ...axis(theme).axisLabel, formatter: (value: number) => formatters.formatValue(value, unit) } })),
    series: data.map((series, index) => {
      const limits = [
        { name: labels.minimum, value: series.min, color: theme.limitColor },
        { name: labels.maximum, value: series.max, color: theme.limitColor },
        { name: labels.setpoint, value: series.setpoint, color: theme.targetColor },
      ].filter((limit) => limit.value !== undefined);
      const color = theme.seriesColors[index]!;
      return {
        id: series.id, name: series.name, type: 'line', yAxisIndex: units.indexOf(series.unit),
        showSymbol: false, symbol: 'circle', connectNulls: false,
        emphasis: { itemStyle: { color }, lineStyle: { color } },
        itemStyle: { color }, lineStyle: { color },
        tooltip: { valueFormatter: (value) => formatters.formatValue(Number(value), series.unit) },
        data: series.points.map((point) => [pointTime(point), point.status === 'stale' ? null : point.value]),
        ...(limits.length ? { markLine: {
          symbol: ['none', 'none'], silent: true,
          label: { color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize, formatter: (params: { name?: string; value?: unknown }) => `${params.name}: ${formatters.formatValue(Number(params.value), series.unit)}` },
          data: limits.map((limit) => ({ name: limit.name, yAxis: limit.value!, lineStyle: { color: limit.color, type: 'dashed' as const } })),
        } } : {}),
      };
    }),
  };
}
