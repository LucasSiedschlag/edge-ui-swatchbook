// @vitest-environment happy-dom
import {
  DIAGNOSTICS_DEFAULT_SORT, EVENT_LOG_DEFAULT_RANGE, TEST_IDS, alarmListView, alarmPriorityLabels, alarmStateLabels, connectivityView, en, eventActionLabels,
  eventLogView, eventTargetLabels, formatDateTime, formatDuration, formatNumber,
  formatPercentValue, generateMockDataset, linkStatusLabels, ptBR, rangeLabels, roleLabels, simulate, t, tr,
  type AlarmFilters, type ConnectivitySort, type EventFilters, type Locale, type MessageKey, type RangeId,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { controlCoverage } from '../../../packages/core/src/i18n/strings/control-coverage';
import { byId, click, endMotion, mountApp, one, openSelect, plantState } from './test-utils';

const ids = TEST_IDS.control;
const dataset = generateMockDataset();
let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(async () => { await view?.unmount(); view = undefined; history.replaceState(null, '', '/'); vi.useRealTimers(); vi.restoreAllMocks(); });
const start = async () => { view = await mountApp('#/control', { dataset }); };
const text = (id: string) => one(id).textContent ?? '';
const tableRows = (id: string) => [...one(id).querySelectorAll<HTMLElement>('tbody tr[data-row-key]')];
const rowKeys = (id: string) => tableRows(id).map(row => row.dataset.rowKey);
const alarmRow = (id: string) => [...byId(ids.alarmRow)].find(row => row.dataset.rowKey === id)!;
const selectAlarm = (id: string) => click(alarmRow(id).querySelector<HTMLInputElement>(`[data-testid="${ids.alarmSelect}"]`)!);
const key = (target: Element, value: string, extra: KeyboardEventInit = {}) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }));
});

async function select(id: string, label: string) {
  if (one(id).querySelector('input')?.getAttribute('aria-expanded') !== 'true') await openSelect(id);
  const dropdown = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown')].find(el => !el.classList.contains('ant-select-dropdown-hidden'))!;
  const option = [...dropdown.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(el => el.textContent === label);
  if (!option) throw new Error(`no option ${label}`);
  await click(option);
  await key(one(id).querySelector('input')!, 'Escape', { keyCode: 27 });
  await endMotion();
}
async function clear(id: string) {
  const button = one(id).querySelector('.ant-select-clear')!;
  await click(button);
  await endMotion();
}
function expectAlarms(filters: AlarmFilters = {}) {
  expect(rowKeys(ids.alarmList)).toEqual(alarmListView(plantState(), 0, filters).rows.map(row => row.id));
}
function expectEvents(filters: EventFilters = { range: EVENT_LOG_DEFAULT_RANGE }) {
  expect(rowKeys(ids.eventLog)).toEqual(eventLogView(plantState(), 0, filters).rows.map(row => row.id));
}

it('renders the required IDs, repeated Alarm row and selection IDs, and core content in order', async () => {
  await start();
  for (const id of [ids.alarmList, ids.alarmFilterPriority, ids.alarmFilterState, ids.alarmFilterArea, ids.alarmFilterLine,
    ids.acknowledge, ids.eventLog, ids.eventFilterUser, ids.eventFilterType, ids.eventFilterRange, ids.diagnostics, ids.diagnosticsSort]) {
    expect(byId(id), id).toHaveLength(1);
  }
  expect(byId('control.placeholder')).toHaveLength(0);
  expect(byId(ids.alarmEmpty)).toHaveLength(0);
  expect(byId(ids.eventEmpty)).toHaveLength(0);
  const alarms = alarmListView(plantState(), 0).rows;
  expect(byId(ids.alarmRow)).toHaveLength(alarms.length);
  expect(byId(ids.alarmSelect)).toHaveLength(alarms.length);
  expectAlarms();
  expectEvents();
  expect(text(ids.alarmFilterState)).toContain(en['control.alarm-state-open']);
  for (const id of [ids.alarmList, ids.eventLog]) {
    expect(one(id).querySelectorAll('table')).toHaveLength(1);
    expect(one(id).querySelector('table')?.style.tableLayout).not.toBe('fixed');
  }
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(true);
  for (const row of alarms) {
    const element = alarmRow(row.id);
    for (const value of [t('en', alarmPriorityLabels[row.priority]), t('en', alarmStateLabels[row.state]), row.lineId,
      row.machineId, tr('en', row.machineName), tr('en', row.message), formatDateTime('en', row.raisedAt), formatDuration(row.ageSeconds)]) {
      expect(element.textContent).toContain(value);
    }
    expect(element.querySelector('input')?.getAttribute('aria-label')).toBe(t('en', 'control.select-alarm', { alarm: row.id }));
    expect(element.textContent).toContain(row.acknowledgedByName ?? en['common.none']);
  }
});

it('filters Alarms by priority, state, Area and Line, combines filters, and clears them', async () => {
  await start();
  await select(ids.alarmFilterPriority, en['alarm-priority.high']);
  expectAlarms({ priorities: ['high'] });
  await select(ids.alarmFilterPriority, en['alarm-priority.medium']);
  expectAlarms({ priorities: ['high', 'medium'] });
  await select(ids.alarmFilterState, en['alarm-state.active-unacknowledged']);
  expectAlarms({ priorities: ['high', 'medium'], states: ['active-unacknowledged'] });
  await clear(ids.alarmFilterPriority);
  expectAlarms({ states: ['active-unacknowledged'] });
  await clear(ids.alarmFilterState);
  expect(text(ids.alarmFilterState)).toContain(en['control.alarm-state-open']);
  await select(ids.alarmFilterArea, en['area.extrusion']);
  expectAlarms({ areaId: 'extrusion' });
  await select(ids.alarmFilterLine, `E1 · ${tr('en', dataset.lines.find(line => line.id === 'E1')!.name)}`);
  expectAlarms({ areaId: 'extrusion', lineId: 'E1' });
  await select(ids.alarmFilterArea, en['area.assembly']);
  expectAlarms({ areaId: 'assembly', lineId: 'E1' });
  expect(text(ids.alarmEmpty)).toContain(en['control.alarm-empty-filtered']);
  await clear(ids.alarmFilterArea);
  expectAlarms({ lineId: 'E1' });
  await clear(ids.alarmFilterLine);
  expectAlarms();
});

it('shows the Alarm empty state on idle C1 and clears selection when filtering', async () => {
  await start();
  await selectAlarm(alarmListView(plantState(), 0).rows[0]!.id);
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(false);
  await select(ids.alarmFilterLine, `C1 · ${tr('en', dataset.lines.find(line => line.id === 'C1')!.name)}`);
  expect(byId(ids.alarmRow)).toHaveLength(0);
  expect(byId(ids.alarmEmpty)).toHaveLength(1);
  expect(text(ids.alarmEmpty)).toContain(en['control.alarm-empty-filtered']);
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(true);
});

it('acknowledges multiple Alarms by button, shows both transitions, and logs old to new values', async () => {
  await start();
  const rows = alarmListView(plantState(), 0).rows;
  const active = rows.find(row => row.state === 'active-unacknowledged')!;
  const returned = rows.find(row => row.state === 'returned-unacknowledged')!;
  await selectAlarm(active.id);
  await selectAlarm(returned.id);
  const before = plantState().events.length;
  await click(one(ids.acknowledge));
  expect(plantState().events).toHaveLength(before + 2);
  const changed = plantState().events.slice(before);
  expect(changed.map(event => event.target).sort()).toEqual([active.id, returned.id].sort());
  expect(changed.every(event => event.action === 'alarm-acknowledge')).toBe(true);
  expect(alarmRow(active.id).textContent).toContain(en['alarm-state.active-acknowledged']);
  expect(alarmRow(active.id).textContent).toContain(dataset.users.find(user => user.id === plantState().currentUserId)!.name);
  expect(alarmRow(returned.id)).toBeUndefined();
  expectEvents();
  expect(rowKeys(ids.eventLog).slice(0, 2)).toEqual([...changed].reverse().map(event => event.id));
  for (const element of tableRows(ids.eventLog).slice(0, 2)) {
    expect(element.textContent).toContain(en['event-action.alarm-acknowledge']);
    expect(element.textContent).toContain(en['event-target.alarm']);
  }
  const activeEvent = tableRows(ids.eventLog).find(row => row.textContent?.includes(active.id))!;
  expect(activeEvent.textContent!.indexOf(en['alarm-state.active-unacknowledged'])).toBeLessThan(activeEvent.textContent!.indexOf(en['alarm-state.active-acknowledged']));
  await select(ids.alarmFilterState, en['alarm-state.cleared']);
  expect(alarmRow(returned.id).textContent).toContain(en['alarm-state.cleared']);
});

it('uses the runtime a shortcut for multi-selection and lets core report repeated acknowledgements as no-ops', async () => {
  await start();
  const selected = alarmListView(plantState(), 0).rows.filter(row => row.state === 'active-unacknowledged').slice(0, 2);
  for (const row of selected) await selectAlarm(row.id);
  const before = plantState().events.length;
  await key(alarmRow(selected[0]!.id).querySelector('input')!, 'a');
  expect(plantState().events).toHaveLength(before + 2);
  for (const row of selected) expect(alarmRow(row.id).textContent).toContain(en['alarm-state.active-acknowledged']);
  const state = plantState();
  await key(one(ids.acknowledge), 'a');
  expect(plantState()).toBe(state);
  expect(plantState().events).toHaveLength(before + 2);
  expect(document.body.textContent).toContain(en['control.already-acknowledged']);
  const firstNotice = document.querySelector('[role="alert"]');
  await click(one(ids.acknowledge));
  expect(plantState()).toBe(state);
  expect(document.querySelector('[role="alert"]')).not.toBe(firstNotice);
  expect(document.body.textContent).toContain(en['control.already-acknowledged']);
  // Clear the notice through a selection change, then select an acknowledged Alarm again.
  for (const row of selected) await selectAlarm(row.id);
  expect(document.body.textContent).not.toContain(en['control.already-acknowledged']);
  await selectAlarm(selected[0]!.id);
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(false);
  await click(one(ids.acknowledge));
  expect(plantState().events).toHaveLength(before + 2);
  expect(document.body.textContent).toContain(en['control.already-acknowledged']);
  expectEvents();
});

it('adds exactly one event for a mixed acknowledged and unacknowledged selection', async () => {
  await start();
  const rows = alarmListView(plantState(), 0).rows;
  const acknowledged = rows.find(row => row.state === 'active-acknowledged')!;
  const unacknowledged = rows.find(row => row.state === 'active-unacknowledged')!;
  await selectAlarm(acknowledged.id);
  await selectAlarm(unacknowledged.id);
  const before = plantState().events.length;
  await click(one(ids.acknowledge));
  expect(plantState().events).toHaveLength(before + 1);
  expect(plantState().events.at(-1)).toMatchObject({ action: 'alarm-acknowledge', target: unacknowledged.id });
});

it('updates Alarm Age with the live clock and preserves selection across a tick', async () => {
  vi.useFakeTimers();
  let clock = 0;
  view = await mountApp('#/control', { dataset, search: '', now: () => clock });
  const target = alarmListView(plantState(), 0).rows.find(row => row.state === 'active-acknowledged')!;
  const age = () => alarmRow(target.id).querySelectorAll('td')[7]!.textContent;
  await selectAlarm(target.id);
  const before = age();
  expect(before).toBe(formatDuration(target.ageSeconds));
  clock = 60_000;
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  expect(age()).not.toBe(before);
  expect(age()).toBe(formatDuration(target.ageSeconds + 60));
  expect(alarmRow(target.id).querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(false);
});

it('keeps shortcuts inactive in text controls and dialogs, rejects repeats, and focuses filters with /', async () => {
  await start();
  const target = alarmListView(plantState(), 0).rows.find(row => row.canAcknowledge)!;
  await selectAlarm(target.id);
  const before = plantState();
  await key(one(ids.alarmFilterPriority).querySelector('input')!, 'a');
  await key(one(ids.acknowledge), 'a', { repeat: true });
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  dialog.append(button);
  document.body.append(dialog);
  await key(button, 'a');
  dialog.remove();
  expect(plantState()).toBe(before);
  await key(one(ids.acknowledge), '/');
  expect(document.activeElement).toBe(one(ids.alarmFilterPriority).querySelector('input'));
});

it('renders Event Log Users, Roles, action and target types, notes and old/new values newest first', async () => {
  await start();
  await select(ids.eventFilterRange, en['range.last-30d']);
  expectEvents({ range: 'last-30d' });
  const events = eventLogView(plantState(), 0, { range: 'last-30d' }).rows;
  for (const event of events) {
    const element = tableRows(ids.eventLog).find(row => row.dataset.rowKey === event.id)!;
    const values = [formatDateTime('en', event.at), event.userName, t('en', roleLabels[event.role]),
      t('en', eventActionLabels[event.action]), t('en', eventTargetLabels[event.targetKind]), event.target,
      event.note === null ? en['common.none'] : typeof event.note === 'string' ? event.note : tr('en', event.note)];
    const cells = [...element.querySelectorAll('td')].map(cell => cell.textContent);
    expect([...cells.slice(0, 6), cells[8]]).toEqual(values);
  }
  for (const [id, values] of [
    ['EV-0678', ['Active, unacknowledged', 'Active, acknowledged']],
    ['EV-0653', ['2.62', '2.47']],
  ] as const) {
    const element = tableRows(ids.eventLog).find(row => row.dataset.rowKey === id)!;
    expect([...element.querySelectorAll('td')].slice(6, 8).map(cell => cell.textContent)).toEqual(values);
  }
});

it('filters events by User, multiple action types, and all four standard ranges, with a no-match state', async () => {
  await start();
  for (const range of Object.keys(rangeLabels) as RangeId[]) {
    await select(ids.eventFilterRange, t('en', rangeLabels[range]));
    expectEvents({ range });
  }
  const user = dataset.users.find(user => user.role === 'operator')!;
  await select(ids.eventFilterUser, user.name);
  expectEvents({ userId: user.id, range: 'last-30d' });
  await select(ids.eventFilterType, en['event-action.pause']);
  expectEvents({ userId: user.id, actions: ['pause'], range: 'last-30d' });
  await select(ids.eventFilterType, en['event-action.resume']);
  expectEvents({ userId: user.id, actions: ['pause', 'resume'], range: 'last-30d' });
  await clear(ids.eventFilterType);
  await select(ids.eventFilterType, en['event-action.recipe-approve']);
  expectEvents({ userId: user.id, actions: ['recipe-approve'], range: 'last-30d' });
  expect(text(ids.eventEmpty)).toContain(en['control.event-empty']);
  expect(tableRows(ids.eventLog)).toHaveLength(0);
  await clear(ids.eventFilterUser);
  expectEvents({ actions: ['recipe-approve'], range: 'last-30d' });
  await clear(ids.eventFilterType);
  expectEvents({ range: 'last-30d' });
  expect(byId(ids.eventEmpty)).toHaveLength(0);
});

it('renders all diagnostics in default severity order with the core measurements', async () => {
  await start();
  const diagnostics = connectivityView(dataset, simulate(dataset, 0, plantState().overlay));
  expect(rowKeys(ids.diagnostics)).toEqual(diagnostics.map(row => row.machineId));
  expect(diagnostics[0]!.linkStatus).toBe('offline');
  expect(tableRows(ids.diagnostics)).toHaveLength(dataset.machines.length);
  for (const row of diagnostics) {
    const element = tableRows(ids.diagnostics).find(element => element.dataset.rowKey === row.machineId)!;
    expect([...element.querySelectorAll('td')].map(cell => cell.textContent)).toEqual([
      row.machineId, t('en', linkStatusLabels[row.linkStatus]), row.latencyMs === null ? en['common.none'] : formatNumber('en', row.latencyMs, { decimals: 1 }),
      formatPercentValue('en', row.packetLossPct), formatDateTime('en', row.lastSeenAt), formatNumber('en', row.errorCount),
    ]);
    expect(element.querySelector('button') !== null).toBe(row.alarmId !== null);
  }
});

it('uses core diagnostics sorts in both directions, including null latency last and Machine id ties', async () => {
  await start();
  const labels: Record<ConnectivitySort['column'], string> = {
    status: en['parameters.link-status'], latency: en['control.diagnostics-latency'],
    packetLoss: en['control.diagnostics-packet-loss'], machine: en['term.machine'],
  };
  const snapshot = simulate(dataset, 0, plantState().overlay);
  expect(one(ids.diagnosticsSort).hasAttribute('title')).toBe(false);
  expect(one(ids.diagnosticsSort).closest('.ant-space')!.textContent).toContain(en['common.sort']);
  for (const column of Object.keys(labels) as ConnectivitySort['column'][]) {
    for (const direction of ['asc', 'desc'] as const) {
      await select(ids.diagnosticsSort, `${labels[column]} · ${en[direction === 'asc' ? 'common.sort-ascending' : 'common.sort-descending']}`);
      expectDiagnosticsSort({ column, direction });
      const expected = connectivityView(dataset, snapshot, { column, direction });
      expect(rowKeys(ids.diagnostics)).toEqual(expected.map(row => row.machineId));
      if (column === 'latency') {
        expect(expected.at(-1)!.latencyMs).toBeNull();
        expect(tableRows(ids.diagnostics).at(-1)!.querySelectorAll('td')[2]!.textContent).toBe(en['common.none']);
      }
    }
  }
});

it('opens the Offline Machine Alarm by alarmId even when Alarm filters hide it', async () => {
  await start();
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
  const offline = connectivityView(dataset, simulate(dataset, 0, plantState().overlay)).find(row => row.alarmId)!;
  await select(ids.alarmFilterLine, `C1 · ${tr('en', dataset.lines.find(line => line.id === 'C1')!.name)}`);
  expect(byId(ids.alarmEmpty)).toHaveLength(1);
  const diagnostic = tableRows(ids.diagnostics).find(row => row.dataset.rowKey === offline.machineId)!;
  const link = diagnostic.querySelector('button')!;
  expect(link.title).toBe(en['control.open-machine-alarm']);
  await click(link);
  expect(location.hash).toBe('#/control');
  expectAlarms();
  expect(byId(ids.alarmEmpty)).toHaveLength(0);
  const target = alarmRow(offline.alarmId!);
  expect(document.activeElement).toBe(target);
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  expect(target.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
  expect(target.textContent).toContain(offline.machineId);
});

it('renders Portuguese labels, translated event values and empty states without fallback keys', async () => {
  view = await mountApp('#/control', { dataset, languages: ['pt-BR'] });
  expect(document.documentElement.lang).toBe('pt-BR');
  expect(one(ids.alarmList).querySelector('thead input')?.getAttribute('aria-label')).toBe(ptBR['control.select-all-alarms']);
  for (const label of ['control.alarms', 'control.filter-alarms', 'control.alarm-priority', 'control.alarm-state',
    'control.event-role', 'control.event-old-value', 'control.event-new-value', 'control.event-note',
    'control.diagnostics', 'common.sort', 'control.alarm-state-open', 'control.diagnostics-heartbeat'] as const) {
    expect(document.body.textContent).toContain(ptBR[label]);
  }
  const target = alarmListView(plantState(), 0).rows.find(row => row.state === 'active-unacknowledged')!;
  await selectAlarm(target.id);
  await click(one(ids.acknowledge));
  expect(tableRows(ids.eventLog)[0]!.textContent).toContain(ptBR['alarm-state.active-acknowledged']);
  await click(one(ids.acknowledge));
  expect(document.body.textContent).toContain(ptBR['control.already-acknowledged']);
  await select(ids.alarmFilterLine, `C1 · ${tr('pt-BR', dataset.lines.find(line => line.id === 'C1')!.name)}`);
  expect(text(ids.alarmEmpty)).toContain(ptBR['control.alarm-empty-filtered']);
  const user = dataset.users.find(user => user.role === 'operator')!;
  await select(ids.eventFilterUser, user.name);
  await select(ids.eventFilterType, ptBR['event-action.recipe-approve']);
  expect(text(ids.eventEmpty)).toContain(ptBR['control.event-empty']);
  expect(document.body.textContent).not.toContain('[[');
});

const diagnosticsLabels: Record<ConnectivitySort['column'], MessageKey> = {
  status: 'parameters.link-status', latency: 'control.diagnostics-latency',
  packetLoss: 'control.diagnostics-packet-loss', machine: 'term.machine',
};
const diagnosticsHeader = (column: ConnectivitySort['column']) =>
  [...one(ids.diagnostics).querySelectorAll<HTMLElement>('th')].find(header => header.textContent?.includes(en[diagnosticsLabels[column]]))!;
function expectDiagnosticsSort(sort: ConnectivitySort) {
  const active = one(ids.diagnostics).querySelectorAll('th[aria-sort]');
  expect(active).toHaveLength(1);
  expect(active[0]).toBe(diagnosticsHeader(sort.column));
  expect(active[0]!.getAttribute('aria-sort')).toBe(sort.direction === 'asc' ? 'ascending' : 'descending');
  expect(text(ids.diagnosticsSort)).toContain(`${en[diagnosticsLabels[sort.column]]} · ${en[sort.direction === 'asc' ? 'common.sort-ascending' : 'common.sort-descending']}`);
  const snapshot = simulate(dataset, 0, plantState().overlay);
  expect(rowKeys(ids.diagnostics)).toEqual(connectivityView(dataset, snapshot, sort).map(row => row.machineId));
}

it('keeps diagnostics headers and the Select in sync and resets the third header click to the default sort', async () => {
  await start();
  expectDiagnosticsSort(DIAGNOSTICS_DEFAULT_SORT);
  const headers = [...one(ids.diagnostics).querySelectorAll('th')];
  expect(headers.filter(header => header.classList.contains('ant-table-column-has-sorters'))).toHaveLength(4);
  for (const column of ['latency', 'packetLoss', 'machine', 'status'] as const) {
    // Start on another column so each header cycle begins ascending.
    await select(ids.diagnosticsSort, `${en[diagnosticsLabels[column === 'machine' ? 'latency' : 'machine']]} · ${en['common.sort-descending']}`);
    for (const direction of ['asc', 'desc'] as const) {
      await click(diagnosticsHeader(column));
      expectDiagnosticsSort({ column, direction });
      if (column === 'latency') expect(tableRows(ids.diagnostics).at(-1)!.querySelectorAll('td')[2]!.textContent).toBe(en['common.none']);
    }
    await click(diagnosticsHeader(column));
    expectDiagnosticsSort(DIAGNOSTICS_DEFAULT_SORT);
  }
  await select(ids.diagnosticsSort, `${en['control.diagnostics-latency']} · ${en['common.sort-ascending']}`);
  await click(diagnosticsHeader('latency'));
  expectDiagnosticsSort({ column: 'latency', direction: 'desc' });
});

it('preserves Alarm selection when following and repeating a diagnostics link, then acknowledges only that selection with a', async () => {
  await start();
  const offline = connectivityView(dataset, simulate(dataset, 0, plantState().overlay)).find(row => row.alarmId)!;
  const selected = alarmListView(plantState(), 0).rows.filter(row => row.canAcknowledge && row.id !== offline.alarmId).slice(0, 2);
  expect(selected).toHaveLength(2);
  for (const row of selected) await selectAlarm(row.id);
  const diagnostic = tableRows(ids.diagnostics).find(row => row.dataset.rowKey === offline.machineId)!;
  const link = diagnostic.querySelector('button')!;
  const checked = () => tableRows(ids.alarmList).filter(row => row.querySelector<HTMLInputElement>('input')!.checked).map(row => row.dataset.rowKey);
  const beforeSelection = checked();
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(() => { link.focus(); });
    await click(link);
    expect(checked()).toEqual(beforeSelection);
    expect(document.activeElement).toBe(alarmRow(offline.alarmId!));
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
  }
  const before = plantState().events.length;
  await key(document.activeElement!, 'a');
  expect(plantState().events.slice(before).map(event => event.target).sort()).toEqual(selected.map(row => row.id).sort());
  expect(alarmRow(offline.alarmId!).querySelector<HTMLInputElement>('input')!.checked).toBe(false);
});

it.each(['en', 'pt-BR'] as const)('uses filtered empty wording for Cleared only and restores the default state placeholder in %s', async locale => {
  view = await mountApp('#/control', { dataset: { ...dataset, alarms: dataset.alarms.filter(alarm => alarm.state !== 'cleared') }, languages: [locale] });
  expect(text(ids.alarmFilterState)).toContain(t(locale, 'control.alarm-state-open'));
  await select(ids.alarmFilterState, t(locale, 'alarm-state.cleared'));
  expectAlarms({ states: ['cleared'] });
  expect(text(ids.alarmEmpty)).toContain(t(locale, 'control.alarm-empty-filtered'));
  expect(text(ids.alarmEmpty)).not.toContain(t(locale, 'control.alarm-empty'));
  await clear(ids.alarmFilterState);
  expect(text(ids.alarmFilterState)).toContain(t(locale, 'control.alarm-state-open'));
});

it.each(['en', 'pt-BR'] as const)('renders every Control manifest key across its states in %s', async (locale: Locale) => {
  const keys = new Set<MessageKey>([...Object.values(controlCoverage.shows), ...Object.values(controlCoverage.actions), ...Object.values(controlCoverage.states)].flat());
  const seen = new Set<MessageKey>();
  const capture = () => {
    // Include accessible names for row selection and the diagnostics Select.
    const rendered = [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label]')].map(el => el.getAttribute('aria-label') ?? '')].join('\n');
    for (const message of keys) {
      const values = message === 'control.select-alarm'
        ? alarmListView(plantState(), 0).rows.map(row => t(locale, message, { alarm: row.id }))
        : [t(locale, message)];
      if (values.some(value => rendered.includes(value))) seen.add(message);
    }
  };
  view = await mountApp('#/control', { dataset, languages: [locale] });
  capture();
  // common.sort must appear as a visible label, independently of accessible names.
  expect(one(ids.diagnosticsSort).closest('.ant-space')!.querySelector('.ant-typography')!.textContent).toBe(t(locale, 'common.sort'));
  const acknowledged = alarmListView(plantState(), 0).rows.find(row => row.state === 'active-acknowledged')!;
  await selectAlarm(acknowledged.id);
  await click(one(ids.acknowledge));
  capture();
  await select(ids.alarmFilterLine, `C1 · ${tr(locale, dataset.lines.find(line => line.id === 'C1')!.name)}`);
  capture();
  await select(ids.eventFilterUser, dataset.users.find(user => user.role === 'operator')!.name);
  await select(ids.eventFilterType, t(locale, 'event-action.recipe-approve'));
  capture();
  await view.unmount();
  // A Mock Dataset without Machines, Tags, Alarms or events exercises the empty states.
  view = await mountApp('#/control', { dataset: { ...dataset, machines: [], tags: [], alarms: [], events: [] }, languages: [locale] });
  expect(text(ids.alarmEmpty)).toContain(t(locale, 'control.alarm-empty'));
  capture();
  expect([...keys].filter(message => !seen.has(message))).toEqual([]);
});
