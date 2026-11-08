import {
  DEFAULT_TREND_WINDOW, TAG_GRID_DEFAULT_FILTERS, TEST_IDS, connectivityView, formatTagValue,
  linkStatusLabels, plantErrorLabels, simulatedTime, tagDetailView, tagGridView, tagStatusLabels,
  trendErrorLabels, trendView, trendWindowLabels,
  type ConnectivityRow, type MessageKey, type TagFilters, type TagRow, type TagStatus, type TrendWindowId,
} from '@swatchbook/core';
import { actionErrorLabel, useActions, useI18n, useShortcutHandlers, useSimulation } from '@swatchbook/runtime';
import type { ChartTheme, LineTrendFormatters, LineTrendLabels } from '@swatchbook/charts';
import { Alert, Button, Card, ConfigProvider, Empty, Input, InputNumber, Modal, Select, Space, Table, Tooltip, Typography, theme } from 'antd';
import type { InputRef, TableColumnsType } from 'antd';
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';

const ids = TEST_IDS.parameters;
const LineTrendChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.LineTrendChart })));
// Native Table wraps its children in Spin, whose default live region would announce every tick.
const passiveLoading = { spinning: false, 'aria-live': 'off' } as const;
const fullWidth = { width: '100%', minWidth: 0 };

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <Space orientation="vertical" size="small"><Typography.Text>{label}</Typography.Text>{children}</Space>;
}

function Refusal({ message, testId }: { message: MessageKey | null; testId?: string }) {
  const { t } = useI18n();
  return message ? <Alert data-testid={testId} role="status" type="warning" showIcon title={t(message)} /> : null;
}

function Trend({ selection, window }: { selection: string[]; window: TrendWindowId }) {
  const { dataset, tick, state } = useSimulation();
  const i18n = useI18n();
  const { t, locale, formatTime } = i18n;
  const { token } = theme.useToken();
  const chartTheme = useMemo<ChartTheme>(() => ({
    fontFamily: token.fontFamily, fontSize: token.fontSize,
    textColor: token.colorText, mutedTextColor: token.colorTextSecondary, gridColor: token.colorBorderSecondary,
    backgroundColor: token.colorBgContainer,
    seriesColors: [token.colorPrimary, token.colorSuccess, token.colorWarning, token.colorError, token.colorInfo, token.colorTextSecondary],
    goodColor: token.colorSuccess, scrapColor: token.colorError, targetColor: token.colorText,
    limitColor: token.colorError, warningColor: token.colorWarning,
    tooltipBackgroundColor: token.colorBgElevated, tooltipTextColor: token.colorText, tooltipBorderColor: token.colorBorder,
  }), [token]);
  const view = useMemo(() => trendView(dataset, selection, window, tick, state.overlay), [dataset, selection, window, tick, state.overlay]);
  const data = useMemo(() => 'series' in view ? view.series.map(series => ({ ...series, id: series.tagId, name: `${series.machineId} · ${series.name}` })) : [], [view]);
  const labels = useMemo<LineTrendLabels>(() => ({
    caption: t('parameters.trend-caption'), empty: t('trend-error.nothing-selected'), unsupported: t('trend-error.trend-limit'),
    series: t('parameters.series'), time: t('common.time'), value: t('common.value'), status: t('common.status'),
    minimum: t('common.minimum'), maximum: t('common.maximum'), setpoint: t('term.setpoint'),
  }), [t]);
  const formatters = useMemo<LineTrendFormatters>(() => ({
    formatTime: tick => formatTime(simulatedTime(tick)),
    formatValue: (value, unit) => `${formatTagValue(locale, value, unit)} ${unit}`,
    formatStatus: status => t(tagStatusLabels[status as TagStatus]),
  }), [locale, t, formatTime]);
  return <>
    <Typography.Text type="secondary">{t('parameters.series.limit')}: {t('common.minimum')} / {t('common.maximum')}</Typography.Text>
    {'error' in view ? <Refusal message={trendErrorLabels[view.error]} /> :
      <Suspense fallback={null}>
        <LineTrendChart data={data} labels={labels} formatters={formatters} theme={chartTheme}
          testId={ids.trend} emptyTestId={ids.trendEmpty} height={320} />
      </Suspense>}
  </>;
}

export function Parameters() {
  const { dataset, snapshot, state } = useSimulation();
  const dispatch = useActions();
  const { t, tr, locale, formatDateTime, tCount } = useI18n();
  const [filters, setFilters] = useState<TagFilters>(TAG_GRID_DEFAULT_FILTERS);
  const [selection, setSelection] = useState<string[]>([]);
  const [window, setWindow] = useState<TrendWindowId>(DEFAULT_TREND_WINDOW);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [overrideError, setOverrideError] = useState<MessageKey | null>(null);
  const search = useRef<InputRef>(null);
  useShortcutHandlers({ 'focus-search': () => search.current?.focus() });
  const grid = tagGridView(dataset, snapshot, filters);
  const links = connectivityView(dataset, snapshot);
  const tag = openTag === null ? null : tagDetailView(dataset, snapshot, openTag);
  const number = (value: number | null, unit: string) => formatTagValue(locale, value, unit);
  const columns: TableColumnsType<TagRow> = [
    { key: 'line', title: t('scope.line'), dataIndex: 'lineId', width: 42 },
    { key: 'machine', title: t('term.machine'), dataIndex: 'machineId', width: 68 },
    { key: 'name', title: t('parameters.tag-name'), dataIndex: 'name', width: 90 },
    { key: 'value', title: t('parameters.current-value'), width: 88, render: (_, row) => number(row.value, row.unit) },
    { key: 'unit', title: t('common.unit'), dataIndex: 'unit', width: 60 },
    { key: 'setpoint', title: t('term.setpoint'), width: 62, render: (_, row) => number(row.setpoint, row.unit) },
    { key: 'min', title: t('common.minimum'), width: 62, render: (_, row) => number(row.min, row.unit) },
    { key: 'max', title: t('common.maximum'), width: 66, render: (_, row) => number(row.max, row.unit) },
    { key: 'status', title: t('common.status'), width: 56, render: (_, row) => t(tagStatusLabels[row.status]) },
    { key: 'actions', title: t('parameters.override'), width: 210, render: (_, row) => <Space orientation="vertical" size={2}>
      <Tooltip title={row.overrideUnavailable && t(plantErrorLabels[row.overrideUnavailable])}>
        <span style={{ display: 'flex' }} tabIndex={row.canOverride ? undefined : 0} aria-label={row.overrideUnavailable ? t(plantErrorLabels[row.overrideUnavailable]) : undefined}>
          <Button data-testid={ids.override} size="small" disabled={!row.canOverride} style={{ whiteSpace: 'nowrap' }}
            onClick={() => open(row)}>{t('parameters.override')}</Button>
        </span>
      </Tooltip>
      <Tooltip title={row.resetUnavailable ? t(plantErrorLabels[row.resetUnavailable]) : `${t('parameters.recipe-value')}: ${number(row.recipeValue, row.unit)} ${row.unit}`}>
        <span style={{ display: 'flex' }} tabIndex={row.canResetToRecipe ? undefined : 0} aria-label={row.resetUnavailable ? t(plantErrorLabels[row.resetUnavailable]) : `${t('parameters.recipe-value')}: ${number(row.recipeValue, row.unit)} ${row.unit}`}>
          <Button data-testid={ids.resetRecipe} size="small" disabled={!row.canResetToRecipe} style={{ whiteSpace: 'nowrap' }}
            onClick={() => reset(row)}>{t('action.reset-to-recipe')}</Button>
        </span>
      </Tooltip>
    </Space> },
  ];
  function filter(next: TagFilters) {
    setFilters(next);
    setNotice(null);
    close();
  }
  function close() { setOpenTag(null); setOverrideError(null); }
  function open(row: TagRow) {
    setOpenTag(row.tagId); setValue(row.setpoint); setReason(''); setOverrideError(null); setNotice(null);
  }
  function apply() {
    if (!tag) return;
    const result = dispatch({ type: 'setpoint-override', tagId: tag.tagId, value: value ?? Number.NaN, reason });
    setOverrideError(actionErrorLabel(result));
    if (result.ok) close();
  }
  function reset(row: TagRow) {
    setNotice(actionErrorLabel(dispatch({ type: 'reset-to-recipe', tagId: row.tagId })));
  }
  const wholeEmpty = tagGridView(dataset, snapshot).empty && !links.length;
  return wholeEmpty ? <Empty data-testid={ids.empty} description={t('parameters.empty')} /> : (
    <Space orientation="vertical" size="middle" style={fullWidth}>
      <Card title={t('parameters.grid')} style={fullWidth}>
        <Space orientation="vertical" size="middle" style={fullWidth}>
          <Typography.Text strong>{t('common.filter')}</Typography.Text>
          <Space wrap align="start">
            <Filter label={t('scope.line')}>
              <Select data-testid={ids.filterLine} aria-label={t('scope.line')} style={{ width: 180 }} virtual={false}
                allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} value={filters.lineId}
                options={dataset.lines.map(line => ({ value: line.id, label: `${line.id} · ${tr(line.name)}` }))}
                onChange={lineId => filter({ ...filters, lineId })} />
            </Filter>
            <Filter label={t('term.machine')}>
              <Select data-testid={ids.filterMachine} aria-label={t('term.machine')} style={{ width: 200 }} virtual={false}
                allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} value={filters.machineId}
                options={dataset.machines.map(machine => ({ value: machine.id, label: `${machine.id} · ${tr(machine.name)}` }))}
                onChange={machineId => filter({ ...filters, machineId })} />
            </Filter>
            <Filter label={t('common.status')}>
              <Select data-testid={ids.filterStatus} aria-label={t('common.status')} style={{ width: 140 }} virtual={false}
                allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} value={filters.status}
                options={Object.entries(tagStatusLabels).map(([value, label]) => ({ value, label: t(label) }))}
                onChange={status => filter({ ...filters, status })} />
            </Filter>
            <Filter label={t('common.search')}>
              <Input ref={search} data-testid={ids.search} aria-label={t('parameters.search-placeholder')} style={{ width: 200 }}
                placeholder={t('parameters.search-placeholder')} value={filters.search ?? ''}
                onChange={event => filter({ ...filters, search: event.target.value })} />
            </Filter>
          </Space>
          <Typography.Text>{tCount('common.row-count', grid.rows.length)} · {tCount('common.selected-count', selection.length)}</Typography.Text>
          <Refusal message={notice} testId={notice === 'trend-error.trend-limit' ? ids.trendLimit : undefined} />
          <div data-testid={ids.grid} role="table" aria-label={t('parameters.grid')} aria-rowcount={grid.rows.length + 1} aria-colcount={11}>
            <ConfigProvider theme={{ components: {
              Table: { cellFontSizeSM: 13, cellPaddingInlineSM: 4, cellPaddingBlockSM: 4 },
              Button: { contentFontSizeSM: 13 },
            } }}>
              <Table<TagRow>
                onRow={(_, index) => ({ role: 'row', 'aria-rowindex': (index ?? 0) + 2 })}
                rowKey="tagId" size="small" pagination={false} loading={passiveLoading}
                // Virtual Table needs a numeric minimum width; columns expand to fill wider containers.
                virtual scroll={{ x: 832, y: 440 }} dataSource={grid.rows}
                locale={{ emptyText: <Empty data-testid={ids.gridEmpty} description={t('parameters.grid-empty')} /> }}
                rowSelection={{
                  onCell: () => ({ role: 'cell' }),
                  columnWidth: 28, selectedRowKeys: selection, preserveSelectedRowKeys: true,
                  getTitleCheckboxProps: () => ({ 'aria-label': t('parameters.select-all-tags') }),
                  getCheckboxProps: row => ({ 'aria-label': t('parameters.select-tag', { tag: row.tagId }), 'data-testid': ids.tagSelect }),
                  onChange: keys => {
                    const next = keys.map(String);
                    const result = trendView(dataset, next, window, snapshot.tick, state.overlay);
                    if ('error' in result) { setNotice(trendErrorLabels[result.error]); return; }
                    setSelection(next); setNotice(null); setOverrideError(null);
                  },
                }}
                columns={columns.map(column => ({
                  ...column,
                  onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
                  onCell: () => ({ role: 'cell', style: { overflowWrap: 'anywhere' } }),
                }))}
              />
            </ConfigProvider>
          </div>
        </Space>
      </Card>
      <Card title={t('parameters.trend')} style={fullWidth}>
        <Space orientation="vertical" size="middle" style={fullWidth}>
          <Filter label={t('parameters.trend-window')}>
            <Select data-testid={ids.trendWindow} aria-label={t('parameters.trend-window')} style={{ width: 200 }} virtual={false}
              value={window} options={Object.entries(trendWindowLabels).map(([value, label]) => ({ value, label: t(label) }))}
              onChange={window => { setWindow(window); setNotice(null); setOverrideError(null); }} />
          </Filter>
          <Trend selection={selection} window={window} />
        </Space>
      </Card>
      <Card title={t('parameters.connectivity')} style={fullWidth}>
        <Table<ConnectivityRow> data-testid={ids.connectivity} rowKey="machineId" size="small" pagination={false} loading={passiveLoading} dataSource={links}
          locale={{ emptyText: <Empty description={t('parameters.connectivity-empty')} /> }}
          columns={[
            { key: 'line', title: t('scope.line'), dataIndex: 'lineId' },
            { key: 'machine', title: t('term.machine'), dataIndex: 'machineId' },
            { key: 'status', title: t('parameters.link-status'), render: (_, row) => t(linkStatusLabels[row.linkStatus]) },
            { key: 'lastSeen', title: t('parameters.last-seen'), render: (_, row) => formatDateTime(row.lastSeenAt) },
          ]} />
      </Card>
      <Modal open={tag !== null} title={tag ? `${t('parameters.override')} · ${tag.name}` : t('parameters.override')} onCancel={close}
        footer={(
          <Space>
            <Button onClick={close}>{t('action.cancel')}</Button>
            <Button data-testid={ids.overrideApply} type="primary" disabled={!tag?.canOverride} onClick={apply}>{t('action.setpoint-override')}</Button>
          </Space>
        )}>
        {tag && <Space orientation="vertical" size="middle" style={fullWidth}>
          <Filter label={t('parameters.override-value')}>
            <InputNumber data-testid={ids.overrideValue} aria-label={t('parameters.override-value')} value={value}
              onChange={value => { setValue(value); setOverrideError(null); }} />
          </Filter>
          <Filter label={t('parameters.override-reason')}>
            <Input data-testid={ids.overrideReason} aria-label={t('parameters.override-reason')} required value={reason}
              placeholder={t('parameters.override-reason-placeholder')} onChange={event => { setReason(event.target.value); setOverrideError(null); }} />
          </Filter>
          <Refusal message={overrideError} testId={ids.overrideError} />
        </Space>}
      </Modal>
    </Space>
  );
}
