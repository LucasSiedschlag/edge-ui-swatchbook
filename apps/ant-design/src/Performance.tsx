import { useChartTheme } from './useChartTheme';
import {
  DECIMALS_BY_UNIT, PERFORMANCE_DEFAULT_RANGE, PERFORMANCE_DEFAULT_SCOPE, TEST_IDS, downtimeLabels, performanceReason,
  performanceScopes, performanceStateView, performanceTick, rangeLabels, scopeLabels, shiftLabels,
  type HourlyRecord, type OeeParts, type PerformanceShift, type RangeId, type Scope,
} from '@swatchbook/core';
import { useI18n, usePreferences, useShortcutHandlers, useSimulation } from '@swatchbook/runtime';
import type { OutputFormatters, OutputLabels, ParetoFormatters, ParetoLabels } from '@swatchbook/charts';
import { Button, Card, Col, Descriptions, Empty, Row, Select, Space, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { RefSelectProps } from 'antd';
import { lazy, memo, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';

const ParetoChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.ParetoChart })));
const OutputChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.OutputChart })));
const ids = TEST_IDS.performance;
const noLiveHours: readonly HourlyRecord[] = [];
const fullWidth = { width: '100%', minWidth: 0 };
const passiveLoading = { spinning: false, 'aria-live': 'off' } as const;
const cellStyle = { wordBreak: 'normal', overflowWrap: 'normal' } as const;
const wordCells = { onCell: () => ({ style: cellStyle }), onHeaderCell: () => ({ style: cellStyle }) };
const kpis = [
  { part: 'value', id: ids.oee, label: 'deck.kpi-oee' },
  { part: 'availability', id: ids.availability, label: 'performance.availability' },
  { part: 'performance', id: ids.performance, label: 'performance.performance' },
  { part: 'quality', id: ids.quality, label: 'performance.quality' },
] as const;

function Kpi({ part, id, label, oee }: typeof kpis[number] & { oee: OeeParts & { previous: OeeParts | null; change: OeeParts | null } }) {
  const { t, formatPercent, formatPercentagePoints } = useI18n();
  const missingComparison = t(oee.previous ? 'performance.previous-quality-empty' : 'performance.comparison-empty');
  const value = oee[part];
  const before = oee.previous?.[part];
  const change = oee.change?.[part];
  const missingChange = before == null ? missingComparison : t('performance.quality-empty');
  return <Col span={6} style={{ minWidth: 0 }}>
    <Card data-testid={id} style={{ height: '100%' }}>
      {value === null ? <><Typography.Text type="secondary">{t(label)}</Typography.Text><Empty description={t('performance.quality-empty')} /></> : <Statistic title={t(label)} value={formatPercent(value)} />}
      <Typography.Paragraph type="secondary"><span>{t('performance.previous')}</span>: <span>{before == null ? missingComparison : formatPercent(before)}</span></Typography.Paragraph>
      <Typography.Text><span>{t('performance.change')}</span>: <span>{change == null ? missingChange : formatPercentagePoints(change)}</span></Typography.Text>
    </Card>
  </Col>;
}

export function Performance() {
  const { state, tick, dataset, snapshot } = useSimulation();
  const { t, tr, formatPercentValue, formatNumber, formatDate, formatDateTime, formatTime } = useI18n();
  const { token } = theme.useToken();
  const [scope, setScope] = useState<Scope>(PERFORMANCE_DEFAULT_SCOPE);
  const [range, setRange] = useState<RangeId>(PERFORMANCE_DEFAULT_RANGE);
  const [reason, setReason] = useState<string | null>(null);
  const scopeSelect = useRef<RefSelectProps>(null);
  useShortcutHandlers({ 'focus-search': () => scopeSelect.current?.focus() });
  const reasonLabelId = useId();
  const effectiveTick = performanceTick(range, tick);
  const hours = range === 'last-24h' ? snapshot.hours : noLiveHours;
  const choices = useMemo(() => performanceScopes(dataset), [dataset]);
  const view = useMemo(() => performanceStateView(state, effectiveTick, scope, range, hours), [state, effectiveTick, scope, range, hours]);
  const selected = performanceReason(view, reason);
  useEffect(() => { if (reason !== null && selected === null) setReason(null); }, [reason, selected]);
  const daily = range === 'last-7d' || range === 'last-30d';
  const chartTheme = useChartTheme();
  const paretoLabels = useMemo<ParetoLabels>(() => ({
    caption: t('performance.pareto-caption'), empty: t('performance.pareto-empty'), reason: t('performance.reason'),
    minutes: t('performance.minutes'), share: t('performance.share'), cumulative: t('performance.series.cumulative-percentage'),
  }), [t]);
  const paretoFormatters = useMemo<ParetoFormatters>(() => ({
    formatReason: value => t(downtimeLabels[value as keyof typeof downtimeLabels]),
    formatMinutes: value => formatNumber(value, { decimals: DECIMALS_BY_UNIT.min }), formatPercent: formatPercentValue,
  }), [t, formatNumber, formatPercentValue]);
  const outputLabels = useMemo<OutputLabels>(() => ({
    caption: t('performance.output-caption'), empty: t('performance.output-empty'),
    bucket: t(daily ? 'performance.day' : 'performance.hour'), value: t('performance.output-units'),
    good: t('performance.series.good'), scrap: t('performance.series.scrap'), target: t('performance.series.target'),
  }), [t, daily]);
  const outputFormatters = useMemo<OutputFormatters>(() => ({
    formatBucket: formatDateTime, formatBucketTick: daily ? formatDate : formatTime, formatValue: formatNumber,
  }), [daily, formatDate, formatDateTime, formatTime, formatNumber]);

  return <Space orientation="vertical" size="middle" style={fullWidth}>
    <Card>
      <Space wrap align="start">
        <Space orientation="vertical" size="small">
          <Typography.Text>{t('performance.scope')}</Typography.Text>
          <Select ref={scopeSelect} data-testid={ids.scope} aria-label={t('performance.scope')} virtual={false} style={{ width: 300 }}
            value={scope.kind === 'site' ? scope.kind : scope.kind === 'area' ? scope.areaId : scope.lineId}
            options={choices.map(option => ({ value: option.value, label: option.kind === 'site' ? tr(option.name) : <><span>{t(scopeLabels[option.kind])}</span> · {option.id ? `${option.id} · ` : ''}{tr(option.name)}</> }))}
            onChange={value => { const option = choices.find(choice => choice.value === value); if (option) { setScope(option.scope); setReason(null); } }} />
        </Space>
        <Space orientation="vertical" size="small">
          <Typography.Text>{t('performance.range')}</Typography.Text>
          <Select data-testid={ids.range} aria-label={t('performance.range')} virtual={false} style={{ width: 220 }}
            value={range} options={Object.entries(rangeLabels).map(([value, key]) => ({ value, label: t(key) }))}
            onChange={value => { setRange(value); setReason(null); }} />
        </Space>
      </Space>
      <Typography.Paragraph type="secondary">{t('performance.range-help')}</Typography.Paragraph>
    </Card>
    {!view.hasProduction || !view.oee ? <Card data-testid={ids.empty}>
      <Empty description={t('performance.empty')} /><Typography.Paragraph>{t('performance.oee-empty')}</Typography.Paragraph>
    </Card> : <>
      <Row gutter={[token.margin, token.margin]}>{kpis.map(kpi => <Kpi key={kpi.part} {...kpi} oee={view.oee!} />)}</Row>
      <Card title={t('performance.pareto')} style={fullWidth}>
        {view.pareto.length ? <Space orientation="vertical" size="middle" style={fullWidth}>
          <Suspense fallback={<Typography.Text>{paretoLabels.caption}</Typography.Text>}>
            <ParetoChart data={view.pareto} labels={paretoLabels} formatters={paretoFormatters} theme={chartTheme}
              testId={ids.pareto} height={360} selectedReason={selected?.reason} onReasonSelect={setReason} />
          </Suspense>
          <Space orientation="vertical" style={fullWidth} aria-labelledby={reasonLabelId} role="group">
            <Typography.Text id={reasonLabelId}>{t('performance.pareto-reason')}</Typography.Text>
            {view.pareto.map(row => <Button key={row.reason} data-testid={ids.paretoReason}
              aria-pressed={selected?.reason === row.reason} type={selected?.reason === row.reason ? 'primary' : 'default'}
              style={{ height: 'auto', whiteSpace: 'normal' }} onClick={() => setReason(row.reason)}>
              {t(downtimeLabels[row.reason])} · {t('performance.minutes')}: {paretoFormatters.formatMinutes(row.minutes)} · {t('performance.share')}: {formatPercentValue(row.sharePct)}
            </Button>)}
          </Space>
          {selected && <Descriptions title={t('performance.selected-reason')} column={1} items={[
            { key: 'reason', label: t('performance.reason'), children: t(downtimeLabels[selected.reason]) },
            { key: 'minutes', label: t('performance.minutes'), children: paretoFormatters.formatMinutes(selected.minutes) },
            { key: 'share', label: t('performance.share'), children: formatPercentValue(selected.sharePct) },
          ]} />}
        </Space> : <Empty data-testid={ids.pareto} description={paretoLabels.empty} />}
      </Card>
      <Card title={t('performance.output')} style={fullWidth}>
        <Typography.Paragraph><span>{t('performance.bucket')}</span> · {outputLabels.bucket}</Typography.Paragraph>
        {!view.outputHasUnits ? <Empty data-testid={ids.output} description={outputLabels.empty} /> : <Suspense fallback={<Typography.Text>{outputLabels.caption}</Typography.Text>}>
          <OutputChart data={view.output} labels={outputLabels} formatters={outputFormatters} theme={chartTheme} testId={ids.output} height={360} />
        </Suspense>}
      </Card>
      <ShiftHistory shifts={view.shifts} />
    </>}
  </Space>;
}

const ShiftHistory = memo(function ShiftHistory({ shifts }: { shifts: PerformanceShift[] }) {
  const { t, formatDateTime, formatPercent, formatNumber } = useI18n();
  const { density } = usePreferences();
  return <Card title={t('performance.shift-history')} style={fullWidth}>
    <Typography.Paragraph>{t('performance.shift-history-caption')}</Typography.Paragraph>
    <Table<PerformanceShift> data-testid={ids.shiftHistory} rowKey="startsAt" size={density === 'compact' ? 'small' : 'middle'} pagination={false} loading={passiveLoading}
      dataSource={shifts} scroll={{ x: 'max-content' }}
      onHeaderRow={() => ({ style: cellStyle })} onRow={() => ({ style: cellStyle })}
      locale={{ emptyText: <Empty description={t('performance.shift-history-empty')} /> }}
      columns={[
        { ...wordCells, key: 'shift', fixed: 'left', title: t('event-target.shift'), render: (_, row) => t(shiftLabels[row.shift]) },
        { ...wordCells, key: 'start', title: t('common.start'), render: (_, row) => formatDateTime(row.startsAt) },
        { ...wordCells, key: 'oee', title: t('deck.kpi-oee'), render: (_, row) => <Space wrap>
          <span>{formatPercent(row.oee)}</span>
          {row.best && <Tag color="success">{t('performance.best')}</Tag>}
          {row.worst && <Tag color="warning">{t('performance.worst')}</Tag>}
        </Space> },
        { ...wordCells, key: 'output', title: t('performance.shift-output'), children: [
          { ...wordCells, key: 'good', title: t('performance.series.good'), render: (_, row) => formatNumber(row.goodUnits) },
          { ...wordCells, key: 'scrap', title: t('performance.series.scrap'), render: (_, row) => formatNumber(row.scrapUnits) },
          { ...wordCells, key: 'target', title: t('performance.series.target'), render: (_, row) => formatNumber(row.targetUnits) },
        ] },
      ]} />
  </Card>;
});
