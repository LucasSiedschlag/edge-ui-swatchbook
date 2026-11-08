import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { HOUR } from '../mock/time';
import type { EventLogEntry } from '../mock/types';
import { createPlantState, reduce } from '../plant';
import type { PlantAction, PlantState } from '../plant';
import { shiftInfo, simulatedTime } from '../sim/clock';
import { eventLogView } from './events';

const d = generateMockDataset();
const start = () => createPlantState(d);
const roleOf = (id: string) => d.users.find((u) => u.id === id)?.role;

function ok(state: PlantState, action: PlantAction, tick: number) {
  const r = reduce(state, action, { tick });
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r.state;
}
/** A state whose Event Log is exactly the given entries. */
function withEvents(entries: EventLogEntry[]): PlantState {
  return { ...start(), events: entries };
}
const entry = (id: string, at: number): EventLogEntry => ({
  id, at, userId: d.users[0]!.id, action: 'pause', targetKind: 'line', target: 'E1', oldValue: null, newValue: null, note: null,
});

describe('eventLogView', () => {
  it('lists newest first, ties by later insertion', () => {
    const now = simulatedTime(0);
    const s = withEvents([entry('EV-0001', now - 10), entry('EV-0003', now - 5), entry('EV-0002', now - 5)]);
    expect(eventLogView(s, 0).rows.map((r) => r.id)).toEqual(['EV-0002', 'EV-0003', 'EV-0001']);
  });

  it('shows the whole dataset log with the User name and Role', () => {
    const { rows, empty } = eventLogView(start(), 0);
    expect(empty).toBe(false);
    expect(rows).toHaveLength(d.events.length);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.at).toBeGreaterThanOrEqual(rows[i]!.at);
    for (const r of rows.slice(0, 50)) {
      expect(r.role).toBe(roleOf(r.userId));
      expect(r.userName).toBe(d.users.find((u) => u.id === r.userId)?.name);
    }
  });

  it('keeps only entries up to the simulated time of the tick', () => {
    const now = simulatedTime(10);
    const s = withEvents([entry('EV-0001', now), entry('EV-0002', now + 1)]);
    expect(eventLogView(s, 10).rows.map((r) => r.id)).toEqual(['EV-0001']);
  });

  it('filters by User and by action, alone and combined', () => {
    const all = eventLogView(start(), 0).rows;
    const uid = all[0]!.userId;
    const byUser = eventLogView(start(), 0, { userId: uid }).rows;
    expect(byUser.length).toBeGreaterThan(0);
    expect(byUser.every((r) => r.userId === uid)).toBe(true);
    expect(byUser).toHaveLength(d.events.filter((e) => e.userId === uid).length);
    const byAct = eventLogView(start(), 0, { actions: ['pause', 'resume'] }).rows;
    expect(byAct.length).toBeGreaterThan(0);
    expect(byAct.every((r) => r.action === 'pause' || r.action === 'resume')).toBe(true);
    const both = eventLogView(start(), 0, { userId: uid, actions: ['pause', 'resume'] }).rows;
    expect(both).toEqual(all.filter((r) => r.userId === uid && (r.action === 'pause' || r.action === 'resume')));
  });

  it('reports empty when nothing matches', () => {
    expect(eventLogView(start(), 0, { userId: 'nobody' })).toEqual({ rows: [], empty: true });
    expect(eventLogView(start(), 0, { actions: [] })).toEqual(eventLogView(start(), 0));
  });

  // Rule: an open side excludes the exact bound and a closed side includes it.
  // last-24h, last-7d, last-30d are (now - span, now]. last-shift is [startsAt - 8h, startsAt).
  it('pins the edges of the rolling ranges: whole hour slots ending with the current hour, the first instant included', () => {
    const now = simulatedTime(0);
    // At tick 0 the 24 hour window starts 23 hours before load, the 7 day one 167 hours before, the 30 day one 719 hours before.
    const s = withEvents([
      entry('EV-0001', now - 23 * HOUR - 1), entry('EV-0002', now - 23 * HOUR), entry('EV-0003', now),
      entry('EV-0004', now - 167 * HOUR - 1), entry('EV-0005', now - 167 * HOUR),
      entry('EV-0006', now - 719 * HOUR - 1), entry('EV-0007', now - 719 * HOUR),
    ]);
    const ids = (range: 'last-24h' | 'last-7d' | 'last-30d') => eventLogView(s, 0, { range }).rows.map((r) => r.id).sort();
    expect(ids('last-24h')).toEqual(['EV-0002', 'EV-0003']);
    expect(ids('last-7d')).toEqual(['EV-0001', 'EV-0002', 'EV-0003', 'EV-0005']);
    expect(ids('last-30d')).toEqual(['EV-0001', 'EV-0002', 'EV-0003', 'EV-0004', 'EV-0005', 'EV-0007']);
  });

  it('pins the edges of last-shift, the latest completed Shift', () => {
    const tick = 3 * 3600 + 5; // inside the Shift that started at load
    const startsAt = shiftInfo(tick).startsAt;
    expect(startsAt).toBe(simulatedTime(0));
    const s = withEvents([entry('EV-0001', startsAt - 8 * HOUR - 1), entry('EV-0002', startsAt - 8 * HOUR),
      entry('EV-0003', startsAt - 1), entry('EV-0004', startsAt), entry('EV-0005', simulatedTime(tick))]);
    expect(eventLogView(s, tick, { range: 'last-shift' }).rows.map((r) => r.id)).toEqual(['EV-0003', 'EV-0002']);
  });

  it('last-shift at tick 0 covers the 8 hours before load', () => {
    const rows = eventLogView(start(), 0, { range: 'last-shift' }).rows;
    const now = simulatedTime(0);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.at >= now - 8 * HOUR && r.at < now)).toBe(true);
    expect(rows).toHaveLength(d.events.filter((e) => e.at >= now - 8 * HOUR && e.at < now).length);
  });

  it('last-shift moves to the next completed Shift after 8 hours', () => {
    const tick = 8 * 3600 + 1;
    const now = simulatedTime(0);
    const s = withEvents([entry('EV-0001', now - 1), entry('EV-0002', now + HOUR)]);
    expect(eventLogView(s, tick, { range: 'last-shift' }).rows.map((r) => r.id)).toEqual(['EV-0002']);
  });

  it('shows new actions on top at their tick and not before it', () => {
    let s = ok(start(), { type: 'pause', lineId: 'E2' }, 20);
    s = ok(s, { type: 'acknowledge', alarmIds: [d.alarms.find((a) => a.state === 'active-unacknowledged')!.id] }, 30);
    const tag = d.tags.find((t) => t.writable)!;
    s = ok(s, { type: 'setpoint-override', tagId: tag.id, value: (tag.min + tag.max) / 2 === tag.setpoint ? tag.min : (tag.min + tag.max) / 2, reason: 'test' }, 40);
    const at = (t: number) => eventLogView(s, t).rows;
    expect(at(40).slice(0, 3).map((r) => r.action)).toEqual(['setpoint-override', 'alarm-acknowledge', 'pause']);
    expect(at(40)[0]!.at).toBe(simulatedTime(40));
    expect(at(30)[0]!.action).toBe('alarm-acknowledge');
    expect(at(25)[0]!.action).toBe('pause');
    expect(at(19)).toHaveLength(d.events.length);
    expect(at(19).some((r) => r.action === 'pause' && r.target === 'E2' && r.at > simulatedTime(0))).toBe(false);
    expect(at(40)[0]!.role).toBe(roleOf(s.currentUserId));
  });

  it('does not touch its inputs and is deterministic', () => {
    const s = start();
    const before = JSON.stringify(s.events);
    const first = eventLogView(s, 0, { range: 'last-24h' });
    expect(eventLogView(s, 0, { range: 'last-24h' })).toEqual(first);
    expect(JSON.stringify(s.events)).toBe(before);
  });
});

it('orders EV-9999, EV-10000 and EV-10001 by insertion after real actions', () => {
  let state = start();
  while (state.ids.events < 9998) {
    state = ok(state, { type: state.controls.E2.paused ? 'resume' : 'pause', lineId: 'E2' }, 0);
  }
  for (const note of ['first', 'second', 'third']) state = ok(state, { type: 'shift-handover', note }, 0);
  expect(eventLogView(state, 0, { actions: ['shift-handover'], range: 'last-7d' }).rows.slice(0, 3).map((row) => [row.id, row.note]))
    .toEqual([['EV-10001', 'third'], ['EV-10000', 'second'], ['EV-9999', 'first']]);
}, 20000);

it('normalizes null and empty Event Log filters', () => {
  const s = start();
  for (const value of [undefined, null, [], ''] as const) {
    expect(eventLogView(s, 0, { actions: value, userId: value, range: value })).toEqual(eventLogView(s, 0));
  }
  expect(eventLogView(s, 0, null)).toEqual(eventLogView(s, 0));
});
