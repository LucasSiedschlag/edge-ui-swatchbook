import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { alarmList, createPlantState, reduce } from '../plant';
import type { PlantState } from '../plant';
import { alarmListView } from './alarms';

const d = generateMockDataset();
const start = () => createPlantState(d);
const RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const areaOf = (lineId: string) => d.lines.find((l) => l.id === lineId)?.areaId;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of o instanceof Map ? [...o.values()] : Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe('alarmListView', () => {
  const s = start();

  it('hides cleared Alarms by default and shows the other three states', () => {
    const { rows } = alarmListView(s, 0);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.state !== 'cleared')).toBe(true);
    const expected = d.alarms.filter((a) => a.state !== 'cleared').length;
    expect(rows).toHaveLength(expected);
  });

  it('sorts by priority rank, then oldest first, then id', () => {
    const { rows } = alarmListView(s, 0, { states: ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'] });
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!, b = rows[i]!;
      const key = (RANK[a.priority] - RANK[b.priority]) || (a.raisedAt - b.raisedAt) || a.id.localeCompare(b.id);
      expect(key).toBeLessThanOrEqual(0);
    }
    // Critical rows come first, low rows last, and ages fall as raisedAt rises inside a priority.
    expect(rows[0]?.priority).toBe('critical');
    const sameP = rows.filter((r) => r.priority === rows[0]?.priority);
    for (let i = 1; i < sameP.length; i++) expect(sameP[i - 1]!.ageSeconds).toBeGreaterThanOrEqual(sameP[i]!.ageSeconds);
  });

  it('is the sorted alarmList minus cleared, with joined names and untranslated TextRefs', () => {
    const { rows } = alarmListView(s, 0);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(alarmList(s, 0).filter((a) => a.state !== 'cleared').map((a) => a.id).sort());
    for (const r of rows) {
      const src = d.alarms.find((a) => a.id === r.id)!;
      expect(r.message).toEqual(src.message);
      expect(typeof r.message.key).toBe('string');
      expect(r.machineId).toBe(src.machineId);
      expect(r.machineName).toEqual(d.machines.find(machine => machine.id === src.machineId)!.name);
      expect(typeof r.machineName.key).toBe('string');
      expect(r.tagId).toBe(src.tagId);
      expect(r.acknowledgedBy).toBe(src.acknowledgedBy);
      expect(r.acknowledgedByName).toBe(d.users.find(user => user.id === src.acknowledgedBy)?.name ?? null);
    }
  });

  it('computes age in seconds from simulated time and joins the Area', () => {
    const rows = alarmListView(s, 100).rows;
    for (const r of rows) {
      expect(r.ageSeconds).toBe((simulatedTime(100) - r.raisedAt) / 1000);
      expect(r.areaId).toBe(areaOf(r.lineId));
    }
  });

  it('sets canAcknowledge for active-unacknowledged and returned-unacknowledged only', () => {
    const rows = alarmListView(s, 0, { states: ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'] }).rows;
    for (const r of rows) {
      expect(r.canAcknowledge).toBe(r.state === 'active-unacknowledged' || r.state === 'returned-unacknowledged');
    }
    expect(rows.some((r) => r.canAcknowledge)).toBe(true);
    expect(rows.some((r) => !r.canAcknowledge)).toBe(true);
  });

  it('filters by priority, state, area and line, each alone', () => {
    const all = alarmListView(s, 0).rows;
    const crit = alarmListView(s, 0, { priorities: ['critical'] }).rows;
    expect(crit.length).toBeGreaterThan(0);
    expect(crit).toEqual(all.filter((r) => r.priority === 'critical'));
    const unack = alarmListView(s, 0, { states: ['active-unacknowledged'] }).rows;
    expect(unack).toEqual(all.filter((r) => r.state === 'active-unacknowledged'));
    const area = alarmListView(s, 0, { areaId: 'extrusion' }).rows;
    expect(area.length).toBeGreaterThan(0);
    expect(area.every((r) => ['E1', 'E2'].includes(r.lineId))).toBe(true);
    expect(area).toEqual(all.filter((r) => r.lineId === 'E1' || r.lineId === 'E2'));
    const line = alarmListView(s, 0, { lineId: 'E1' }).rows;
    expect(line).toEqual(all.filter((r) => r.lineId === 'E1'));
  });

  it('shows cleared Alarms only when asked', () => {
    const cleared = alarmListView(s, 0, { states: ['cleared'] }).rows;
    expect(cleared).toHaveLength(d.alarms.filter((a) => a.state === 'cleared').length);
    expect(cleared.every((r) => r.state === 'cleared')).toBe(true);
  });

  it('combines filters with AND', () => {
    const r = alarmListView(s, 0, { priorities: ['critical', 'high'], lineId: 'E1', states: ['active-unacknowledged', 'active-acknowledged'] }).rows;
    expect(r.every((x) => (x.priority === 'critical' || x.priority === 'high') && x.lineId === 'E1' && x.state.startsWith('active'))).toBe(true);
    const wrongArea = alarmListView(s, 0, { areaId: 'assembly', lineId: 'E1' });
    expect(wrongArea).toEqual({ rows: [], empty: true });
  });

  it('reports empty only when no row is left', () => {
    expect(alarmListView(s, 0).empty).toBe(false);
    expect(alarmListView(s, 0, { priorities: [] })).toEqual(alarmListView(s, 0));
  });

  it('flips to acknowledged after the acknowledge action', () => {
    const target = alarmListView(s, 0).rows.find((r) => r.canAcknowledge && r.state === 'active-unacknowledged')!;
    const r = reduce(s, { type: 'acknowledge', alarmIds: [target.id] }, { tick: 10 });
    if (!r.ok) throw new Error(r.error.code);
    const row = alarmListView(r.state as PlantState, 10).rows.find((x) => x.id === target.id)!;
    expect(row.state).toBe('active-acknowledged');
    expect(row.canAcknowledge).toBe(false);
    expect(row.acknowledgedBy).toBe(s.currentUserId);
    expect(row.acknowledgedByName).toBe(d.users.find(user => user.id === s.currentUserId)!.name);
  });

  it('does not mutate frozen inputs and is deterministic', () => {
    const frozen = deepFreeze(createPlantState(generateMockDataset()));
    const filters = deepFreeze({ states: ['active-unacknowledged' as const, 'active-acknowledged' as const, 'returned-unacknowledged' as const, 'cleared' as const] });
    const a = alarmListView(frozen, 5, filters);
    expect(a.rows.some(row => row.acknowledgedByName === null)).toBe(true);
    expect(a.rows.some(row => row.acknowledgedByName !== null)).toBe(true);
    for (const row of a.rows) {
      expect(row.machineName).toEqual(frozen.dataset.machines.find(machine => machine.id === row.machineId)!.name);
      expect(row.acknowledgedByName).toBe(frozen.dataset.users.find(user => user.id === row.acknowledgedBy)?.name ?? null);
    }
    expect(alarmListView(frozen, 5, filters)).toEqual(a);
    expect(alarmListView(deepFreeze(createPlantState(generateMockDataset())), 5, filters)).toEqual(a);
  });

  it('is fast on the default data, from a cold state (median of several runs, so one slow machine moment does not fail it)', () => {
    const runs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      alarmListView(start(), 0);
      runs.push(performance.now() - t);
    }
    expect(runs.sort((a, b) => a - b)[3]).toBeLessThan(1000);
  });
});

it('normalizes null and empty Alarm filters while retaining default states', () => {
  const s = start();
  for (const value of [undefined, null, [], ''] as const) {
    expect(alarmListView(s, 0, { states: value, priorities: value, areaId: value, lineId: value })).toEqual(alarmListView(s, 0));
  }
  expect(alarmListView(s, 0, null)).toEqual(alarmListView(s, 0));
});
