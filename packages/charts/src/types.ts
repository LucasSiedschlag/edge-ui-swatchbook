import type { ComposeOption } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import type { GridComponentOption, LegendComponentOption, MarkLineComponentOption, TooltipComponentOption } from 'echarts/components';
import type { ChartTheme } from './theme';

export type ChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | GridComponentOption | LegendComponentOption | MarkLineComponentOption | TooltipComponentOption>;

export interface ChartLabels { caption: string; empty: string }
export interface ChartInput<Data, Labels, Formatters> {
  data: readonly Data[];
  labels: Labels;
  formatters: Formatters;
  theme: ChartTheme;
}

/** Numeric coordinates may be epoch milliseconds or caller-defined ticks. */
export type LineTrendPoint = ({ time: number; tick?: never } | { tick: number; time?: never }) & { value: number; status: string };
export interface LineTrendSeries {
  id: string;
  name: string;
  unit: string;
  points: readonly LineTrendPoint[];
  min?: number;
  max?: number;
  setpoint?: number;
}
export interface LineTrendLabels extends ChartLabels {
  series: string; time: string; value: string; status: string;
  minimum: string; maximum: string; setpoint: string;
}
export interface LineTrendFormatters {
  formatTime: (time: number) => string;
  formatValue: (value: number, unit: string) => string;
  formatStatus: (status: string) => string;
}
export type LineTrendInput = ChartInput<LineTrendSeries, LineTrendLabels, LineTrendFormatters>;

export function pointTime(point: LineTrendPoint): number { return point.time ?? point.tick; }

export interface ParetoRow { reason: string; minutes: number }
export interface ParetoLabels extends ChartLabels { reason: string; minutes: string; share: string; cumulative: string }
export interface ParetoFormatters {
  formatReason: (reason: string) => string;
  formatMinutes: (minutes: number) => string;
  /** Receives a percentage from 0 to 100, not a fraction. */
  formatPercent: (percent: number) => string;
}
export type ParetoInput = ChartInput<ParetoRow, ParetoLabels, ParetoFormatters> & { selectedReason?: string };

export interface OutputBucket { start: number; goodUnits: number; scrapUnits: number; targetUnits: number }
export interface OutputLabels extends ChartLabels { bucket: string; value: string; good: string; scrap: string; target: string }
export interface OutputFormatters { formatBucket: (start: number) => string; formatValue: (value: number) => string }
export type OutputInput = ChartInput<OutputBucket, OutputLabels, OutputFormatters>;

/** Keep the chart and accessible table on the same percentages, including zero totals. */
export function paretoPercentages(data: readonly ParetoRow[]): { share: number; cumulative: number }[] {
  const total = data.reduce((sum, row) => sum + row.minutes, 0);
  let sum = 0;
  return data.map((row, index) => {
    sum += row.minutes;
    return { share: total ? row.minutes / total * 100 : 0, cumulative: total ? (index === data.length - 1 ? 100 : sum / total * 100) : 0 };
  });
}
