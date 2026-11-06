import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useChartTheme } from './context';
import { createChart } from './lifecycle';
import { buildLineTrendOption, buildOutputOption, buildParetoOption } from './options';
import type { ChartTheme } from './theme';
import { pointTime, formatChartValue, unsupportedTrend } from './types';
import type { ChartOption, LineTrendInput, OutputInput, ParetoInput } from './types';

interface PresentationProps { theme?: ChartTheme; testId: string; height: number; emptyTestId?: string }
export type LineTrendChartProps = Omit<LineTrendInput, 'theme'> & PresentationProps;
export type ParetoChartProps = Omit<ParetoInput, 'theme'> & PresentationProps;
export type OutputChartProps = Omit<OutputInput, 'theme'> & PresentationProps;

const hiddenTable: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};

function ChartFrame({ theme, testId, height, emptyTestId, caption, emptyLabel, empty, option, children }: PresentationProps & {
  theme: ChartTheme; caption: string; emptyLabel: string; empty: boolean; option: ChartOption; children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof createChart> | null>(null);
  useEffect(() => {
    if (empty || !element.current) return;
    const chart = createChart(element.current);
    instance.current = chart;
    return () => { instance.current = null; chart.dispose(); };
  }, [empty]);
  useEffect(() => { instance.current?.update(option); }, [option, empty]);

  // ECharts clears its host on disposal, so React content must stay in siblings.
  return <div data-testid={testId} style={{ position: 'relative', color: theme.textColor, backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize }}>
    <div ref={element} role="img" aria-label={caption} hidden={empty} style={{ height, width: '100%', minWidth: 0 }} />
    {empty ? <span data-empty="true" data-testid={emptyTestId}>{emptyLabel}</span> : null}
    <table data-testid={`${testId}-data`} style={hiddenTable}>
      <caption>{caption}</caption>
      {children}
    </table>
  </div>;
}

function Headers({ labels }: { labels: readonly string[] }) {
  return <thead><tr>{labels.map((label, index) => <th key={index} scope="col">{label}</th>)}</tr></thead>;
}

export function LineTrendChart(props: LineTrendChartProps) {
  const contextTheme = useChartTheme();
  const theme = props.theme ?? contextTheme;
  const { data, labels, formatters } = props;
  const unsupported = unsupportedTrend(data);
  const option = useMemo(() => buildLineTrendOption({ data, labels, formatters, theme }), [data, labels, formatters, theme]);
  return <ChartFrame {...props} theme={theme} caption={labels.caption} emptyLabel={unsupported ? labels.unsupported : labels.empty} empty={unsupported || !data.some((series) => series.points.length)} option={option}>
    <Headers labels={[labels.series, labels.time, labels.value, labels.status, labels.minimum, labels.maximum, labels.setpoint]} />
    <tbody>{data.flatMap((series, seriesIndex) => series.points.map((point, pointIndex) => <tr key={`${seriesIndex}:${pointIndex}`}>
      <th scope="row">{series.name}</th><td>{formatters.formatTime(pointTime(point))}</td>
      <td>{formatChartValue(point.value, value => formatters.formatValue(value, series.unit))}</td><td>{formatters.formatStatus(point.status)}</td>
      <td>{series.min === undefined ? null : formatters.formatValue(series.min, series.unit)}</td>
      <td>{series.max === undefined ? null : formatters.formatValue(series.max, series.unit)}</td>
      <td>{(point.setpoint ?? series.setpoint) === undefined ? null : formatChartValue(point.setpoint ?? series.setpoint, value => formatters.formatValue(value, series.unit))}</td>
    </tr>))}</tbody>
  </ChartFrame>;
}

export function ParetoChart(props: ParetoChartProps) {
  const contextTheme = useChartTheme();
  const theme = props.theme ?? contextTheme;
  const { data, labels, formatters } = props;
  const option = useMemo(() => buildParetoOption({ data, labels, formatters, theme, selectedReason: props.selectedReason }), [data, labels, formatters, theme, props.selectedReason]);
  return <ChartFrame {...props} theme={theme} caption={labels.caption} emptyLabel={labels.empty} empty={!data.length} option={option}>
    <Headers labels={[labels.reason, labels.minutes, labels.share, labels.cumulative]} />
    <tbody>{data.map((row, index) => <tr key={index}>
      <th scope="row">{formatters.formatReason(row.reason)}</th><td>{formatChartValue(row.minutes, formatters.formatMinutes)}</td>
      <td>{formatChartValue(row.sharePct, formatters.formatPercent)}</td><td>{formatChartValue(row.cumulativePct, formatters.formatPercent)}</td>
    </tr>)}</tbody>
  </ChartFrame>;
}

export function OutputChart(props: OutputChartProps) {
  const contextTheme = useChartTheme();
  const theme = props.theme ?? contextTheme;
  const { data, labels, formatters } = props;
  const option = useMemo(() => buildOutputOption({ data, labels, formatters, theme }), [data, labels, formatters, theme]);
  return <ChartFrame {...props} theme={theme} caption={labels.caption} emptyLabel={labels.empty} empty={!data.length} option={option}>
    <Headers labels={[labels.bucket, labels.good, labels.scrap, labels.target]} />
    <tbody>{data.map((bucket, index) => <tr key={index}>
      <th scope="row">{formatters.formatBucket(bucket.start)}</th><td>{formatChartValue(bucket.goodUnits, formatters.formatValue)}</td>
      <td>{formatChartValue(bucket.scrapUnits, formatters.formatValue)}</td><td>{formatChartValue(bucket.targetUnits, formatters.formatValue)}</td>
    </tr>)}</tbody>
  </ChartFrame>;
}
