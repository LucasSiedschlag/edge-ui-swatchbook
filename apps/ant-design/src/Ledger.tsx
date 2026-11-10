import {
  BATCH_STATUSES, SHIFT_IDS, DATA_END, DATA_START, LEDGER_DEFAULT_FILTERS, LEDGER_DEFAULT_SORT, LEDGER_FILTER_COLUMNS, MAX_COMPARE, TEST_IDS,
  alarmPriorityLabels, alarmStateLabels, batchDetail, batchStatusLabels, canCompare, compareBatches, decimalSeparator,
  formatTagValue, ledgerFilterDescriptions, ledgerFilterId, ledgerFilterLabels, ledgerGenealogyLabels, ledgerView,
  nextLedgerSort, shiftLabels, toggleSelection,
  type AlarmRow, type DetailParameter, type LedgerColumn, type LedgerFilterColumn, type LedgerFilterValues,
  type LedgerRange, type LedgerRow, type LedgerSort, type MessageKey,
} from '@swatchbook/core';
import { useI18n, usePlantState, usePreferences, useShortcutHandlers, useSimulation } from '@swatchbook/runtime';
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Empty, Input, InputNumber, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { InputRef, TableColumnsType } from 'antd';
import enUS from 'antd/locale/en_US';
import ptBR from 'antd/locale/pt_BR';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { cloneElement, forwardRef, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactElement, type ReactNode } from 'react';

const ids = TEST_IDS.ledger;
const fullWidth = { width: '100%', minWidth: 0 };
const passiveLoading = { spinning: false, 'aria-live': 'off' } as const;
const visuallyHidden: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};
const nowrap = { whiteSpace: 'nowrap' } as const;
type HeaderTableProps = ComponentProps<'table'>;
type HeaderGroupProps = ComponentProps<'thead'>;
type HeaderCellProps = ComponentProps<'th'>;
function HeaderTable(props: HeaderTableProps) {
  return <table {...props} role="presentation" />;
}
function HeaderGroup(props: HeaderGroupProps) {
  return <thead {...props} role="rowgroup" />;
}
function HeaderCell(props: HeaderCellProps) {
  return <th {...props} role={props.className?.includes('cell-scrollbar') ? 'presentation' : 'columnheader'} />;
}
const BodyGroup = forwardRef<HTMLDivElement, ComponentProps<'div'>>((props, ref) => <div {...props} ref={ref} role="rowgroup" />);
const gridComponents = {
  table: HeaderTable, header: { table: HeaderTable, wrapper: HeaderGroup, cell: HeaderCell }, body: { wrapper: BodyGroup },
};
const columnDefinitions: readonly { column: LedgerColumn; label: MessageKey; width: number }[] = [
  { column: 'batchId', label: 'common.batch-id', width: 164 },
  { column: 'lotId', label: 'term.lot', width: 172 },
  { column: 'upstreamLotId', label: 'ledger.column.upstream-lot', width: 240 },
  { column: 'areaId', label: 'scope.area', width: 160 },
  { column: 'lineId', label: 'scope.line', width: 220 },
  { column: 'productCode', label: 'common.product', width: 320 },
  { column: 'recipeVersion', label: 'event-target.recipe-version', width: 200 },
  { column: 'shift', label: 'event-target.shift', width: 150 },
  { column: 'start', label: 'common.start', width: 180 },
  { column: 'end', label: 'common.end', width: 180 },
  { column: 'durationMinutes', label: 'common.duration', width: 130 },
  { column: 'status', label: 'common.status', width: 130 },
  { column: 'yieldPct', label: 'ledger.column.yield', width: 200 },
  { column: 'scrap', label: 'ledger.column.scrap', width: 200 },
];

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <Space orientation="vertical" size="small"><Typography.Text>{label}</Typography.Text>{children}</Space>;
}

// Ant handles hover; plain focus state avoids flushSync when a dialog moves focus during commit.
function ReasonTip({ title, children }: { title: ReactNode; children: ReactElement<{ onFocus?: () => void; onBlur?: () => void }> }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  return <Tooltip title={title} trigger={['hover']} open={Boolean(title) && (hover || focus)} onOpenChange={setHover}>
    {cloneElement(children, { onFocus: () => setFocus(true), onBlur: () => setFocus(false) })}
  </Tooltip>;
}

function NumberRange({ column, value, onChange }: { column: LedgerFilterColumn; value?: LedgerRange; onChange(value: LedgerRange): void }) {
  const { t, locale } = useI18n();
  const separator = decimalSeparator(locale);
  return <Space data-testid={ledgerFilterId(column)} role="group" aria-label={t(ledgerFilterLabels[column])}>
    {(['min', 'max'] as const).map(bound => <InputNumber<number | string> key={bound} style={{ width: 114 }} value={value?.[bound] ?? null}
      aria-label={`${t(ledgerFilterLabels[column])} · ${t(bound === 'min' ? 'common.from' : 'common.to')}`}
      placeholder={t(bound === 'min' ? 'common.from' : 'common.to')}
      min={bound === 'max' ? value?.min : undefined} max={bound === 'min' ? value?.max : undefined}
      decimalSeparator={separator} parser={input => (input ?? '').replace(separator, '.')}
      formatter={(number, { userTyping, input }) => userTyping ? input : String(number ?? '').replace('.', separator)}
      onChange={number => onChange({ ...value, [bound]: number === null || number === '' ? undefined : Number(number) })} />)}
  </Space>;
}

function Comparison({ selection }: { selection: string[] }) {
  const { state: { dataset } } = usePlantState();
  const { t, tr, locale, formatDuration, formatPercentValue, formatNumber } = useI18n();
  const view = useMemo(() => compareBatches(dataset, selection), [dataset, selection]);
  return <Card data-testid={ids.comparePanel} title={t('ledger.compare-panel')} style={fullWidth}>
    {'error' in view
      ? <Alert role="status" type="warning" title={t(`ledger.result.${view.error}`)} />
      : <Space orientation="vertical" size="middle" style={fullWidth}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {view.columns.map(batch => <Descriptions key={batch.batchId} title={batch.batchId} column={1} style={{ flex: '1 1 160px', minWidth: 0 }} items={[
          { key: 'duration', label: t('common.duration'), children: formatDuration(batch.durationSeconds) },
          { key: 'yield', label: t('ledger.column.yield'), children: formatPercentValue(batch.yieldPct) },
          { key: 'scrap', label: t('ledger.column.scrap'), children: formatNumber(batch.scrap) },
        ]} />)}
      </div>
      <Table dataSource={view.parameters} rowKey="key" pagination={false} loading={passiveLoading} scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('ledger.parameters-empty') }} columns={[
          { key: 'name', title: t('common.parameter'), render: (_, row) => tr(row.name) },
          { key: 'unit', title: t('common.unit'), dataIndex: 'unit' },
          ...view.columns.map((batch, index) => ({ key: batch.batchId, title: batch.batchId, render: (_: unknown, row: typeof view.parameters[number]) => formatTagValue(locale, row.values[index]?.actual ?? null, row.unit) })),
        ]} />
    </Space>}
  </Card>;
}

function Details({ batchId, close, navigate }: { batchId: string | null; close(): void; navigate(id: string): void }) {
  const { state, tick } = useSimulation();
  const { t, tr, locale, formatPercentValue, formatDateTime } = useI18n();
  const detail = useMemo(() => batchId === null ? null : batchDetail(state, tick, batchId), [state, tick, batchId]);
  const parameterColumns: TableColumnsType<DetailParameter> = [
    { key: 'name', title: t('common.parameter'), render: (_, row) => tr(row.name) },
    { key: 'actual', title: t('common.actual'), render: (_, row) => formatTagValue(locale, row.actual, row.unit) },
    { key: 'setpoint', title: t('term.setpoint'), render: (_, row) => formatTagValue(locale, row.setpoint, row.unit) },
    { key: 'deviation',
      title: <span title={t('common.deviation')}>{t('common.deviation-percent')}</span>, render: (_, row) => row.deviationPct === null ? t('common.unknown') : formatPercentValue(row.deviationPct) },
    { key: 'min', title: t('common.minimum'), render: (_, row) => formatTagValue(locale, row.min, row.unit) },
    { key: 'max', title: t('common.maximum'), render: (_, row) => formatTagValue(locale, row.max, row.unit) },
    { key: 'unit', title: t('common.unit'), dataIndex: 'unit' },
    { key: 'status', title: t('common.status'), render: (_, row) => t(row.insideLimits === null ? 'common.unknown' : row.insideLimits ? 'ledger.inside-limits' : 'ledger.outside-limits') },
  ];
  const alarmColumns: TableColumnsType<AlarmRow> = [
    { key: 'time', title: t('control.alarm-raised'), render: (_, row) => formatDateTime(row.raisedAt) },
    { key: 'machine', title: t('term.machine'), dataIndex: 'machineId' },
    { key: 'priority', title: t('control.alarm-priority'), render: (_, row) => t(alarmPriorityLabels[row.priority]) },
    { key: 'state', title: t('common.status'), render: (_, row) => t(alarmStateLabels[row.state]) },
    { key: 'message', title: t('common.message'), render: (_, row) => tr(row.message) },
  ];
  return <Drawer data-testid={ids.drawer} open={batchId !== null} title={t('ledger.drawer.header')} size={900} destroyOnHidden focusable={{ focusTriggerAfterClose: false }}
    onClose={close}
    extra={<Button onClick={close}>{t('action.close')}</Button>}>
    {detail && ('error' in detail
      ? <Alert type="warning" role="status" title={t('ledger.result.unknown-batch')} />
      : <Space orientation="vertical" size="large" style={fullWidth}>
      <Descriptions column={2} items={[
        { key: 'id', label: t('common.batch-id'), children: detail.header.batchId },
        { key: 'lot', label: t('term.lot'), children: detail.header.lotId },
        { key: 'status', label: t('common.status'), children: t(batchStatusLabels[detail.header.status]) },
        { key: 'line', label: t('scope.line'), children: detail.header.lineId },
        { key: 'product', label: t('common.product'), children: detail.header.productCode },
        { key: 'start', label: t('common.start'), children: formatDateTime(detail.header.start) },
        { key: 'end', label: t('common.end'), children: detail.header.end === null ? t('common.unknown') : formatDateTime(detail.header.end) },
      ]} />
      <Card data-testid={ids.drawerGenealogy} title={t('ledger.drawer.genealogy')} style={fullWidth}>
        {detail.genealogy.length ? <Descriptions column={1} items={detail.genealogy.map(node => ({ key: node.kind,
          label: t(ledgerGenealogyLabels[node.kind]), children: <Space wrap>
            <span>{node.lotId}</span>{node.serial && <span>{node.serial}</span>}
            {node.linked && node.batchId && <Typography.Link href="#/ledger" onClick={event => { event.preventDefault(); navigate(node.batchId!); }}>{node.batchId}</Typography.Link>}
            {!node.linked && node.batchId && <span>{node.batchId}</span>}
          </Space>,
        }))} /> : <Empty description={t('ledger.genealogy-empty')} />}
      </Card>
      <Card title={t('ledger.drawer.parameters')} style={fullWidth}>
        <Table<DetailParameter> data-testid={ids.drawerParameters} rowKey="parameterId" pagination={false} loading={passiveLoading}
          dataSource={detail.parameters} columns={parameterColumns} scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('ledger.parameters-empty') }} />
      </Card>
      <Card title={t('ledger.drawer.alarms')} style={fullWidth}>
        <Table<AlarmRow> data-testid={ids.drawerAlarms} rowKey="id" pagination={false} loading={passiveLoading}
          dataSource={detail.alarms} columns={alarmColumns} scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('ledger.alarms-empty') }} />
      </Card>
    </Space>)}
  </Drawer>;
}

export function Ledger() {
  const { state: { dataset } } = usePlantState();
  const { t, tr, locale, tCount, formatNumber, formatPercentValue, formatDateTime, formatDuration } = useI18n();
  const { density } = usePreferences();
  const [filters, setFilters] = useState<LedgerFilterValues>(LEDGER_DEFAULT_FILTERS);
  const [sort, setSort] = useState<LedgerSort>(LEDGER_DEFAULT_SORT);
  const [selection, setSelection] = useState<string[]>([]);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [comparing, setComparing] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const search = useRef<InputRef>(null);
  // Restore even when Escape interrupts the first native opening motion.
  useEffect(() => { if (batchId === null && opener.current?.isConnected) opener.current.focus(); }, [batchId]);
  const reasonId = useId();
  useShortcutHandlers({ 'focus-search': () => search.current?.focus() });
  const view = useMemo(() => ledgerView(dataset, { filters, sort, selected: selection }), [dataset, filters, sort, selection]);
  const filterDescriptions = useMemo(() => ledgerFilterDescriptions(dataset, view.activeFilters, locale), [dataset, view.activeFilters, locale]);
  function filter<K extends keyof LedgerFilterValues>(column: K, value: LedgerFilterValues[K]) {
    setFilters(previous => ({ ...previous, [column]: value })); setNotice(null);
  }
  function open(id: string, control: HTMLElement) { opener.current = control; setBatchId(id); setNotice(null); }
  const allowed = canCompare(selection);
  const compareReason = allowed ? null : t('ledger.result.compare-count');
  const columns: TableColumnsType<LedgerRow> = columnDefinitions.map(definition => ({
    key: definition.column, title: t(definition.label), width: definition.width, ellipsis: { showTitle: true }, fixed: definition.column === 'batchId' ? 'left' : undefined,
    sorter: true, sortOrder: sort.column === definition.column ? sort.direction === 'asc' ? 'ascend' : 'descend' : null,
    showSorterTooltip: { title: t(nextLedgerSort(sort, definition.column).default ? 'ledger.sort-default' : sort.column === definition.column && sort.direction === 'asc' ? 'common.sort-descending' : 'common.sort-ascending') },
    onHeaderCell: () => ({ style: nowrap, onClick: () => { setSort(nextLedgerSort(sort, definition.column)); setNotice(null); }, onKeyDown: event => { if (event.key === 'Enter') { setSort(nextLedgerSort(sort, definition.column)); setNotice(null); } }, 'aria-sort': sort.column === definition.column ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none' }),
    onCell: () => ({ role: 'cell', style: nowrap }),
    render: (_, row) => {
      switch (definition.column) {
        case 'areaId': return tr(row.areaName);
        case 'lineId': return `${row.lineId} · ${tr(row.lineName)}`;
        case 'productCode': return `${row.productCode} · ${tr(row.productName)}`;
        case 'recipeVersion': return formatNumber(row.recipeVersion);
        case 'shift': return t(shiftLabels[row.shift]);
        case 'start': case 'end': return formatDateTime(row[definition.column]);
        case 'durationMinutes': return formatDuration(row.durationSeconds);
        case 'status': return t(batchStatusLabels[row.status]);
        case 'yieldPct': return formatPercentValue(row.yieldPct);
        case 'scrap': return formatNumber(row.scrap);
        default: return row[definition.column] ?? t('common.none');
      }
    },
  }));
  columns.push({ key: 'actions', title: t('ledger.open-details'), fixed: 'right', width: 290,
    onHeaderCell: () => ({ style: nowrap }), onCell: () => ({ role: 'cell' }),
    render: (_, row) => <Button onClick={event => open(row.batchId, event.currentTarget)}>{t('ledger.open-details')}</Button>,
  });
  const gridWidth = 40 + columns.reduce((sum, column) => sum + Number(column.width), 0);
  const pickerLocale = locale === 'pt-BR' ? ptBR.DatePicker : enUS.DatePicker;
  const dayLocale = locale === 'pt-BR' ? 'pt-br' : 'en';
  const filterControl = (column: LedgerFilterColumn) => {
    const label = t(ledgerFilterLabels[column]);
    const testId = ledgerFilterId(column);
    switch (column) {
      case 'batchId': case 'lotId': case 'upstreamLotId':
        return <Input ref={column === 'batchId' ? search : undefined} data-testid={testId} aria-label={label}
        style={{ width: 240 }} placeholder={t('ledger.search-placeholder')} value={filters[column] ?? ''} onChange={event => filter(column, event.target.value)} />;
      case 'recipeVersion': case 'yield': case 'scrap': case 'duration': return <NumberRange column={column} value={filters[column]} onChange={value => filter(column, value)} />;
      case 'start': case 'end': return <div data-testid={testId}><DatePicker.RangePicker aria-label={label} locale={pickerLocale}
        style={{ width: 280 }} allowEmpty={[true, true]} placeholder={[t('common.from'), t('common.to')]}
        defaultPickerValue={[dayjs(DATA_START.date).locale(dayLocale), dayjs(DATA_END.date).locale(dayLocale)]}
        value={filters[column] ? [filters[column]?.fromDate ? dayjs(filters[column]!.fromDate).locale(dayLocale) : null, filters[column]?.toDate ? dayjs(filters[column]!.toDate).locale(dayLocale) : null] : null}
        format={locale === 'pt-BR' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}
        onChange={dates => filter(column, dates ? { fromDate: dates[0]?.format('YYYY-MM-DD'), toDate: dates[1]?.format('YYYY-MM-DD') } : undefined)} /></div>;
      default: {
        const options = column === 'areas' ? dataset.areas.map(area => ({ value: area.id, label: tr(area.name) }))
          : column === 'lines' ? dataset.lines.map(line => ({ value: line.id, label: `${line.id} · ${tr(line.name)}` }))
          : column === 'products' ? dataset.products.map(product => ({ value: product.id, label: `${product.code} · ${tr(product.name)}` }))
          : column === 'shifts' ? SHIFT_IDS.map(value => ({ value, label: t(shiftLabels[value]) })) : BATCH_STATUSES.map(value => ({ value, label: t(batchStatusLabels[value]) }));
        return <Select data-testid={testId} aria-label={label} mode="multiple" style={{ width: 240 }} virtual={false}
          allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} value={filters[column] ?? []} options={options}
          onChange={value => filter(column, value)} />;
      }
    }
  };
  return (
    <Space orientation="vertical" size="middle" style={fullWidth}>
      <Card title={t('ledger.grid')} style={fullWidth}>
        <Space orientation="vertical" size="middle" style={fullWidth}>
          <Typography.Text strong>{t('common.filter')}</Typography.Text>
          <Space wrap align="start">
            {LEDGER_FILTER_COLUMNS.map(column => <Filter key={column} label={t('ledger.filter-column', { column: t(ledgerFilterLabels[column]) })}>{filterControl(column)}</Filter>)}
          </Space>
          <Space wrap>
            <Button data-testid={ids.clearFilters} onClick={() => { setFilters(LEDGER_DEFAULT_FILTERS); setNotice(null); }}>{t('action.clear-filters')}</Button>
            <Typography.Text data-testid={ids.rowCount}>{tCount('common.row-count', view.rowCount)}</Typography.Text>
            <Typography.Text>{tCount('common.selected-count', view.selectedCount)}</Typography.Text>
            {view.selectedHidden > 0 && <Typography.Text>{tCount('ledger.selected-hidden', view.selectedHidden)}</Typography.Text>}
            <ReasonTip title={compareReason}>
              <Button data-testid={ids.compare} aria-disabled={!allowed} aria-describedby={!allowed ? reasonId : undefined}
                onClick={() => { if (allowed) { setComparing(true); setNotice(null); } }}>{t('action.compare')}</Button>
            </ReasonTip>
            {!allowed && <span id={reasonId} style={visuallyHidden}>{compareReason}</span>}
            <Typography.Text type="secondary">{t('common.sort')}</Typography.Text>
          </Space>
          {notice && <Alert data-testid={notice === 'ledger.result.selection-limit' ? ids.selectionLimit : undefined} role="status" type="warning" showIcon title={t(notice)} />}
          <div data-testid={ids.grid} role="table" aria-label={t('ledger.grid')} aria-rowcount={view.rowCount + 1} aria-colcount={columns.length + 1} style={fullWidth}>
            <Table<LedgerRow> rowKey="batchId" components={gridComponents} virtual scroll={{ x: gridWidth, y: 440 }} dataSource={view.rows}
              columns={columns} pagination={false} loading={passiveLoading} size={density === 'compact' ? 'small' : 'middle'}
              onHeaderRow={() => ({ role: 'row', 'aria-rowindex': 1 })}
              onRow={(row, index) => ({ role: 'row', 'aria-rowindex': (index ?? 0) + 2, tabIndex: 0,
                onKeyDown: event => { if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); open(row.batchId, event.currentTarget); } },
              })}
              locale={{ emptyText: <div data-testid={ids.empty}><Empty description={t('ledger.empty')} />
                <Typography.Text strong>{t('ledger.active-filters')}</Typography.Text>
                {filterDescriptions.map(description => <Typography.Paragraph key={description}>{description}</Typography.Paragraph>)}
              </div> }}
              rowSelection={{
                fixed: 'left', columnWidth: 40, preserveSelectedRowKeys: true, selectedRowKeys: selection, onCell: () => ({ role: 'cell' }),
                getTitleCheckboxProps: () => ({ disabled: !view.canSelectAll, 'aria-label': t('ledger.select-all') }),
                getCheckboxProps: row => ({ 'aria-label': t('ledger.select-batch', { batch: row.batchId }), 'data-testid': ids.rowSelect }),
                onChange: (keys, _, info) => {
                  if (info.type === 'single') return;
                  if (keys.length > MAX_COMPARE) { setNotice('ledger.result.selection-limit'); return; }
                  setSelection(keys.map(String)); setComparing(false); setNotice(null);
                },
                onSelect: row => {
                  const result = toggleSelection(selection, row.batchId);
                  setSelection(result.selected); setNotice(`ledger.result.${result.result}`); if (result.result !== 'selection-limit') setComparing(false);
                },
                columnTitle: checkbox => <span title={t('common.select-item')}>{checkbox}</span>,
              }} />
          </div>
        </Space>
      </Card>
      {comparing && <Comparison selection={selection} />}
      <Details batchId={batchId} close={() => setBatchId(null)} navigate={setBatchId} />
    </Space>
  );
}
