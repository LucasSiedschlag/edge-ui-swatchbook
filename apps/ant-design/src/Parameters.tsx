import { useChartTheme } from './useChartTheme';
import {
  DEFAULT_TREND_WINDOW, MAX_TREND_TAGS, TAG_GRID_DEFAULT_FILTERS, TEST_IDS, connectivityView, decimalSeparator, formatTagValue,
  linkStatusLabels, plantErrorLabels, simulatedTime, tagDetailView, tagGridView, tagStatusLabels,
  trendErrorLabels, trendView, trendWindowLabels,
  type ConnectivityRow, type MessageKey, type TagFilters, type TagRow, type TagStatus, type TrendWindowId,
} from '@swatchbook/core';
import { actionErrorLabel, useActions, useI18n, usePreferences, useShortcutHandlers, useSimulation } from '@swatchbook/runtime';
import type { LineTrendFormatters, LineTrendLabels } from '@swatchbook/charts';
import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { InputRef, TableColumnsType } from 'antd';
import { cloneElement, forwardRef, lazy, Suspense, useCallback, useId, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactElement, type ReactNode } from 'react';

const ids = TEST_IDS.parameters;
const LineTrendChart = lazy(() => import('@swatchbook/charts').then(module => ({ default: module.LineTrendChart })));
// Native Table wraps its children in Spin, whose default live region would announce every tick.
const passiveLoading = { spinning: false, 'aria-live': 'off' } as const;
const visuallyHidden: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};
// Virtual Table separates the native header table from its div-based body.
// Explicit roles join both under the Screen's single ARIA table.
type GridHeaderTableProps = ComponentProps<'table'>;
type GridHeaderGroupProps = ComponentProps<'thead'>;
type GridHeaderCellProps = ComponentProps<'th'>;
function GridHeaderTable(props: GridHeaderTableProps) {
  return <table {...props} role="presentation" />;
}
function GridHeaderGroup(props: GridHeaderGroupProps) {
  return <thead {...props} role="rowgroup" />;
}
function GridHeaderCell(props: GridHeaderCellProps) {
  return <th {...props} role={props.className?.includes('cell-scrollbar') ? 'presentation' : 'columnheader'} />;
}
const GridBodyGroup = forwardRef<HTMLDivElement, ComponentProps<'div'>>((props, ref) => <div {...props} ref={ref} role="rowgroup" />);
const gridComponents = {
  table: GridHeaderTable,
  header: { table: GridHeaderTable, wrapper: GridHeaderGroup, cell: GridHeaderCell },
  body: { wrapper: GridBodyGroup },
};
const fullWidth = { width: '100%', minWidth: 0 };
const selectionColumnWidth = 40;

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <Space orientation="vertical" size="small"><Typography.Text>{label}</Typography.Text>{children}</Space>;
}

function Refusal({ message, testId }: { message: MessageKey | null; testId?: string }) {
  const { t } = useI18n();
  return message ? <Alert data-testid={testId} role="status" type="warning" showIcon title={t(message)} /> : null;
}

/**
 * Hover goes through Ant Design, focus through plain state: the Modal moves focus while React commits, and Ant's own focus
 * trigger calls flushSync from inside that commit, which React reports as an error.
 */
function ReasonTip({ title, children }: { title: ReactNode; children: ReactElement<{ onFocus?: () => void; onBlur?: () => void }> }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <Tooltip title={title} trigger={['hover']} open={Boolean(title) && (hover || focus)} onOpenChange={setHover}>
      {cloneElement(children, { onFocus: () => setFocus(true), onBlur: () => setFocus(false) })}
    </Tooltip>
  );
}

function TagActions({ row, onOpen, onReset }: { row: TagRow; onOpen: (row: TagRow) => void; onReset: (row: TagRow) => void }) {
  const { t, locale } = useI18n();
  const id = useId();
  const overrideReason = row.overrideUnavailable && t(plantErrorLabels[row.overrideUnavailable]);
  const resetReason = row.resetUnavailable && t(row.resetUnavailable === 'recipe-value-unchanged'
    ? 'parameters.recipe-value-unchanged' : plantErrorLabels[row.resetUnavailable]);
  const recipeValue = `${t('parameters.recipe-value')}: ${formatTagValue(locale, row.recipeValue, row.unit)} ${row.unit}`;
  return <Space orientation="vertical" size={2}>
    <ReasonTip title={overrideReason}>
      <Button data-testid={ids.override} size="small" aria-disabled={!row.canOverride}
        aria-describedby={!row.canOverride ? `${id}-override` : undefined} style={{ whiteSpace: 'nowrap' }}
        onClick={() => { if (row.canOverride) onOpen(row); }}>{t('parameters.override')}</Button>
    </ReasonTip>
    {!row.canOverride && <span id={`${id}-override`} style={visuallyHidden}>{overrideReason}</span>}
    <ReasonTip title={resetReason || recipeValue}>
      <Button data-testid={ids.resetRecipe} size="small" aria-disabled={!row.canResetToRecipe}
        aria-describedby={`${id}-recipe${resetReason ? ` ${id}-reset` : ''}`} style={{ whiteSpace: 'nowrap' }}
        onClick={() => { if (row.canResetToRecipe) onReset(row); }}>{t('action.reset-to-recipe')}</Button>
    </ReasonTip>
    <span id={`${id}-recipe`} style={visuallyHidden}>{recipeValue}</span>
    {!row.canResetToRecipe && resetReason && <span id={`${id}-reset`} style={visuallyHidden}>{resetReason}</span>}
  </Space>;
}

function Trend({ selection, window }: { selection: string[]; window: TrendWindowId }) {
  const { dataset, tick, state } = useSimulation();
  const i18n = useI18n();
  const { t, locale, formatTime } = i18n;
  const chartTheme = useChartTheme();
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
  const emptyTrend = <div data-testid={ids.trend}><span data-testid={ids.trendEmpty}>{labels.empty}</span></div>;
  if ('error' in view) return <div data-testid={ids.trend}><Refusal message={trendErrorLabels[view.error]} /></div>;
  if (!data.length) return emptyTrend;
  return <Suspense fallback={emptyTrend}>
    <Typography.Text type="secondary">{t('parameters.series.limit')}: {labels.minimum} / {labels.maximum}</Typography.Text>
    <LineTrendChart data={data} labels={labels} formatters={formatters} theme={chartTheme}
      testId={ids.trend} emptyTestId={ids.trendEmpty} height={320} />
  </Suspense>;
}

export function Parameters() {
  const { dataset, snapshot } = useSimulation();
  const dispatch = useActions();
  const { density } = usePreferences();
  const { t, tr, locale, formatDateTime, tCount } = useI18n();
  const [filters, setFilters] = useState<TagFilters>(TAG_GRID_DEFAULT_FILTERS);
  const [selection, setSelection] = useState<string[]>([]);
  const [trendWindow, setTrendWindow] = useState<TrendWindowId>(DEFAULT_TREND_WINDOW);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [overrideError, setOverrideError] = useState<MessageKey | null>(null);
  const search = useRef<InputRef>(null);
  useShortcutHandlers({ 'focus-search': () => search.current?.focus() });
  const unfilteredGrid = useMemo(() => tagGridView(dataset, snapshot), [dataset, snapshot]);
  const hasFilters = Object.values(filters).some(Boolean);
  const grid = useMemo(() => hasFilters ? tagGridView(dataset, snapshot, filters) : unfilteredGrid, [dataset, snapshot, filters, hasFilters, unfilteredGrid]);
  const links = connectivityView(dataset, snapshot);
  const tag = openTag === null ? null : tagDetailView(dataset, snapshot, openTag);
  const separator = decimalSeparator(locale);
  const open = useCallback((row: TagRow) => {
    setOpenTag(row.tagId); setValue(row.setpoint); setReason(''); setOverrideError(null); setNotice(null);
  }, []);
  const reset = useCallback((row: TagRow) => {
    setNotice(actionErrorLabel(dispatch({ type: 'reset-to-recipe', tagId: row.tagId })));
  }, [dispatch]);
  const columns = useMemo<TableColumnsType<TagRow>>(() => {
    const number = (value: number | null, unit: string) => formatTagValue(locale, value, unit);
    const columns: TableColumnsType<TagRow> = [
      { key: 'line', title: t('scope.line'), dataIndex: 'lineId', width: 48 },
      { key: 'machine', title: t('term.machine'), dataIndex: 'machineId', width: 88, ellipsis: { showTitle: true } },
      { key: 'name', title: t('parameters.tag-name'), dataIndex: 'name', width: 112, ellipsis: { showTitle: true } },
      { key: 'value', title: t('parameters.current-value'), width: 104, render: (_, row) => number(row.value, row.unit) },
      { key: 'unit', title: t('common.unit'), dataIndex: 'unit', width: 72 },
      { key: 'setpoint', title: t('term.setpoint'), width: 76, render: (_, row) => number(row.setpoint, row.unit) },
      { key: 'min', title: t('common.minimum'), width: 80, render: (_, row) => number(row.min, row.unit) },
      { key: 'max', title: t('common.maximum'), width: 80, render: (_, row) => number(row.max, row.unit) },
      { key: 'status', title: t('common.status'), width: 72, render: (_, row) => t(tagStatusLabels[row.status]) },
      { key: 'actions', title: t('parameters.override'), width: 256, fixed: 'right', render: (_, row) => <TagActions row={row} onOpen={open} onReset={reset} /> },
    ];
    return columns.map(column => ({
      ...column,
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      onCell: () => ({ role: 'cell', style: { whiteSpace: 'nowrap' } }),
    }));
  }, [t, locale, open, reset]);
  const gridWidth = selectionColumnWidth + columns.reduce((sum, column) => sum + Number(column.width), 0);
  function filter(next: TagFilters) {
    setFilters(next);
    setNotice(null);
    close();
  }
  function close() { setOpenTag(null); setOverrideError(null); }
  function apply() {
    if (!tag) return;
    const result = dispatch({ type: 'setpoint-override', tagId: tag.tagId, value: value ?? Number.NaN, reason });
    setOverrideError(actionErrorLabel(result));
    if (result.ok) close();
  }
  const wholeEmpty = unfilteredGrid.empty && !links.length;
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
          <div data-testid={ids.grid} role="table" aria-label={t('parameters.grid')} aria-rowcount={grid.rows.length + 1} aria-colcount={columns.length + 1}>
            <Table<TagRow>
              components={gridComponents}
              onHeaderRow={() => ({ role: 'row', 'aria-rowindex': 1 })}
              onRow={(_, index) => ({ role: 'row', 'aria-rowindex': (index ?? 0) + 2 })}
              rowKey="tagId" size={density === 'compact' ? 'small' : 'middle'} pagination={false} loading={passiveLoading}
              // Virtual Table keeps sticky fixed cells in the same rows, without duplicate ARIA cells.
              // Use the column sum as the minimum width; columns expand to fill wider containers.
              virtual scroll={{ x: gridWidth, y: 440 }} dataSource={grid.rows}
              locale={{ emptyText: <Empty data-testid={ids.gridEmpty} description={t('parameters.grid-empty')} /> }}
              rowSelection={{
                onCell: () => ({ role: 'cell' }),
                fixed: 'left', columnWidth: selectionColumnWidth, selectedRowKeys: selection, preserveSelectedRowKeys: true,
                getTitleCheckboxProps: () => ({ 'aria-label': t('parameters.select-all-tags') }),
                getCheckboxProps: row => ({ 'aria-label': t('parameters.select-tag', { tag: row.tagId }), 'data-testid': ids.tagSelect }),
                onChange: keys => {
                  const next = keys.map(String);
                  if (next.length > MAX_TREND_TAGS) { setNotice(trendErrorLabels['trend-limit']); return; }
                  setSelection(next); setNotice(null); setOverrideError(null);
                },
              }}
              columns={columns}
            />
          </div>
        </Space>
      </Card>
      <Card title={t('parameters.trend')} style={fullWidth}>
        <Space orientation="vertical" size="middle" style={fullWidth}>
          <Filter label={t('parameters.trend-window')}>
            <Select data-testid={ids.trendWindow} aria-label={t('parameters.trend-window')} style={{ width: 200 }} virtual={false}
              value={trendWindow} options={Object.entries(trendWindowLabels).map(([value, label]) => ({ value, label: t(label) }))}
              onChange={trendWindow => { setTrendWindow(trendWindow); setNotice(null); setOverrideError(null); }} />
          </Filter>
          <Trend selection={selection} window={trendWindow} />
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
          <Typography.Text>{t('parameters.recipe-value')}: {formatTagValue(locale, tag.recipeValue, tag.unit)} {tag.unit}</Typography.Text>
          <Refusal message={tag.overrideUnavailable ? plantErrorLabels[tag.overrideUnavailable] : null} />
          <Filter label={t('parameters.override-value')}>
            <InputNumber<number | string> data-testid={ids.overrideValue} aria-label={t('parameters.override-value')} value={value}
              decimalSeparator={separator}
              parser={input => (input ?? '').replace(separator, '.')}
              formatter={(value, { userTyping, input }) => userTyping ? input : String(value ?? '').replace('.', separator)}
              onChange={value => { setValue(value === null || value === '' ? null : Number(value)); setOverrideError(null); }} />
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
