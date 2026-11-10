import type { LineSeriesOption } from 'echarts/charts';
import type { ChartTheme } from './theme';
import type { ChartOption, LineTrendInput, OutputInput, ParetoInput } from './types';
import { pointTime, formatChartValue, unsupportedTrend } from './types';

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
  return {
    ...base(theme),
    legend: { ...base(theme).legend, type: 'scroll', top: 0, left: 12, right: 12 },
    grid: { left: 12, right: 12, top: Math.max(24, theme.fontSize + 12) + 32, bottom: 12, outerBoundsMode: 'same', outerBoundsContain: 'all' },
    xAxis: { ...axis(theme), axisLabel: { ...axis(theme).axisLabel, ...(data.length <= 8 ? { interval: 0, width: 92, overflow: 'break' as const, hideOverlap: false } : { rotate: 45, hideOverlap: true }) }, tooltip: { show: true }, type: 'category', data: data.map((row) => formatters.formatReason(row.reason)) },
    yAxis: [
      // ECharts passes a tick index as the second argument. Keep it out of core
      // formatters, where a second argument can mean numeric precision.
      { ...axis(theme), type: 'value', min: 0, minInterval: 1, name: labels.minutes, nameTextStyle: { ...axis(theme).nameTextStyle, align: 'left' }, axisLabel: { ...axis(theme).axisLabel, formatter: (value: number) => formatters.formatMinutes(value) } },
      { ...axis(theme), type: 'value', min: 0, max: 100, name: labels.cumulative, nameTextStyle: { ...axis(theme).nameTextStyle, align: 'right' }, position: 'right', axisLabel: { ...axis(theme).axisLabel, formatter: (value: number) => formatters.formatPercent(value, 0) } },
    ],
    series: [
      { type: 'bar', name: labels.minutes, emphasis: { itemStyle: { color: theme.seriesColors[0] } }, tooltip: { valueFormatter: (value) => formatChartValue(value, formatters.formatMinutes) }, data: data.map((row) => ({ value: row.minutes, itemStyle: { color: row.reason === selectedReason ? theme.warningColor : theme.seriesColors[0], borderColor: theme.textColor, borderWidth: row.reason === selectedReason ? 3 : 0, decal: row.reason === selectedReason ? { color: theme.textColor, symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5] } : undefined }, emphasis: { itemStyle: { color: row.reason === selectedReason ? theme.warningColor : theme.seriesColors[0] } } })) },
      { type: 'line', name: labels.cumulative, symbol: 'circle', emphasis: { itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor, type: 'dashed' } }, yAxisIndex: 1, itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor, type: 'dashed' }, tooltip: { valueFormatter: (value) => formatChartValue(value, formatters.formatPercent) }, data: data.map((row) => row.cumulativePct) },
    ],
  };
}

export function buildOutputOption({ data, labels, formatters, theme }: OutputInput): ChartOption {
  return {
    ...base(theme),
    legend: { ...base(theme).legend, type: 'scroll', top: 0, left: 12, right: 12 },
    grid: { left: 12, right: 12, top: Math.max(24, theme.fontSize + 12) + 32, bottom: 12, outerBoundsMode: 'same', outerBoundsContain: 'all' },
    xAxis: {
      ...axis(theme), type: 'category', name: labels.bucket,
      nameLocation: 'middle', nameGap: theme.fontSize + 24,
      nameTextStyle: { ...axis(theme).nameTextStyle, align: 'center' },
      // Keep full categories for tooltip headers. Only the visible ticks shorten.
      data: data.map((bucket) => formatters.formatBucket(bucket.start)),
      axisLabel: {
        ...axis(theme).axisLabel, interval: 'auto', hideOverlap: true, margin: 8,
        formatter: (value: string, index: number) => formatters.formatBucketTick ? formatters.formatBucketTick(data[index]!.start) : value,
      },
    },
    yAxis: { ...axis(theme), type: 'value', min: 0, minInterval: 1, name: labels.value, axisLabel: { ...axis(theme).axisLabel, formatter: (value: number) => formatters.formatValue(value) } },
    series: [
      { type: 'bar', name: labels.good, emphasis: { itemStyle: { color: theme.goodColor } }, stack: 'output', itemStyle: { color: theme.goodColor }, data: data.map((bucket) => bucket.goodUnits), tooltip: { valueFormatter: (value) => formatChartValue(value, formatters.formatValue) } },
      { type: 'bar', name: labels.scrap, emphasis: { itemStyle: { color: theme.scrapColor } }, stack: 'output', itemStyle: { color: theme.scrapColor, decal: { color: theme.textColor, symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4 } }, data: data.map((bucket) => bucket.scrapUnits), tooltip: { valueFormatter: (value) => formatChartValue(value, formatters.formatValue) } },
      { type: 'line', name: labels.target, symbol: 'circle', emphasis: { itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor, type: 'dashed' } }, itemStyle: { color: theme.targetColor }, lineStyle: { color: theme.targetColor, type: 'dashed' }, data: data.map((bucket) => bucket.targetUnits), tooltip: { valueFormatter: (value) => formatChartValue(value, formatters.formatValue) } },
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
  const values = data.filter(series => series.unit === unit).flatMap(series => [
    series.min, series.max,
    ...(series.points.length ? series.points.flatMap(point => [point.status === 'stale' ? undefined : point.value, point.setpoint ?? series.setpoint]) : [series.setpoint]),
  ]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return {};
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(min) || 1) * 0.05;
  return { min: min - padding, max: max + padding };
}

export function buildLineTrendOption({ data, labels, formatters, theme }: LineTrendInput): ChartOption {
  if (unsupportedTrend(data)) return { ...base(theme), series: [] };
  const units = [...new Set(data.map((series) => series.unit))];
  const seriesColors = theme.seriesColors.filter(color => color !== theme.limitColor);
  const legendHeight = Math.max(24, theme.fontSize + 12);
  const common = base(theme);

  return {
    ...common,
    legend: {
      ...common.legend, type: 'scroll', top: 0, left: 12, right: 12, height: legendHeight,
      pageTextStyle: { color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
      pageIconColor: theme.textColor, pageIconInactiveColor: theme.mutedTextColor,
    },
    // These are the outer bounds, including offset axes and their names. ECharts
    // measures that text and reserves the necessary space inside these bounds.
    grid: { left: 12, right: 12, top: legendHeight + 24, bottom: 12, outerBoundsMode: 'same', outerBoundsContain: 'all' },
    xAxis: { ...axis(theme), type: 'value', name: labels.time, axisLabel: { ...axis(theme).axisLabel, formatter: formatters.formatTime }, axisPointer: { label: { formatter: ({ value }) => formatters.formatTime(Number(value)) } } },
    yAxis: units.map((unit, index) => {
      const position = index % 2 === 0 ? 'left' : 'right';
      return {
        ...axis(theme), ...trendBounds(data, unit), scale: true, type: 'value', name: unit,
        position, offset: Math.floor(index / 2) * 96,
        nameLocation: 'end', nameGap: 15,
        nameTextStyle: { ...axis(theme).nameTextStyle, align: position },
        // Keep names on their own axis instead of the time axis zero crossing.
        axisLine: { ...axis(theme).axisLine, onZero: false },
        axisLabel: { ...axis(theme).axisLabel, formatter: (value: number) => formatters.formatValue(value, unit) },
      };
    }),
    series: data.flatMap((series, index): LineSeriesOption[] => {
      const pointSetpoints = series.points.some(point => point.setpoint !== undefined);
      const limits = [
        { name: labels.minimum, value: series.min, type: 'dotted' as const },
        { name: labels.maximum, value: series.max, type: 'dotted' as const },
        { name: labels.setpoint, value: pointSetpoints ? undefined : series.setpoint, type: 'dashed' as const },
      ].filter((limit) => limit.value !== undefined);
      const color = seriesColors[index % seriesColors.length]!;
      const measured: LineSeriesOption = {
        id: series.id, name: series.name, type: 'line', yAxisIndex: units.indexOf(series.unit),
        showSymbol: false, symbol: 'circle', connectNulls: false,
        emphasis: { itemStyle: { color }, lineStyle: { color } },
        itemStyle: { color }, lineStyle: { color },
        tooltip: { valueFormatter: (value) => formatChartValue(value, number => formatters.formatValue(number, series.unit)) },
        data: series.points.map((point) => [pointTime(point), point.status === 'stale' || point.value === null || !Number.isFinite(point.value) ? null : point.value]),
        ...(limits.length ? { markLine: {
          symbol: ['none', 'none'], silent: false,
          tooltip: { trigger: 'item', formatter: params => {
            const point = Array.isArray(params) ? params[0]! : params;
            return `${series.name} - ${point.name}: ${formatters.formatValue(Number(point.value), series.unit)}`;
          } },
          label: { show: data.length === 1, position: 'insideEndTop', color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize, formatter: (params: { name?: string; value?: unknown }) => `${params.name}: ${formatters.formatValue(Number(params.value), series.unit)}` },
          data: limits.map((limit) => ({ name: limit.name, yAxis: limit.value!, lineStyle: { color, type: limit.type } })),
        } } : {}),
      };
      if (!pointSetpoints) return [measured];
      return [measured, {
        id: `${series.id}:setpoint`, name: `${series.name}: ${labels.setpoint}`, type: 'line',
        yAxisIndex: units.indexOf(series.unit), step: 'end', showSymbol: false, connectNulls: false,
        itemStyle: { color }, lineStyle: { color, type: 'dashed' },
        emphasis: { itemStyle: { color }, lineStyle: { color } },
        tooltip: { valueFormatter: value => formatChartValue(value, number => formatters.formatValue(number, series.unit)) },
        data: series.points.map(point => [pointTime(point), point.setpoint ?? series.setpoint ?? null]),
      }];
    }),
  };
}
