import {
  DIAGNOSTICS_DEFAULT_SORT, EVENT_LOG_DEFAULT_RANGE, TEST_IDS, alarmListView, alarmPriorityLabels, alarmStateLabels, connectivityView, eventActionLabels,
  eventLogView, eventTargetLabels, eventValueLabelKey, linkStatusLabels, rangeLabels, roleLabels,
  type AlarmFilters, type AlarmRow, type ConnectivitySort, type EventFilters, type EventRow, type MessageKey,
} from '@swatchbook/core';
import { actionErrorLabel, useActions, useI18n, useShortcutHandlers, useSimulation } from '@swatchbook/runtime';
import { Alert, Button, Card, Empty, Select, Space, Table, Typography } from 'antd';
import { useEffect, useRef, useState, type Key, type ReactNode } from 'react';
import type { RefSelectProps } from 'antd';

const ids = TEST_IDS.control;
const SORT_COLUMNS: Record<ConnectivitySort['column'], MessageKey> = {
  status: 'parameters.link-status', latency: 'control.diagnostics-latency',
  packetLoss: 'control.diagnostics-packet-loss', machine: 'term.machine',
};
const DIRECTIONS = ['asc', 'desc'] as const;
const alarmElementId = (id: string) => `control-alarm-${id}`;

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <Space orientation="vertical" size="small"><Typography.Text>{label}</Typography.Text>{children}</Space>;
}

function EventLog() {
  const { state, tick, dataset } = useSimulation();
  const { t, tr, formatDateTime, formatNumber, tCount } = useI18n();
  const [filters, setFilters] = useState<EventFilters>({ range: EVENT_LOG_DEFAULT_RANGE });
  const events = eventLogView(state, tick, filters);
  const value = (row: EventRow, raw: EventRow['oldValue']) => {
    if (raw === null) return t('common.none');
    const label = eventValueLabelKey(row.action, raw);
    return label ? t(label) : typeof raw === 'number' ? formatNumber(raw, { decimals: 2 }) : raw;
  };
  const note = (row: EventRow) => {
    if (row.note === null) return t('common.none');
    return typeof row.note === 'string' ? row.note : tr(row.note);
  };
  return (
    <Card title={t('term.event-log')}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Text strong>{t('control.filter-events')}</Typography.Text>
        <Space wrap align="start">
          <Filter label={t('control.event-user')}>
            <Select
              data-testid={ids.eventFilterUser} aria-label={t('control.event-user')}
              allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} style={{ minWidth: 220 }}
              value={filters.userId} options={dataset.users.map(user => ({ value: user.id, label: user.name }))}
              onChange={userId => setFilters({ ...filters, userId })}
            />
          </Filter>
          <Filter label={t('control.event-action')}>
            <Select
              data-testid={ids.eventFilterType} aria-label={t('control.event-action')}
              mode="multiple" allowClear={{ label: t('action.clear-filters') }} virtual={false} placeholder={t('common.all')} style={{ minWidth: 260 }}
              value={filters.actions} options={Object.entries(eventActionLabels).map(([value, key]) => ({ value, label: t(key) }))}
              onChange={actions => setFilters({ ...filters, actions })}
            />
          </Filter>
          <Filter label={t('control.event-range')}>
            <Select
              data-testid={ids.eventFilterRange} aria-label={t('control.event-range')} style={{ minWidth: 200 }}
              value={filters.range} options={Object.entries(rangeLabels).map(([value, key]) => ({ value, label: t(key) }))}
              onChange={range => setFilters({ ...filters, range })}
            />
          </Filter>
        </Space>
        <Typography.Text type="secondary">{tCount('common.row-count', events.rows.length)}</Typography.Text>
        <Table<EventRow>
          data-testid={ids.eventLog} rowKey="id" size="small" pagination={false}
          dataSource={events.rows}
          locale={{ emptyText: <Empty data-testid={ids.eventEmpty} description={t('control.event-empty')} /> }}
          columns={[
            { key: 'time', title: t('common.time'), render: (_, row) => formatDateTime(row.at) },
            { key: 'user', title: t('control.event-user'), dataIndex: 'userName' },
            { key: 'role', title: t('control.event-role'), render: (_, row) => t(roleLabels[row.role]) },
            { key: 'action', title: t('control.event-action'), render: (_, row) => t(eventActionLabels[row.action]) },
            { key: 'kind', title: t('control.event-target-kind'), render: (_, row) => t(eventTargetLabels[row.targetKind]) },
            { key: 'target', title: t('control.event-target'), dataIndex: 'target' },
            { key: 'change', title: t('common.change'), children: [
              { key: 'old', title: t('control.event-old-value'), render: (_, row) => value(row, row.oldValue) },
              { key: 'new', title: t('control.event-new-value'), render: (_, row) => value(row, row.newValue) },
            ] },
            { key: 'note', title: t('control.event-note'), render: (_, row) => note(row) },
          ]}
        />
      </Space>
    </Card>
  );
}

function Diagnostics({ openAlarm }: { openAlarm(id: string): void }) {
  const { dataset, snapshot } = useSimulation();
  const { t, formatNumber, formatPercentValue, formatDateTime } = useI18n();
  const [sort, setSort] = useState<ConnectivitySort>(DIAGNOSTICS_DEFAULT_SORT);
  const sorts = (Object.entries(SORT_COLUMNS) as [ConnectivitySort['column'], MessageKey][]).flatMap(([column, key]) =>
    DIRECTIONS.map(direction => ({
      value: `${column}-${direction}`, column, direction,
      label: `${t(key)} · ${t(direction === 'asc' ? 'common.sort-ascending' : 'common.sort-descending')}`,
    })));
  return (
    <Card title={t('control.diagnostics')}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Filter label={t('control.diagnostics-sort')}>
          <Select
            data-testid={ids.diagnosticsSort} aria-label={t('control.diagnostics-sort')} title={t('common.sort')}
            style={{ minWidth: 440 }} virtual={false} value={`${sort.column}-${sort.direction}`} options={sorts}
            onChange={value => { const next = sorts.find(option => option.value === value)!; setSort({ column: next.column, direction: next.direction }); }}
          />
        </Filter>
        <Table
          data-testid={ids.diagnostics} rowKey="machineId" size="small" pagination={false}
          dataSource={connectivityView(dataset, snapshot, sort)} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description={t('control.diagnostics-empty')} /> }}
          columns={[
            { key: 'machine', title: t('term.machine'), render: (_, row) => {
              const alarmId = row.alarmId;
              if (alarmId === null) return row.machineId;
              return <Button type="link" title={t('control.open-machine-alarm')} aria-label={`${t('control.open-machine-alarm')} ${row.machineId}`} onClick={() => openAlarm(alarmId)}>{row.machineId}</Button>;
            } },
            { key: 'status', title: t('parameters.link-status'), render: (_, row) => t(linkStatusLabels[row.linkStatus]) },
            { key: 'latency', title: `${t('control.diagnostics-latency')} (ms)`, render: (_, row) => row.latencyMs === null ? t('common.none') : formatNumber(row.latencyMs, { decimals: 1 }) },
            { key: 'loss', title: t('control.diagnostics-packet-loss'), render: (_, row) => formatPercentValue(row.packetLossPct) },
            { key: 'heartbeat', title: t('control.diagnostics-heartbeat'), render: (_, row) => formatDateTime(row.lastSeenAt) },
            { key: 'errors', title: t('control.diagnostics-error-count'), render: (_, row) => formatNumber(row.errorCount) },
          ]}
        />
      </Space>
    </Card>
  );
}

export function Control() {
  const { state, tick, dataset } = useSimulation();
  const dispatch = useActions();
  const { t, tr, tCount, formatDateTime, formatDuration } = useI18n();
  const [filters, setFilters] = useState<AlarmFilters>({});
  const [selection, setSelection] = useState<Key[]>([]);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [noticeType, setNoticeType] = useState<'info' | 'warning'>('info');
  const [acknowledgeAttempts, setAcknowledgeAttempts] = useState(0);
  const [focusedAlarm, setFocusedAlarm] = useState<string | null>(null);
  const priorityFilter = useRef<RefSelectProps>(null);
  const alarms = alarmListView(state, tick, filters);
  const selectedIds = alarms.rows.filter(row => selection.includes(row.id)).map(row => row.id);

  function acknowledge() {
    setAcknowledgeAttempts(attempts => attempts + 1);
    if (!selectedIds.length) return false;
    const result = dispatch({ type: 'acknowledge', alarmIds: selectedIds });
    setNoticeType(result.ok ? 'info' : 'warning');
    setNotice(result.ok ? result.events.length === 0 ? 'control.already-acknowledged' : null : actionErrorLabel(result));
  }
  useShortcutHandlers({ acknowledge, 'focus-search': () => priorityFilter.current?.focus() });
  useEffect(() => {
    if (!focusedAlarm) return;
    const row = document.getElementById(alarmElementId(focusedAlarm));
    row?.focus();
    row?.scrollIntoView({ block: 'nearest' });
  }, [focusedAlarm]);

  function filter(next: AlarmFilters) {
    setFilters(next);
    setSelection([]);
    setNotice(null);
    setFocusedAlarm(null);
  }
  const openAlarm = (id: string) => {
    setFilters({});
    setSelection([id]);
    setNotice(null);
    setFocusedAlarm(id);
    // Repeated activation must focus the same Alarm again.
    document.getElementById(alarmElementId(id))?.focus();
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card title={t('control.alarms')}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text strong>{t('control.filter-alarms')}</Typography.Text>
          <Space wrap align="start">
            <Filter label={t('control.alarm-priority')}>
              <Select
                ref={priorityFilter} data-testid={ids.alarmFilterPriority} aria-label={t('control.alarm-priority')}
                mode="multiple" allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} style={{ minWidth: 200 }}
                value={filters.priorities} options={Object.entries(alarmPriorityLabels).map(([value, key]) => ({ value, label: t(key) }))}
                onChange={priorities => filter({ ...filters, priorities })}
              />
            </Filter>
            <Filter label={t('control.alarm-state')}>
              <Select
                data-testid={ids.alarmFilterState} aria-label={t('control.alarm-state')}
                mode="multiple" allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} style={{ minWidth: 300 }}
                value={filters.states} options={Object.entries(alarmStateLabels).map(([value, key]) => ({ value, label: t(key) }))}
                onChange={states => filter({ ...filters, states })}
              />
            </Filter>
            <Filter label={t('scope.area')}>
              <Select
                data-testid={ids.alarmFilterArea} aria-label={t('scope.area')}
                allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} style={{ minWidth: 180 }} value={filters.areaId}
                options={dataset.areas.map(area => ({ value: area.id, label: tr(area.name) }))}
                onChange={areaId => filter({ ...filters, areaId })}
              />
            </Filter>
            <Filter label={t('scope.line')}>
              <Select
                data-testid={ids.alarmFilterLine} aria-label={t('scope.line')}
                allowClear={{ label: t('action.clear-filters') }} placeholder={t('common.all')} style={{ minWidth: 240 }} value={filters.lineId}
                options={dataset.lines.map(line => ({ value: line.id, label: `${line.id} · ${tr(line.name)}` }))}
                onChange={lineId => filter({ ...filters, lineId })}
              />
            </Filter>
          </Space>
          <Space>
            <Button data-testid={ids.acknowledge} type="primary" disabled={!selectedIds.length} onClick={acknowledge}>{t('action.alarm-acknowledge')}</Button>
            <Typography.Text>{tCount('common.selected-count', selectedIds.length)}</Typography.Text>
          </Space>
          {notice && <Alert key={acknowledgeAttempts} type={noticeType} showIcon title={t(notice)} />}
          <Table<AlarmRow>
            data-testid={ids.alarmList} rowKey="id" size="small" pagination={false}
            dataSource={alarms.rows}
            onRow={row => ({ id: alarmElementId(row.id), 'data-testid': ids.alarmRow, tabIndex: -1 })}
            rowSelection={{
              selectedRowKeys: selectedIds, onChange: keys => { setSelection(keys); setNotice(null); },
              getTitleCheckboxProps: () => ({ 'aria-label': t('control.select-all-alarms') }),
              getCheckboxProps: row => ({ 'data-testid': ids.alarmSelect, 'aria-label': t('control.select-alarm', { alarm: row.id }) }),
            }}
            locale={{ emptyText: <Empty data-testid={ids.alarmEmpty} description={t('control.alarm-empty')} /> }}
            columns={[
              { key: 'priority', title: t('control.alarm-priority'), render: (_, row) => t(alarmPriorityLabels[row.priority]) },
              { key: 'state', title: t('control.alarm-state'), render: (_, row) => t(alarmStateLabels[row.state]) },
              { key: 'line', title: t('scope.line'), dataIndex: 'lineId' },
              { key: 'machine', title: t('term.machine'), render: (_, row) => <Space><span>{row.machineId}</span>{tr(dataset.machines.find(machine => machine.id === row.machineId)!.name)}</Space> },
              { key: 'message', title: t('common.message'), render: (_, row) => tr(row.message) },
              { key: 'raised', title: t('control.alarm-raised'), render: (_, row) => formatDateTime(row.raisedAt) },
              { key: 'age', title: t('common.age'), render: (_, row) => formatDuration(row.ageSeconds) },
              { key: 'acknowledged', title: t('control.alarm-acknowledged-by'), render: (_, row) => dataset.users.find(user => user.id === row.acknowledgedBy)?.name ?? t('common.none') },
            ]}
          />
        </Space>
      </Card>
      <EventLog />
      <Diagnostics openAlarm={openAlarm} />
    </Space>
  );
}
