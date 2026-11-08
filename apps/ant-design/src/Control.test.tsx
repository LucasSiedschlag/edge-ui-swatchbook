// @vitest-environment happy-dom
import {
  TEST_IDS, alarmListView, alarmPriorityLabels, alarmStateLabels, connectivityView, en, eventActionLabels,
  eventLogView, eventTargetLabels, eventValueLabelKey, formatDateTime, formatDuration, formatNumber,
  formatPercentValue, generateMockDataset, linkStatusLabels, ptBR, rangeLabels, roleLabels, simulate, t, tr,
  type AlarmFilters, type ConnectivitySort, type EventFilters, type EventRow, type RangeId,
} from '@swatchbook/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { byId, click, endMotion, mountApp, one, openSelect, plantState } from './test-utils';

const ids = TEST_IDS.control;
const dataset = generateMockDataset();
let view: Awaited<ReturnType<typeof mountApp>> | undefined;
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(async () => { await view?.unmount(); view = undefined; history.replaceState(null, '', '/'); vi.restoreAllMocks(); });
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
  const option = [...dropdown.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(el => el.textContent === label || el.textContent?.includes(label));
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
function expectEvents(filters: EventFilters = { range: 'last-24h' }) {
  expect(rowKeys(ids.eventLog)).toEqual(eventLogView(plantState(), 0, filters).rows.map(row => row.id));
}
function eventValue(row: EventRow, value: EventRow['oldValue']) {
  const label = eventValueLabelKey(row.action, value);
  return value === null ? en['common.none'] : label ? t('en', label) : typeof value === 'number' ? formatNumber('en', value, { decimals: 2 }) : value;
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
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(true);
  for (const row of alarms) {
    const element = alarmRow(row.id);
    for (const value of [t('en', alarmPriorityLabels[row.priority]), t('en', alarmStateLabels[row.state]), row.lineId,
      row.machineId, tr('en', row.message), formatDateTime('en', row.raisedAt), formatDuration(row.ageSeconds)]) {
      expect(element.textContent).toContain(value);
    }
    expect(element.querySelector('input')?.getAttribute('aria-label')).toBe(t('en', 'control.select-alarm', { alarm: row.id }));
    if (row.acknowledgedBy) expect(element.textContent).toContain(dataset.users.find(user => user.id === row.acknowledgedBy)!.name);
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
  await select(ids.alarmFilterArea, en['area.extrusion']);
  expectAlarms({ areaId: 'extrusion' });
  await select(ids.alarmFilterLine, 'E1');
  expectAlarms({ areaId: 'extrusion', lineId: 'E1' });
  await select(ids.alarmFilterArea, en['area.assembly']);
  expectAlarms({ areaId: 'assembly', lineId: 'E1' });
  expect(text(ids.alarmEmpty)).toContain(en['control.alarm-empty']);
  await clear(ids.alarmFilterArea);
  expectAlarms({ lineId: 'E1' });
  await clear(ids.alarmFilterLine);
  expectAlarms();
});

it('shows the Alarm empty state on idle C1 and clears selection when filtering', async () => {
  await start();
  await selectAlarm(alarmListView(plantState(), 0).rows[0]!.id);
  expect((one(ids.acknowledge) as HTMLButtonElement).disabled).toBe(false);
  await select(ids.alarmFilterLine, 'C1');
  expect(byId(ids.alarmRow)).toHaveLength(0);
  expect(byId(ids.alarmEmpty)).toHaveLength(1);
  expect(text(ids.alarmEmpty)).toContain(en['control.alarm-empty']);
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
  await click(one(ids.acknowledge));
  expect(plantState()).toBe(state);
  expectEvents();
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
      eventValue(event, event.oldValue), eventValue(event, event.newValue),
      event.note === null ? en['common.none'] : typeof event.note === 'string' ? event.note : tr('en', event.note)];
    expect([...element.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(values);
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
  for (const column of Object.keys(labels) as ConnectivitySort['column'][]) {
    for (const direction of ['asc', 'desc'] as const) {
      await select(ids.diagnosticsSort, `${labels[column]} · ${en[direction === 'asc' ? 'common.sort-ascending' : 'common.sort-descending']}`);
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
  const offline = connectivityView(dataset, simulate(dataset, 0, plantState().overlay)).find(row => row.alarmId)!;
  await select(ids.alarmFilterLine, 'C1');
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
  expect(target.querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  expect(target.textContent).toContain(offline.machineId);
});

it('renders Portuguese labels, translated event values and empty states without fallback keys', async () => {
  view = await mountApp('#/control', { dataset, languages: ['pt-BR'] });
  expect(document.documentElement.lang).toBe('pt-BR');
  for (const label of ['control.alarms', 'control.filter-alarms', 'control.alarm-priority', 'control.alarm-state',
    'control.event-role', 'control.event-old-value', 'control.event-new-value', 'control.event-note',
    'control.diagnostics', 'control.diagnostics-sort', 'control.diagnostics-heartbeat'] as const) {
    expect(document.body.textContent).toContain(ptBR[label]);
  }
  const target = alarmListView(plantState(), 0).rows.find(row => row.state === 'active-unacknowledged')!;
  await selectAlarm(target.id);
  await click(one(ids.acknowledge));
  expect(tableRows(ids.eventLog)[0]!.textContent).toContain(ptBR['alarm-state.active-acknowledged']);
  await click(one(ids.acknowledge));
  expect(document.body.textContent).toContain(ptBR['control.already-acknowledged']);
  await select(ids.alarmFilterLine, 'C1');
  expect(text(ids.alarmEmpty)).toContain(ptBR['control.alarm-empty']);
  const user = dataset.users.find(user => user.role === 'operator')!;
  await select(ids.eventFilterUser, user.name);
  await select(ids.eventFilterType, ptBR['event-action.recipe-approve']);
  expect(text(ids.eventEmpty)).toContain(ptBR['control.event-empty']);
  expect(document.body.textContent).not.toContain('[[');
});
