import {
  DECIMALS_BY_UNIT, PERFORMANCE_DEFAULT_RANGE, PERFORMANCE_DEFAULT_SCOPE, TEST_IDS, downtimeLabels, performanceReason,
  performanceScopes, performanceStateView, rangeLabels, scopeLabels,
  type OeeParts, type PerformanceShift, type RangeId, type Scope,
} from '@swatchbook/core';
import { useI18n, usePreferences, useShortcutHandlers, useSimulation } from '@swatchbook/runtime';
import type { ChartTheme, OutputFormatters, OutputLabels, ParetoFormatters, ParetoLabels } from '@swatchbook/charts';
import { Button, Card, Col, Empty, Row, Select, Space, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { RefSelectProps } from 'antd';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';

const ParetoChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.ParetoChart })));
const OutputChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.OutputChart })));
const ids = TEST_IDS.performance;
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
  const missingComparison = t(oee.previous ? 'performance.quality-empty' : 'performance.comparison-empty');
  const value = oee[part];
  const before = oee.previous?.[part];
  const change = oee.change?.[part];
  return <Col span={6} style={{ minWidth: 0 }}>
    <Card data-testid={id} role="group" aria-label={t(label)} style={{ height: '100%' }}>
      {value === null ? <Empty description={t('performance.quality-empty')} /> : <Statistic title={t(label)} value={formatPercent(value)} />}
      <Typography.Paragraph type="secondary">{t('performance.previous')}: {before == null ? missingComparison : formatPercent(before)}</Typography.Paragraph>
      <Typography.Text title={t('performance.change')}>{t('common.change')}: {change == null ? missingComparison : formatPercentagePoints(change)}</Typography.Text>
    </Card>
  </Col>;
}

export function Performance() {
  const { state, tick, dataset } = useSimulation();
  const { density } = usePreferences();
  const { t, tr, formatPercent, formatPercentValue, formatNumber, formatDate, formatDateTime, formatTime } = useI18n();
  const { token } = theme.useToken();
  const [scope, setScope] = useState<Scope>(PERFORMANCE_DEFAULT_SCOPE);
  const [range, setRange] = useState<RangeId>(PERFORMANCE_DEFAULT_RANGE);
  const [reason, setReason] = useState<string | null>(null);
  const scopeSelect = useRef<RefSelectProps>(null);
  useShortcutHandlers({ 'focus-search': () => scopeSelect.current?.focus() });
  const choices = useMemo(() => performanceScopes(dataset), [dataset]);
  const view = useMemo(() => performanceStateView(state, tick, scope, range), [state, tick, scope, range]);
  const selected = performanceReason(view, reason);
  const daily = range === 'last-7d' || range === 'last-30d';
  const chartTheme = useMemo<ChartTheme>(() => ({
    fontFamily: token.fontFamily, fontSize: token.fontSize,
    textColor: token.colorText, mutedTextColor: token.colorTextSecondary, gridColor: token.colorBorderSecondary,
    backgroundColor: token.colorBgContainer,
    seriesColors: [token.colorPrimary, token.colorSuccess, token.colorWarning, token.colorTextSecondary, token.colorInfo, token.colorTextTertiary],
    goodColor: token.colorSuccess, scrapColor: token.colorError, targetColor: token.colorText,
    limitColor: token.colorError, warningColor: token.colorWarning,
    tooltipBackgroundColor: token.colorBgElevated, tooltipTextColor: token.colorText, tooltipBorderColor: token.colorBorder,
  }), [token]);
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
            options={choices.map(option => ({ ...option, label: option.kind === 'site' ? tr(option.name) : `${t(scopeLabels[option.kind])} · ${option.id ? `${option.id} · ` : ''}${tr(option.name)}` }))}
            onChange={(_, option) => { if (option && !Array.isArray(option)) { setScope(option.scope); setReason(null); } }} />
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
        {view.pareto.length ? <>
          <Suspense fallback={<Typography.Text>{paretoLabels.caption}</Typography.Text>}>
            <ParetoChart data={view.pareto} labels={paretoLabels} formatters={paretoFormatters} theme={chartTheme}
              testId={ids.pareto} height={360} selectedReason={selected?.reason} onReasonSelect={setReason} />
          </Suspense>
          <Space orientation="vertical" style={fullWidth} aria-label={t('performance.pareto-reason')} role="group">
            <Typography.Text>{t('performance.pareto-reason')}</Typography.Text>
            {view.pareto.map(row => <Button key={row.reason} data-testid={ids.paretoReason}
              aria-pressed={selected?.reason === row.reason} type={selected?.reason === row.reason ? 'primary' : 'default'}
              style={{ height: 'auto', whiteSpace: 'normal' }} onClick={() => setReason(row.reason)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setReason(row.reason); } }}>
              {t(downtimeLabels[row.reason])} · {t('performance.minutes')}: {paretoFormatters.formatMinutes(row.minutes)} · {t('performance.share')}: {formatPercentValue(row.sharePct)}
            </Button>)}
          </Space>
          {selected && <Space orientation="vertical" size="small" style={{ ...fullWidth, marginTop: token.margin }}>
            <Typography.Text strong>{t('performance.selected-reason')}</Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {t(downtimeLabels[selected.reason])} · {t('performance.minutes')}: {paretoFormatters.formatMinutes(selected.minutes)} · {t('performance.share')}: {formatPercentValue(selected.sharePct)}
            </Typography.Paragraph>
          </Space>}
        </> : <Empty data-testid={ids.pareto} description={paretoLabels.empty} />}
      </Card>
      <Card title={t('performance.output')} style={fullWidth}>
        <Typography.Paragraph>{t('performance.bucket')} · {outputLabels.bucket}</Typography.Paragraph>
        {view.oee.quality === null && <Empty description={outputLabels.empty} />}
        <Suspense fallback={<Typography.Text>{outputLabels.caption}</Typography.Text>}>
          <OutputChart data={view.output} labels={outputLabels} formatters={outputFormatters} theme={chartTheme} testId={ids.output} height={360} />
        </Suspense>
      </Card>
      <Card title={t('performance.shift-history')} style={fullWidth}>
        <Typography.Paragraph>{t('performance.shift-history-caption')}</Typography.Paragraph>
        <Table<PerformanceShift> data-testid={ids.shiftHistory} rowKey="startsAt" size={density === 'compact' ? 'small' : 'middle'} pagination={false} loading={passiveLoading}
          dataSource={view.shifts} scroll={{ x: 'max-content' }}
          onHeaderRow={() => ({ style: cellStyle })} onRow={() => ({ style: cellStyle })}
          locale={{ emptyText: <Empty description={t('performance.shift-history-empty')} /> }}
          columns={[
            { ...wordCells, key: 'shift', fixed: 'left', title: t('event-target.shift'), dataIndex: 'shift' },
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
      </Card>
    </>}
  </Space>;
}
