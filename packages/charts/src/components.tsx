import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useChartTheme } from './context';
import { createChart } from './lifecycle';
import { buildLineTrendOption, buildOutputOption, buildParetoOption } from './options';
import type { ChartTheme } from './theme';
import { paretoPercentages, pointTime } from './types';
import type { ChartOption, LineTrendInput, OutputInput, ParetoInput } from './types';

interface PresentationProps { theme?: ChartTheme; testId: string; height: number }
export type LineTrendChartProps = Omit<LineTrendInput, 'theme'> & PresentationProps;
export type ParetoChartProps = Omit<ParetoInput, 'theme'> & PresentationProps;
export type OutputChartProps = Omit<OutputInput, 'theme'> & PresentationProps;

const hiddenTable: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};

function ChartFrame({ theme, testId, height, caption, emptyLabel, empty, option, children }: PresentationProps & {
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

  return <div data-testid={testId} style={{ position: 'relative', color: theme.textColor, backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily, fontSize: theme.fontSize }}>
    <div ref={empty ? undefined : element} role="img" aria-label={caption} style={{ height, width: '100%', minWidth: 0 }}>
      {empty ? <span data-empty="true">{emptyLabel}</span> : null}
    </div>
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
  const option = buildLineTrendOption({ ...props, theme });
  return <ChartFrame {...props} theme={theme} caption={labels.caption} emptyLabel={labels.empty} empty={!data.some((series) => series.points.length)} option={option}>
    <Headers labels={[labels.series, labels.time, labels.value, labels.status, labels.minimum, labels.maximum, labels.setpoint]} />
    <tbody>{data.flatMap((series, seriesIndex) => series.points.map((point, pointIndex) => <tr key={`${seriesIndex}:${pointIndex}`}>
      <th scope="row">{series.name}</th><td>{formatters.formatTime(pointTime(point))}</td>
      <td>{formatters.formatValue(point.value, series.unit)}</td><td>{formatters.formatStatus(point.status)}</td>
      <td>{series.min === undefined ? null : formatters.formatValue(series.min, series.unit)}</td>
      <td>{series.max === undefined ? null : formatters.formatValue(series.max, series.unit)}</td>
      <td>{series.setpoint === undefined ? null : formatters.formatValue(series.setpoint, series.unit)}</td>
    </tr>))}</tbody>
  </ChartFrame>;
}

export function ParetoChart(props: ParetoChartProps) {
  const contextTheme = useChartTheme();
  const theme = props.theme ?? contextTheme;
  const { data, labels, formatters } = props;
  const percentages = paretoPercentages(data);
  const option = buildParetoOption({ ...props, theme });
  return <ChartFrame {...props} theme={theme} caption={labels.caption} emptyLabel={labels.empty} empty={!data.length} option={option}>
    <Headers labels={[labels.reason, labels.minutes, labels.share, labels.cumulative]} />
    <tbody>{data.map((row, index) => <tr key={index}>
      <th scope="row">{formatters.formatReason(row.reason)}</th><td>{formatters.formatMinutes(row.minutes)}</td>
      <td>{formatters.formatPercent(percentages[index]!.share)}</td><td>{formatters.formatPercent(percentages[index]!.cumulative)}</td>
    </tr>)}</tbody>
  </ChartFrame>;
}

export function OutputChart(props: OutputChartProps) {
  const contextTheme = useChartTheme();
  const theme = props.theme ?? contextTheme;
  const { data, labels, formatters } = props;
  const option = buildOutputOption({ ...props, theme });
  return <ChartFrame {...props} theme={theme} caption={labels.caption} emptyLabel={labels.empty} empty={!data.length} option={option}>
    <Headers labels={[labels.bucket, labels.good, labels.scrap, labels.target]} />
    <tbody>{data.map((bucket, index) => <tr key={index}>
      <th scope="row">{formatters.formatBucket(bucket.start)}</th><td>{formatters.formatValue(bucket.goodUnits)}</td>
      <td>{formatters.formatValue(bucket.scrapUnits)}</td><td>{formatters.formatValue(bucket.targetUnits)}</td>
    </tr>)}</tbody>
  </ChartFrame>;
}
