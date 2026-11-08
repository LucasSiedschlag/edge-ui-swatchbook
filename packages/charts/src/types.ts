import { MAX_TREND_TAGS } from '@swatchbook/core';
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
export type LineTrendPoint = ({ time: number; tick?: never } | { tick: number; time?: never }) & { value: number | null; status: string; setpoint?: number };
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
  unsupported: string;
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

export interface ParetoRow { reason: string; minutes: number; sharePct: number; cumulativePct: number }
export interface ParetoLabels extends ChartLabels { reason: string; minutes: string; share: string; cumulative: string }
export interface ParetoFormatters {
  formatReason: (reason: string) => string;
  formatMinutes: (minutes: number) => string;
  /** Receives 0 to 100. Axis ticks request zero decimals; details use the default. */
  formatPercent: (percent: number, decimals?: number) => string;
}
export type ParetoInput = ChartInput<ParetoRow, ParetoLabels, ParetoFormatters> & { selectedReason?: string };

export interface OutputBucket { start: number; goodUnits: number; scrapUnits: number; targetUnits: number }
export interface OutputLabels extends ChartLabels { bucket: string; value: string; good: string; scrap: string; target: string }
export interface OutputFormatters {
  /** Full bucket label for tooltips and the accessible data table. */
  formatBucket: (start: number) => string;
  /** Optional concise label for axis ticks only. */
  formatBucketTick?: (start: number) => string;
  formatValue: (value: number) => string;
}
export type OutputInput = ChartInput<OutputBucket, OutputLabels, OutputFormatters>;

/** Never pass absent readings through Number(), which would turn null into zero. */
export function formatChartValue(value: unknown, format: (value: number) => string): string {
  return typeof value === 'number' && Number.isFinite(value) ? format(value) : '-';
}

export function unsupportedTrend(data: LineTrendInput['data']): boolean {
  return data.length > MAX_TREND_TAGS;
}
