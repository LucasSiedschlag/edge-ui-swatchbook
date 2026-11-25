import type { Locator, Page } from '@playwright/test';
import { TEST_IDS, alarmPriorityLabels, alarmStateLabels, areaLabels, eventActionLabels, rangeLabels } from '@swatchbook/core';
import { atMinWidth, byId, expect, noConsoleErrors, openScreen, popupOptions, test, text, type Locale } from './harness';
import { expectHeadersIntact, expectNoForeignLanguage, expectNoPageOverflow, expectTableFits } from './deck-control-helpers';

const ids = TEST_IDS.control;
type Priority = keyof typeof alarmPriorityLabels;
type AlarmState = keyof typeof alarmStateLabels;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (label: string) => new RegExp(`^${escape(label)}$`);

/** Opens a select, chooses one option and closes the popup again (multi selects stay open otherwise). */
async function choose(page: Page, id: string, label: string | RegExp): Promise<void> {
  const option = popupOptions(page).filter({ hasText: typeof label === 'string' ? exact(label) : label });
  // The popup animates and its list is virtual, so retry the open and click together until the option is hit.
  await expect(async () => {
    if (!(await popupOptions(page).first().isVisible())) await byId(page, id).click();
    await option.click({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await expect(popupOptions(page)).toHaveCount(0);
}

const alarmRows = (page: Page) => byId(page, ids.alarmRow);
/** The Alarm ids of the rows in display order, read from the accessible name of each row checkbox. */
const alarmIds = (page: Page) => byId(page, ids.alarmSelect).evaluateAll(boxes => boxes.map(box => /AL-\d+/.exec(box.getAttribute('aria-label') ?? '')?.[0] ?? '?'));
const rowOf = (page: Page, language: Locale, alarmId: string): Locator =>
  alarmRows(page).filter({ has: page.getByLabel(text(language, 'control.select-alarm', { alarm: alarmId }), { exact: true }) });
/** Cells of an Alarm row: 0 select, 1 Priority, 2 State, 3 Line, 4 Machine, 5 Message, 6 Raised, 7 Age, 8 Acknowledged by. */
const alarmCell = (page: Page, language: Locale, alarmId: string, column: number) => rowOf(page, language, alarmId).locator('td').nth(column);
const select = (page: Page, language: Locale, alarmId: string) => page.getByLabel(text(language, 'control.select-alarm', { alarm: alarmId }), { exact: true }).check();
const rowCountText = (language: Locale, count: number) => text(language, count === 1 ? 'common.row-count.one' : 'common.row-count.other', { count });
const eventRows = (page: Page) => byId(page, ids.eventLog).locator('tbody tr:not([aria-hidden="true"])');
/** Cells of an Event Log row: 0 Time, 1 User, 2 Role, 3 Action, 4 Target type, 5 Target, 6 Old value, 7 New value, 8 Note. */
const eventCell = (page: Page, row: number, column: number) => eventRows(page).nth(row).locator('td').nth(column);
const machineIds = (page: Page) => byId(page, ids.diagnostics).locator('tbody tr:not([aria-hidden="true"]) td:first-child').allInnerTexts().then(items => items.map(item => item.trim()));

// Seeded Mock Dataset at tick 0 (the Screen opens with ?tick=0). The literals below were read once from the core views
// (alarmListView, eventLogView, connectivityView on generateMockDataset() with createPlantState and tick 0) and written down here.
// Open Alarms (default view, cleared hidden), in display order: priority, then raised time, then id.
const DEFAULT_ALARMS = ['AL-0160', 'AL-0156', 'AL-0157', 'AL-0159', 'AL-0153', 'AL-0154', 'AL-0158', 'AL-0151', 'AL-0152', 'AL-0155'];
const DEFAULT_PRIORITIES: Priority[] = ['critical', 'high', 'high', 'high', 'medium', 'medium', 'medium', 'low', 'low', 'low'];
// Seeded states: unacknowledged AL-0160 AL-0159 AL-0158 AL-0155; acknowledged AL-0157 AL-0153 AL-0152; returned unacknowledged AL-0156 AL-0154 AL-0151.

interface AlarmCase { name: string; priorities?: Priority[]; states?: AlarmState[]; area?: keyof typeof areaLabels; line?: string; expected?: string[]; count?: number }
const ALARM_CASES: AlarmCase[] = [
  { name: 'Priority Critical', priorities: ['critical'], expected: ['AL-0160'] },
  { name: 'Priority High', priorities: ['high'], expected: ['AL-0156', 'AL-0157', 'AL-0159'] },
  { name: 'Priority Medium', priorities: ['medium'], expected: ['AL-0153', 'AL-0154', 'AL-0158'] },
  { name: 'Priority Low', priorities: ['low'], expected: ['AL-0151', 'AL-0152', 'AL-0155'] },
  { name: 'Priority Critical and Low', priorities: ['critical', 'low'], expected: ['AL-0160', 'AL-0151', 'AL-0152', 'AL-0155'] },
  { name: 'State Active unacknowledged', states: ['active-unacknowledged'], expected: ['AL-0160', 'AL-0159', 'AL-0158', 'AL-0155'] },
  { name: 'State Active acknowledged', states: ['active-acknowledged'], expected: ['AL-0157', 'AL-0153', 'AL-0152'] },
  { name: 'State Returned unacknowledged', states: ['returned-unacknowledged'], expected: ['AL-0156', 'AL-0154', 'AL-0151'] },
  { name: 'Area Extrusion', area: 'extrusion', expected: ['AL-0160', 'AL-0157', 'AL-0153', 'AL-0155'] },
  { name: 'Area Assembly', area: 'assembly', expected: ['AL-0156', 'AL-0159', 'AL-0154', 'AL-0158', 'AL-0152'] },
  { name: 'Area Metalworking', area: 'metalworking', expected: ['AL-0151'] },
  { name: 'Line E1', line: 'E1', expected: ['AL-0160', 'AL-0153'] },
  { name: 'Line A2', line: 'A2', expected: ['AL-0156', 'AL-0159', 'AL-0154'] },
  { name: 'Line RF1', line: 'RF1', expected: ['AL-0151'] },
  { name: 'Priority High and Area Extrusion', priorities: ['high'], area: 'extrusion', expected: ['AL-0157'] },
  { name: 'State Returned unacknowledged and Area Assembly', states: ['returned-unacknowledged'], area: 'assembly', expected: ['AL-0156', 'AL-0154'] },
  { name: 'Priority High, State Active unacknowledged and Line A2', priorities: ['high'], states: ['active-unacknowledged'], line: 'A2', expected: ['AL-0159'] },
  { name: 'Line P1 has no open Alarm', line: 'P1', expected: [] },
  { name: 'Area Extrusion and Line A1 do not intersect', area: 'extrusion', line: 'A1', expected: [] },
  { name: 'State Cleared only', states: ['cleared'], count: 150 },
  { name: 'Cleared and Priority Critical', states: ['cleared'], priorities: ['critical'], count: 2 },
  { name: 'Cleared and Line P1', states: ['cleared'], line: 'P1', count: 5 },
  { name: 'Cleared, Area Metalworking and Priority High', states: ['cleared'], area: 'metalworking', priorities: ['high'], count: 12 },
];

// Event Log in the default range (Last 24 hours) holds 19 entries; Last shift 6, Last 7 days 51, Last 30 days 177.
interface EventCase { name: string; range?: keyof typeof rangeLabels; user?: string; actions?: (keyof typeof eventActionLabels)[]; count: number }
const EVENT_CASES: EventCase[] = [
  { name: 'default range is Last 24 hours', count: 19 },
  { name: 'range Last shift', range: 'last-shift', count: 6 },
  { name: 'range Last 7 days', range: 'last-7d', count: 51 },
  { name: 'range Last 30 days', range: 'last-30d', count: 177 },
  { name: 'user Juliana Kowalski', user: 'Juliana Kowalski', count: 7 },
  { name: 'action Pause', actions: ['pause'], count: 7 },
  { name: 'actions Pause and Resume', actions: ['pause', 'resume'], count: 14 },
  { name: 'action Alarm acknowledged', actions: ['alarm-acknowledge'], count: 3 },
  { name: 'user Juliana Kowalski and action Pause', user: 'Juliana Kowalski', actions: ['pause'], count: 3 },
  { name: 'user Juliana Kowalski, action Pause, range Last shift', user: 'Juliana Kowalski', actions: ['pause'], range: 'last-shift', count: 0 },
  { name: 'user Marina Krüger and action Shift handover has no entry', user: 'Marina Krüger', actions: ['shift-handover'], count: 0 },
  { name: 'user Camila Machado has no entry in 24 hours', user: 'Camila Machado', count: 0 },
  { name: 'action Setpoint override has none in 24 hours', actions: ['setpoint-override'], count: 0 },
  { name: 'action Setpoint override in Last 7 days', actions: ['setpoint-override'], range: 'last-7d', count: 4 },
];

const DIAGNOSTICS_ORDER: Record<string, string[]> = {
  'status-asc': ['A2-reinforcement-insert', 'A2-corner-weld', 'C1-cnc', 'A1-cleaning', 'A1-corner-weld', 'A1-cutting', 'A1-hardware-fit', 'A1-reinforcement-insert', 'A1-vision-check', 'A2-cleaning', 'A2-cutting', 'A2-hardware-fit', 'A2-vision-check', 'E1-calibrator', 'E1-cooling-tank', 'E1-extruder', 'E1-puller', 'E1-saw', 'E2-calibrator', 'E2-cooling-tank', 'E2-extruder', 'E2-puller', 'E2-saw', 'P1-stamping-press', 'RF1-cut-off', 'RF1-roll-former', 'RF1-uncoiler'],
  'status-desc': ['A1-cleaning', 'A1-corner-weld', 'A1-cutting', 'A1-hardware-fit', 'A1-reinforcement-insert', 'A1-vision-check', 'A2-cleaning', 'A2-cutting', 'A2-hardware-fit', 'A2-vision-check', 'E1-calibrator', 'E1-cooling-tank', 'E1-extruder', 'E1-puller', 'E1-saw', 'E2-calibrator', 'E2-cooling-tank', 'E2-extruder', 'E2-puller', 'E2-saw', 'P1-stamping-press', 'RF1-cut-off', 'RF1-roll-former', 'RF1-uncoiler', 'A2-corner-weld', 'C1-cnc', 'A2-reinforcement-insert'],
  'latency-asc': ['E2-extruder', 'A2-cleaning', 'E1-calibrator', 'E2-calibrator', 'RF1-uncoiler', 'A2-hardware-fit', 'A2-vision-check', 'E2-saw', 'RF1-cut-off', 'P1-stamping-press', 'RF1-roll-former', 'E1-saw', 'A1-hardware-fit', 'A1-cutting', 'A2-cutting', 'E1-extruder', 'E1-puller', 'A1-reinforcement-insert', 'A1-vision-check', 'A1-cleaning', 'E1-cooling-tank', 'E2-cooling-tank', 'A1-corner-weld', 'E2-puller', 'C1-cnc', 'A2-corner-weld', 'A2-reinforcement-insert'],
  'latency-desc': ['A2-corner-weld', 'C1-cnc', 'A1-corner-weld', 'E2-puller', 'E2-cooling-tank', 'A1-cleaning', 'E1-cooling-tank', 'A1-reinforcement-insert', 'A1-vision-check', 'A1-cutting', 'A2-cutting', 'E1-extruder', 'E1-puller', 'A1-hardware-fit', 'E1-saw', 'RF1-roll-former', 'P1-stamping-press', 'A2-hardware-fit', 'A2-vision-check', 'E2-saw', 'RF1-cut-off', 'A2-cleaning', 'E1-calibrator', 'E2-calibrator', 'RF1-uncoiler', 'E2-extruder', 'A2-reinforcement-insert'],
  'packetLoss-asc': ['A1-hardware-fit', 'RF1-cut-off', 'E2-puller', 'E2-cooling-tank', 'A1-cutting', 'RF1-uncoiler', 'E1-calibrator', 'A1-vision-check', 'E1-puller', 'A2-cleaning', 'E1-saw', 'A2-hardware-fit', 'A1-corner-weld', 'E2-saw', 'E2-calibrator', 'A1-reinforcement-insert', 'E1-cooling-tank', 'E1-extruder', 'RF1-roll-former', 'A1-cleaning', 'E2-extruder', 'A2-vision-check', 'P1-stamping-press', 'A2-cutting', 'C1-cnc', 'A2-corner-weld', 'A2-reinforcement-insert'],
  'packetLoss-desc': ['A2-reinforcement-insert', 'A2-corner-weld', 'C1-cnc', 'A2-cutting', 'P1-stamping-press', 'A2-vision-check', 'E2-extruder', 'A1-cleaning', 'E1-extruder', 'RF1-roll-former', 'E1-cooling-tank', 'A1-reinforcement-insert', 'E2-calibrator', 'A1-corner-weld', 'E2-saw', 'A2-hardware-fit', 'A2-cleaning', 'E1-saw', 'E1-puller', 'A1-vision-check', 'E1-calibrator', 'A1-cutting', 'RF1-uncoiler', 'E2-cooling-tank', 'E2-puller', 'A1-hardware-fit', 'RF1-cut-off'],
  'machine-asc': ['A1-cleaning', 'A1-corner-weld', 'A1-cutting', 'A1-hardware-fit', 'A1-reinforcement-insert', 'A1-vision-check', 'A2-cleaning', 'A2-corner-weld', 'A2-cutting', 'A2-hardware-fit', 'A2-reinforcement-insert', 'A2-vision-check', 'C1-cnc', 'E1-calibrator', 'E1-cooling-tank', 'E1-extruder', 'E1-puller', 'E1-saw', 'E2-calibrator', 'E2-cooling-tank', 'E2-extruder', 'E2-puller', 'E2-saw', 'P1-stamping-press', 'RF1-cut-off', 'RF1-roll-former', 'RF1-uncoiler'],
  'machine-desc': ['RF1-uncoiler', 'RF1-roll-former', 'RF1-cut-off', 'P1-stamping-press', 'E2-saw', 'E2-puller', 'E2-extruder', 'E2-cooling-tank', 'E2-calibrator', 'E1-saw', 'E1-puller', 'E1-extruder', 'E1-cooling-tank', 'E1-calibrator', 'C1-cnc', 'A2-vision-check', 'A2-reinforcement-insert', 'A2-hardware-fit', 'A2-cutting', 'A2-corner-weld', 'A2-cleaning', 'A1-vision-check', 'A1-reinforcement-insert', 'A1-hardware-fit', 'A1-cutting', 'A1-corner-weld', 'A1-cleaning'],
};
const SORT_COLUMN_KEYS = { status: 'parameters.link-status', latency: 'control.diagnostics-latency', packetLoss: 'control.diagnostics-packet-loss', machine: 'term.machine' } as const;
const OFFLINE_MACHINE = 'A2-reinforcement-insert';
const OFFLINE_ALARM = 'AL-0159';

const sortLabel = (language: Locale, column: keyof typeof SORT_COLUMN_KEYS, direction: 'asc' | 'desc') =>
  `${text(language, SORT_COLUMN_KEYS[column])} · ${text(language, direction === 'asc' ? 'common.sort-ascending' : 'common.sort-descending')}`;

test.describe('Control Room Command', () => {
  test('has every required test id', async ({ page }) => {
    await openScreen(page, 'control');
    for (const id of [ids.alarmList, ids.alarmFilterPriority, ids.alarmFilterState, ids.alarmFilterArea, ids.alarmFilterLine, ids.acknowledge, ids.eventLog, ids.eventFilterUser, ids.eventFilterType, ids.eventFilterRange, ids.diagnostics, ids.diagnosticsSort]) {
      await expect(byId(page, id), id).toHaveCount(1);
    }
    await expect(alarmRows(page)).toHaveCount(10);
    await expect(byId(page, ids.alarmSelect)).toHaveCount(10);
    // Empty states appear only when empty.
    await expect(byId(page, ids.alarmEmpty)).toHaveCount(0);
    await expect(byId(page, ids.eventEmpty)).toHaveCount(0);
    await choose(page, ids.alarmFilterLine, /^P1/);
    await expect(byId(page, ids.alarmEmpty)).toHaveCount(1);
    await choose(page, ids.eventFilterUser, 'Camila Machado');
    await expect(byId(page, ids.eventEmpty)).toHaveCount(1);
  });

  test('sorts the Alarm list by priority, then raised time, and hides cleared Alarms by default', async ({ page, language }) => {
    await openScreen(page, 'control');
    await expect.poll(() => alarmIds(page)).toEqual(DEFAULT_ALARMS);
    for (const [index, priority] of DEFAULT_PRIORITIES.entries()) await expect(alarmCell(page, language, DEFAULT_ALARMS[index]!, 1)).toHaveText(text(language, alarmPriorityLabels[priority]));
    await expect(byId(page, ids.alarmFilterState)).toContainText(text(language, 'control.alarm-state-open'));
    // Each row carries Line, Machine, message, raised time and age (AL-0160: E1 extruder, raised 6 min before tick 0).
    const first = rowOf(page, language, 'AL-0160');
    await expect(first).toContainText('E1');
    await expect(first).toContainText('E1-extruder');
    await expect(first).toContainText(text(language, 'machine.extruder'));
    await expect(first).toContainText(/6\s?min/);
    for (const header of ['control.alarm-priority', 'control.alarm-state', 'scope.line', 'term.machine', 'common.message', 'control.alarm-raised', 'common.age'] as const) {
      await expect(byId(page, ids.alarmList).locator('th', { hasText: text(language, header) }).first()).toBeVisible();
    }
  });

  for (const c of ALARM_CASES) {
    test(`filters Alarms: ${c.name}`, async ({ page, language }) => {
      await openScreen(page, 'control');
      for (const priority of c.priorities ?? []) await choose(page, ids.alarmFilterPriority, text(language, alarmPriorityLabels[priority]));
      for (const state of c.states ?? []) await choose(page, ids.alarmFilterState, text(language, alarmStateLabels[state]));
      if (c.area) await choose(page, ids.alarmFilterArea, text(language, areaLabels[c.area]));
      if (c.line) await choose(page, ids.alarmFilterLine, new RegExp(`^${c.line} ·`));
      if (c.expected) {
        await expect.poll(() => alarmIds(page)).toEqual(c.expected);
        if (c.expected.length === 0) await expect(byId(page, ids.alarmEmpty)).toContainText(text(language, 'control.alarm-empty-filtered'));
        else await expect(byId(page, ids.alarmEmpty)).toHaveCount(0);
      } else {
        await expect(alarmRows(page)).toHaveCount(c.count!);
      }
    });
  }

  test('keeps the priority order inside a filtered list and re-applies it when a filter is removed', async ({ page, language }) => {
    await openScreen(page, 'control');
    await choose(page, ids.alarmFilterArea, text(language, areaLabels.assembly));
    await expect.poll(() => alarmIds(page)).toEqual(['AL-0156', 'AL-0159', 'AL-0154', 'AL-0158', 'AL-0152']);
    await byId(page, ids.alarmFilterArea).hover();
    await byId(page, ids.alarmFilterArea).getByRole('button', { name: text(language, 'action.clear-filters') }).click();
    await expect.poll(() => alarmIds(page)).toEqual(DEFAULT_ALARMS);
  });

  test('acknowledges one Alarm with the button and logs it with the old and new value', async ({ page, language }) => {
    await openScreen(page, 'control');
    await expect(byId(page, ids.acknowledge)).toBeDisabled();
    await select(page, language, 'AL-0160');
    await expect(page.getByText(text(language, 'common.selected-count.one', { count: 1 }), { exact: true })).toBeVisible();
    await expect(byId(page, ids.acknowledge)).toBeEnabled();
    await expect(byId(page, ids.acknowledge)).toHaveText(text(language, 'action.alarm-acknowledge'));
    await expect(page.getByText(rowCountText(language, 19), { exact: true })).toBeVisible();
    await byId(page, ids.acknowledge).click();
    await expect(alarmCell(page, language, 'AL-0160', 2)).toHaveText(text(language, alarmStateLabels['active-acknowledged']));
    await expect(alarmCell(page, language, 'AL-0160', 8)).not.toHaveText(text(language, 'common.none'));
    // The other Alarms did not change.
    await expect(alarmCell(page, language, 'AL-0159', 2)).toHaveText(text(language, alarmStateLabels['active-unacknowledged']));
    await expect(alarmRows(page)).toHaveCount(10);
    // The Event Log gets one newest entry with the old and new value.
    await expect(page.getByText(rowCountText(language, 20), { exact: true })).toBeVisible();
    await expect(eventCell(page, 0, 3)).toHaveText(text(language, eventActionLabels['alarm-acknowledge']));
    await expect(eventCell(page, 0, 5)).toHaveText('AL-0160');
    await expect(eventCell(page, 0, 6)).toHaveText(text(language, alarmStateLabels['active-unacknowledged']));
    await expect(eventCell(page, 0, 7)).toHaveText(text(language, alarmStateLabels['active-acknowledged']));
    await expect(eventCell(page, 1, 5)).toHaveText('AL-0157');
  });

  test('acknowledges several Alarms with the a shortcut: active ones stay as acknowledged, returned ones become cleared', async ({ page, language }) => {
    await openScreen(page, 'control');
    for (const alarm of ['AL-0159', 'AL-0158', 'AL-0156']) await select(page, language, alarm);
    await expect(page.getByText(text(language, 'common.selected-count.other', { count: 3 }), { exact: true })).toBeVisible();
    await page.keyboard.press('a');
    await expect(alarmCell(page, language, 'AL-0159', 2)).toHaveText(text(language, alarmStateLabels['active-acknowledged']));
    await expect(alarmCell(page, language, 'AL-0158', 2)).toHaveText(text(language, alarmStateLabels['active-acknowledged']));
    // AL-0156 was Returned to normal, unacknowledged: it becomes Cleared and leaves the default list.
    await expect(rowOf(page, language, 'AL-0156')).toHaveCount(0);
    await expect.poll(() => alarmIds(page)).toEqual(DEFAULT_ALARMS.filter(alarm => alarm !== 'AL-0156'));
    // Three entries logged, newest first, one per Alarm.
    await expect(page.getByText(rowCountText(language, 22), { exact: true })).toBeVisible();
    const targets = [0, 1, 2].map(row => eventCell(page, row, 5));
    await expect(targets[0]!).toHaveText(/AL-015[689]/);
    const logged = await Promise.all(targets.map(cell => cell.innerText()));
    expect([...logged].sort()).toEqual(['AL-0156', 'AL-0158', 'AL-0159']);
    const cleared = eventRows(page).filter({ hasText: 'AL-0156' });
    await expect(cleared.locator('td').nth(6)).toHaveText(text(language, alarmStateLabels['returned-unacknowledged']));
    await expect(cleared.locator('td').nth(7)).toHaveText(text(language, alarmStateLabels.cleared));
    await expect(cleared.locator('td').nth(3)).toHaveText(text(language, eventActionLabels['alarm-acknowledge']));
    // The cleared Alarm is still reachable with the Cleared state filter.
    await choose(page, ids.alarmFilterState, text(language, alarmStateLabels.cleared));
    await expect(rowOf(page, language, 'AL-0156')).toHaveCount(1);
    await expect(alarmCell(page, language, 'AL-0156', 2)).toHaveText(text(language, alarmStateLabels.cleared));
  });

  test('acknowledging an already acknowledged Alarm changes nothing and logs nothing', async ({ page, language }) => {
    await openScreen(page, 'control');
    await select(page, language, 'AL-0157');
    await byId(page, ids.acknowledge).click();
    await expect(page.getByRole('alert').filter({ hasText: text(language, 'control.already-acknowledged') })).toBeVisible();
    await expect(alarmCell(page, language, 'AL-0157', 2)).toHaveText(text(language, alarmStateLabels['active-acknowledged']));
    await expect(page.getByText(rowCountText(language, 19), { exact: true })).toBeVisible();
    await expect(eventCell(page, 0, 5)).toHaveText('AL-0157');
    // The same through the shortcut, after a real acknowledge: the second attempt is the no-op.
    await select(page, language, 'AL-0160');
    await page.keyboard.press('a');
    await expect(page.getByText(rowCountText(language, 20), { exact: true })).toBeVisible();
    await page.keyboard.press('a');
    await expect(page.getByRole('alert').filter({ hasText: text(language, 'control.already-acknowledged') })).toBeVisible();
    await expect(page.getByText(rowCountText(language, 20), { exact: true })).toBeVisible();
  });

  test('the a shortcut does nothing without a selection and is ignored while typing in a field', async ({ page, language }) => {
    await openScreen(page, 'control');
    await page.keyboard.press('a');
    await expect(page.getByText(rowCountText(language, 19), { exact: true })).toBeVisible();
    await expect(alarmCell(page, language, 'AL-0160', 2)).toHaveText(text(language, alarmStateLabels['active-unacknowledged']));
    await select(page, language, 'AL-0160');
    await byId(page, ids.eventFilterUser).click();
    await page.keyboard.type('a');
    await expect(alarmCell(page, language, 'AL-0160', 2)).toHaveText(text(language, alarmStateLabels['active-unacknowledged']));
    await expect(page.getByText(rowCountText(language, 19), { exact: true })).toBeVisible();
  });

  test('the Event Log is newest first and shows time, User, Role, action, target and values', async ({ page, language }) => {
    await openScreen(page, 'control');
    await expect(page.getByText(rowCountText(language, 19), { exact: true })).toBeVisible();
    // Seeded newest entries: three acknowledgements, then Resume and Pause of E1 by Marina Krüger.
    const expected: [string, string, string, string, string][] = [
      ['Lucas Becker', 'alarm-acknowledge', 'AL-0157', 'active-unacknowledged', 'active-acknowledged'],
      ['Larissa Hoffmann', 'alarm-acknowledge', 'AL-0153', 'active-unacknowledged', 'active-acknowledged'],
      ['Juliana Kowalski', 'alarm-acknowledge', 'AL-0152', 'active-unacknowledged', 'active-acknowledged'],
    ];
    for (const [row, [user, action, target, oldValue, newValue]] of expected.entries()) {
      await expect(eventCell(page, row, 1)).toHaveText(user);
      await expect(eventCell(page, row, 3)).toHaveText(text(language, eventActionLabels[action as keyof typeof eventActionLabels]));
      await expect(eventCell(page, row, 5)).toHaveText(target);
      await expect(eventCell(page, row, 6)).toHaveText(text(language, alarmStateLabels[oldValue as AlarmState]));
      await expect(eventCell(page, row, 7)).toHaveText(text(language, alarmStateLabels[newValue as AlarmState]));
    }
    await expect(eventCell(page, 3, 1)).toHaveText('Marina Krüger');
    await expect(eventCell(page, 3, 3)).toHaveText(text(language, eventActionLabels.resume));
    await expect(eventCell(page, 3, 5)).toHaveText('E1');
    await expect(eventCell(page, 3, 6)).toHaveText(text(language, 'common.none'));
    await expect(eventCell(page, 4, 3)).toHaveText(text(language, eventActionLabels.pause));
    await expect(eventCell(page, 2, 2)).toHaveText(text(language, 'role.operator'));
    await expect(eventCell(page, 1, 2)).toHaveText(text(language, 'role.engineer'));
  });

  for (const c of EVENT_CASES) {
    test(`filters the Event Log: ${c.name}`, async ({ page, language }) => {
      await openScreen(page, 'control');
      if (c.range) await choose(page, ids.eventFilterRange, text(language, rangeLabels[c.range]));
      if (c.user) await choose(page, ids.eventFilterUser, c.user);
      for (const action of c.actions ?? []) await choose(page, ids.eventFilterType, text(language, eventActionLabels[action]));
      await expect(page.getByText(rowCountText(language, c.count), { exact: true })).toBeVisible();
      if (c.count === 0) {
        await expect(byId(page, ids.eventEmpty)).toContainText(text(language, 'control.event-empty'));
      } else {
        await expect(byId(page, ids.eventEmpty)).toHaveCount(0);
        await expect(eventRows(page)).toHaveCount(c.count);
      }
      if (c.user) for (const user of await eventRows(page).locator('td:nth-child(2)').allInnerTexts()) expect(user).toBe(c.user);
    });
  }

  test('the Event Log range help explains Last shift and the rolling ranges', async ({ page, language }) => {
    await openScreen(page, 'control');
    await expect(byId(page, ids.eventFilterRange)).toContainText(text(language, rangeLabels['last-24h']));
    await expect(page.getByText(text(language, 'control.event-range-help'), { exact: true })).toBeVisible();
  });

  test('diagnostics default to severity then Machine id, with the Offline Machine first', async ({ page, language }) => {
    await openScreen(page, 'control');
    await expect.poll(() => machineIds(page)).toEqual(DIAGNOSTICS_ORDER['status-asc']);
    const first = byId(page, ids.diagnostics).locator('tbody tr:not([aria-hidden="true"])').first();
    await expect(first).toContainText(text(language, 'link-status.offline'));
    await expect(first.locator('td').nth(2)).toHaveText(text(language, 'common.none'));
    await expect(byId(page, ids.diagnosticsSort)).toContainText(sortLabel(language, 'status', 'asc'));
    // Seeded Degraded: A2-corner-weld (271 ms) and C1-cnc (153 ms) follow the Offline Machine.
    await expect(byId(page, ids.diagnostics).locator('tbody tr:not([aria-hidden="true"])').nth(1)).toContainText(text(language, 'link-status.degraded'));
    await expect(byId(page, ids.diagnostics).locator('tbody tr:not([aria-hidden="true"])').nth(2)).toContainText(text(language, 'link-status.degraded'));
    await expect(byId(page, ids.diagnostics).locator('tbody tr:not([aria-hidden="true"])').nth(3)).toContainText(text(language, 'link-status.online'));
    for (const header of ['term.machine', 'parameters.link-status', 'control.diagnostics-latency', 'control.diagnostics-packet-loss', 'control.diagnostics-heartbeat', 'control.diagnostics-error-count'] as const) {
      await expect(byId(page, ids.diagnostics).locator('th', { hasText: text(language, header) }).first()).toBeVisible();
    }
  });

  for (const [key, expected] of Object.entries(DIAGNOSTICS_ORDER)) {
    test(`diagnostics sort ${key}: null latency last in both directions, ties by Machine id`, async ({ page, language }) => {
      await openScreen(page, 'control');
      const [column, direction] = key.split('-') as [keyof typeof SORT_COLUMN_KEYS, 'asc' | 'desc'];
      await choose(page, ids.diagnosticsSort, sortLabel(language, column, direction));
      await expect(byId(page, ids.diagnosticsSort)).toContainText(sortLabel(language, column, direction));
      await expect.poll(() => machineIds(page)).toEqual(expected);
      // The Offline Machine has no latency measurement (shown as none): it is last for both latency directions.
      if (column === 'latency') expect((await machineIds(page)).at(-1)).toBe(OFFLINE_MACHINE);
    });
  }

  test('clicking a sortable column header sorts the diagnostics too, and the sort select follows', async ({ page, language }) => {
    await openScreen(page, 'control');
    const header = byId(page, ids.diagnostics).getByRole('columnheader', { name: new RegExp(`^${escape(text(language, 'control.diagnostics-latency'))}`) });
    await header.click();
    await expect.poll(() => machineIds(page)).toEqual(DIAGNOSTICS_ORDER['latency-asc']);
    await expect(byId(page, ids.diagnosticsSort)).toContainText(sortLabel(language, 'latency', 'asc'));
    await header.click();
    await expect.poll(() => machineIds(page)).toEqual(DIAGNOSTICS_ORDER['latency-desc']);
    await expect(byId(page, ids.diagnosticsSort)).toContainText(sortLabel(language, 'latency', 'desc'));
  });

  test('only the Offline Machine links to its Alarm, and opening the link clears the filters and focuses the Alarm row without changing the selection', async ({ page, language }) => {
    await openScreen(page, 'control');
    const links = byId(page, ids.diagnostics).getByRole('button', { name: new RegExp(escape(text(language, 'control.open-machine-alarm'))) });
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText(OFFLINE_MACHINE);
    await expect(links).toHaveAccessibleName(`${text(language, 'control.open-machine-alarm')} ${OFFLINE_MACHINE}`);
    // Filter the list so that the Alarm is hidden, then select another Alarm and open the link.
    await choose(page, ids.alarmFilterPriority, text(language, alarmPriorityLabels.critical));
    await expect.poll(() => alarmIds(page)).toEqual(['AL-0160']);
    await select(page, language, 'AL-0160');
    await links.click();
    await expect.poll(() => alarmIds(page)).toEqual(DEFAULT_ALARMS);
    await expect(rowOf(page, language, OFFLINE_ALARM)).toBeFocused();
    await expect(rowOf(page, language, OFFLINE_ALARM)).toBeInViewport();
    await expect(page.getByLabel(text(language, 'control.select-alarm', { alarm: OFFLINE_ALARM }), { exact: true })).not.toBeChecked();
    await expect(page.getByLabel(text(language, 'control.select-alarm', { alarm: 'AL-0160' }), { exact: true })).toBeChecked();
    await expect(page.getByText(text(language, 'common.selected-count.one', { count: 1 }), { exact: true })).toBeVisible();
    await expect(byId(page, ids.alarmFilterPriority)).toContainText(text(language, 'common.all'));
    // Repeating the activation focuses the row again after focus moved away.
    await rowOf(page, language, 'AL-0151').focus();
    await expect(rowOf(page, language, 'AL-0151')).toBeFocused();
    await links.click();
    await expect(rowOf(page, language, OFFLINE_ALARM)).toBeFocused();
  });

  test('the / shortcut focuses the first filter and Tab follows reading order through the filters to the list', async ({ page, language }) => {
    await openScreen(page, 'control');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('/');
    const active = () => page.evaluate(() => document.activeElement?.closest('[data-testid]')?.getAttribute('data-testid') ?? document.activeElement?.getAttribute('aria-label') ?? null);
    const priority = byId(page, ids.alarmFilterPriority);
    await expect(priority.locator('input')).toBeFocused();
    const seen: (string | null)[] = [await active()];
    for (let i = 0; i < 4; i += 1) { await page.keyboard.press('Tab'); seen.push(await active()); }
    // Filters in order (Priority, State, Area, Line), then the Alarm list (Acknowledge is disabled without a selection, so it is skipped).
    expect(seen).toEqual([ids.alarmFilterPriority, ids.alarmFilterState, ids.alarmFilterArea, ids.alarmFilterLine, ids.alarmList]);
    await expect(page.getByLabel(text(language, 'control.select-all-alarms'), { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await active()).toBe(ids.alarmSelect);
    await expect(page.getByLabel(text(language, 'control.select-alarm', { alarm: 'AL-0160' }), { exact: true })).toBeFocused();
    // Space on the focused checkbox selects the Alarm, which enables Acknowledge.
    await page.keyboard.press('Space');
    await expect(byId(page, ids.acknowledge)).toBeEnabled();
  });

  test('has no horizontal page overflow at 1440 and 1280 px', async ({ page }) => {
    await openScreen(page, 'control');
    await expectNoPageOverflow(page);
    await atMinWidth(page, () => expectNoPageOverflow(page));
  });

  test('the Alarm list, Event Log and diagnostics are single real tables with every column visible at 1440 px', async ({ page }) => {
    await openScreen(page, 'control');
    await expect(page.locator('table')).toHaveCount(3);
    // Alarm list: select column plus eight. Event Log: nine leaf columns under one grouped header (Change). Diagnostics: six.
    await expectTableFits(byId(page, ids.alarmList), 9);
    await expectTableFits(byId(page, ids.eventLog), 9);
    await expectTableFits(byId(page, ids.diagnostics), 6);
    for (const id of [ids.alarmList, ids.eventLog, ids.diagnostics]) await expectHeadersIntact(byId(page, id));
  });

  test('keeps every column of the three tables visible and the headers intact at 1280 px', async ({ page }) => {
    await openScreen(page, 'control');
    await atMinWidth(page, async () => {
      await expectTableFits(byId(page, ids.alarmList), 9);
      await expectTableFits(byId(page, ids.eventLog), 9);
      await expectTableFits(byId(page, ids.diagnostics), 6);
      for (const id of [ids.alarmList, ids.eventLog, ids.diagnostics]) await expectHeadersIntact(byId(page, id));
    });
  });

  test('keeps headers intact after the lists change (filters, long event list)', async ({ page, language }) => {
    await openScreen(page, 'control');
    await choose(page, ids.eventFilterRange, text(language, rangeLabels['last-30d']));
    await expect(eventRows(page)).toHaveCount(177);
    await expectNoPageOverflow(page);
    await expectTableFits(byId(page, ids.eventLog), 9);
    await expectHeadersIntact(byId(page, ids.eventLog));
  });

  test('shows no text of the other language and has no console errors', async ({ page, language }) => {
    const errors = noConsoleErrors(page);
    await openScreen(page, 'control');
    await expectNoForeignLanguage(page, language);
    for (const id of [ids.alarmFilterPriority, ids.alarmFilterState, ids.alarmFilterArea, ids.alarmFilterLine, ids.eventFilterUser, ids.eventFilterType, ids.eventFilterRange, ids.diagnosticsSort]) {
      await byId(page, id).click();
      await expect(popupOptions(page).first()).toBeVisible();
      await expectNoForeignLanguage(page, language);
      await page.keyboard.press('Escape');
    }
    await choose(page, ids.alarmFilterLine, /^P1/);
    await expect(byId(page, ids.alarmEmpty)).toBeVisible();
    await choose(page, ids.eventFilterUser, 'Camila Machado');
    await expect(byId(page, ids.eventEmpty)).toBeVisible();
    await expectNoForeignLanguage(page, language);
    await page.waitForLoadState('networkidle');
    errors.expectNone();
  });
});
