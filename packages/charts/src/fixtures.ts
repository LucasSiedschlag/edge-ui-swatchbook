import { lightChartTheme } from './theme';
import type { LineTrendInput, OutputInput, ParetoInput } from './types';

export const trendInput: LineTrendInput = {
  data: [{ id: 'temp', name: 'Temperature', unit: '°C', min: 10, max: 30, setpoint: 20, points: [{ time: 1000, value: 18, status: 'normal' }, { time: 2000, value: 19, status: 'stale' }] }],
  labels: { caption: 'Trend', unsupported: 'Select at most four Tags with at most two units', empty: 'Select tags', time: 'Time', value: 'Value', series: 'Tag', status: 'Status', minimum: 'Minimum', maximum: 'Maximum', setpoint: 'Setpoint' },
  formatters: { formatTime: (time) => `time:${time}`, formatValue: (value, unit) => `${value} ${unit}`, formatStatus: (status) => `status:${status}` },
  theme: lightChartTheme,
};
export const paretoInput: ParetoInput = {
  data: [{ reason: 'change', minutes: 60, sharePct: 60, cumulativePct: 60 }, { reason: 'jam', minutes: 30, sharePct: 30, cumulativePct: 90 }, { reason: 'other', minutes: 10, sharePct: 10, cumulativePct: 100 }],
  labels: { caption: 'Downtime', empty: 'No downtime', reason: 'Reason', minutes: 'Minutes', share: 'Share', cumulative: 'Cumulative' },
  formatters: { formatReason: (reason) => `reason:${reason}`, formatMinutes: (value) => `${value} min`, formatPercent: (value) => `${value}%` },
  theme: lightChartTheme,
};
export const outputInput: OutputInput = {
  data: [{ start: 1000, goodUnits: 12, scrapUnits: 3, targetUnits: 20 }, { start: 2000, goodUnits: 8, scrapUnits: 2, targetUnits: 11 }],
  labels: { caption: 'Output', empty: 'No output', bucket: 'Hour', value: 'Units', good: 'Good', scrap: 'Scrap', target: 'Target' },
  formatters: { formatBucket: (start) => `bucket:${start}`, formatValue: (value) => `${value} units` },
  theme: lightChartTheme,
};
