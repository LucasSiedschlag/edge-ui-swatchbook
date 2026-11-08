import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulate } from '../sim/simulate';
import { TAG_GRID_DEFAULT_FILTERS, connectivityView, tagDetailView, tagGridView } from './tags';

const d = generateMockDataset();
const snap = simulate(d, 0);
const offline = d.machines.filter((m) => m.comms.status === 'offline').map((m) => m.id);

describe('tagGridView', () => {
  it('has one row per Tag in dataset order, about 300', () => {
    const { rows, empty } = tagGridView(d, snap);
    expect(empty).toBe(false);
    expect(rows).toHaveLength(d.tags.length);
    expect(rows.length).toBeGreaterThan(250);
    expect(rows.map((r) => r.tagId)).toEqual(d.tags.map((t) => t.id));
  });

  it('carries the reading, limits and the Machine link', () => {
    const rows = tagGridView(d, snap).rows;
    for (const r of rows) {
      const tag = d.tags.find((t) => t.id === r.tagId)!;
      const reading = snap.tags.find((x) => x.tagId === r.tagId)!;
      const link = snap.machines.find((m) => m.machineId === tag.machineId)!;
      expect(r).toMatchObject({
        lineId: tag.lineId, machineId: tag.machineId, name: tag.name, unit: tag.unit, min: tag.min, max: tag.max,
        writable: tag.writable, value: reading.value, setpoint: reading.setpoint, status: reading.status,
        alarm: reading.alarm, linkStatus: link.status, lastSeenAt: link.lastSeenAt,
      });
    }
  });

  it('marks the Stale Tags as exactly those of the Offline Machine, and they cannot be overridden', () => {
    const rows = tagGridView(d, snap).rows;
    const stale = rows.filter((r) => r.status === 'stale');
    expect(offline.length).toBeGreaterThan(0);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.map((r) => r.tagId).sort()).toEqual(d.tags.filter((t) => offline.includes(t.machineId)).map((t) => t.id).sort());
    expect(stale.every((r) => !r.canOverride)).toBe(true);
    for (const r of rows) expect(r.canOverride).toBe(r.writable && r.status !== 'stale');
    expect(rows.some((r) => r.canOverride)).toBe(true);
  });

  it('filters by Line, Machine, status and name search, alone', () => {
    const all = tagGridView(d, snap).rows;
    const line = tagGridView(d, snap, { lineId: 'E1' }).rows;
    expect(line.length).toBeGreaterThan(0);
    expect(line).toEqual(all.filter((r) => r.lineId === 'E1'));
    const mid = d.tags[0]!.machineId;
    expect(tagGridView(d, snap, { machineId: mid }).rows).toEqual(all.filter((r) => r.machineId === mid));
    const stale = tagGridView(d, snap, { status: 'stale' }).rows;
    expect(stale).toEqual(all.filter((r) => snap.tags.find((x) => x.tagId === r.tagId)!.status === 'stale'));
    const name = d.tags[3]!.name;
    const hits = tagGridView(d, snap, { search: name.toUpperCase() }).rows;
    expect(hits.map((r) => r.tagId)).toContain(d.tags[3]!.id);
    expect(hits.every((r) => r.name.toLowerCase().includes(name.toLowerCase()))).toBe(true);
  });

  it('status filter partitions the grid', () => {
    const total = (['normal', 'high', 'low', 'stale'] as const).reduce((n, status) => n + tagGridView(d, snap, { status }).rows.length, 0);
    expect(total).toBe(d.tags.length);
  });

  it('combines filters with AND and reports the empty state', () => {
    const t = d.tags[0]!;
    const one = tagGridView(d, snap, { lineId: t.lineId, machineId: t.machineId, search: t.name }).rows;
    expect(one.map((r) => r.tagId)).toContain(t.id);
    expect(tagGridView(d, snap, { lineId: 'E1', machineId: 'no-machine' })).toEqual({ rows: [], empty: true });
    expect(tagGridView(d, snap, { search: 'zzzz-none' }).empty).toBe(true);
  });

  it('is deterministic, fast and leaves its inputs alone', () => {
    const before = JSON.stringify(snap);
    const runs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      tagGridView(d, snap, { lineId: 'E1' });
      runs.push(performance.now() - t);
    }
    expect(runs.sort((a, b) => a - b)[3]).toBeLessThan(1000);
    const a = tagGridView(d, snap, { lineId: 'E1' });
    expect(tagGridView(d, snap, { lineId: 'E1' })).toEqual(a);
    expect(JSON.stringify(snap)).toBe(before);
  });
});

describe('connectivityView', () => {
  it('lists every Machine, Offline first, then Degraded, then Online, then by Machine id', () => {
    const rows = connectivityView(d, snap);
    expect(rows).toHaveLength(d.machines.length);
    const rank = { offline: 0, degraded: 1, online: 2 } as const;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!, b = rows[i]!;
      expect(rank[a.linkStatus] - rank[b.linkStatus] || (a.machineId < b.machineId ? -1 : 1)).toBeLessThanOrEqual(0);
    }
    expect(rows[0]!.linkStatus).toBe('offline');
    expect(rows.filter((r) => r.linkStatus === 'offline').map((r) => r.machineId).sort()).toEqual([...offline].sort());
  });

  it('carries the link numbers of the snapshot and the Machine Line', () => {
    for (const r of connectivityView(d, snap)) {
      const link = snap.machines.find((m) => m.machineId === r.machineId)!;
      expect(r).toMatchObject({ linkStatus: link.status, latencyMs: link.latencyMs, packetLossPct: link.packetLossPct, lastSeenAt: link.lastSeenAt, errorCount: link.errorCount });
      expect(r.lineId).toBe(d.machines.find((m) => m.id === r.machineId)!.lineId);
    }
  });

  it('is deterministic', () => {
    expect(connectivityView(d, simulate(d, 50))).toEqual(connectivityView(d, simulate(d, 50)));
  });
});

it('normalizes null and empty Tag filters', () => {
  const snapshot = simulate(d, 0);
  for (const value of [undefined, null, [], ''] as const) {
    expect(tagGridView(d, snapshot, { lineId: value, machineId: value, status: value, search: value })).toEqual(tagGridView(d, snapshot));
  }
  expect(tagGridView(d, snapshot, null)).toEqual(tagGridView(d, snapshot));
});

it('sorts diagnostics by severity or metrics, nulls last in both directions and Machine id ties ascending', () => {
  const machines = [
    { ...snap.machines[0]!, machineId: 'E1-extruder', status: 'offline' as const, latencyMs: null, packetLossPct: 100 },
    { ...snap.machines[0]!, machineId: 'E1-saw', status: 'online' as const, latencyMs: 4, packetLossPct: 0 },
    { ...snap.machines[0]!, machineId: 'E1-puller', status: 'degraded' as const, latencyMs: 40, packetLossPct: 2 },
    { ...snap.machines[0]!, machineId: 'E1-calibrator', status: 'online' as const, latencyMs: 4, packetLossPct: 0 },
  ];
  const snapshot = { ...snap, machines };
  const ids = (column: 'status' | 'latency' | 'packetLoss' | 'machine', direction: 'asc' | 'desc') =>
    connectivityView(d, snapshot, { column, direction }).map(r => r.machineId);
  expect(ids('status', 'asc')).toEqual(['E1-extruder', 'E1-puller', 'E1-calibrator', 'E1-saw']);
  expect(ids('status', 'desc')).toEqual(['E1-calibrator', 'E1-saw', 'E1-puller', 'E1-extruder']);
  expect(ids('latency', 'asc')).toEqual(['E1-calibrator', 'E1-saw', 'E1-puller', 'E1-extruder']);
  expect(ids('latency', 'desc')).toEqual(['E1-puller', 'E1-calibrator', 'E1-saw', 'E1-extruder']);
  expect(ids('packetLoss', 'asc')).toEqual(['E1-calibrator', 'E1-saw', 'E1-puller', 'E1-extruder']);
  expect(ids('packetLoss', 'desc')).toEqual(['E1-extruder', 'E1-puller', 'E1-calibrator', 'E1-saw']);
  expect(ids('machine', 'asc')).toEqual(['E1-calibrator', 'E1-extruder', 'E1-puller', 'E1-saw']);
  expect(ids('machine', 'desc')).toEqual(['E1-saw', 'E1-puller', 'E1-extruder', 'E1-calibrator']);
  expect(connectivityView(d, snapshot).find(r => r.linkStatus === 'offline')!.latencyMs).toBeNull();
  expect(() => connectivityView(d, snap, { column: 'bad' as 'status', direction: 'asc' })).toThrow();
  expect(() => connectivityView(d, snap, { column: 'status', direction: 'bad' as 'asc' })).toThrow();
});

it('joins each Offline diagnostic to its open comms loss Alarm only', () => {
  for (const row of connectivityView(d, snap)) {
    const alarm = d.alarms.find(a => a.machineId === row.machineId && a.message.key === 'alarm.comm-loss' && ['active-unacknowledged', 'active-acknowledged'].includes(a.state));
    expect(row.alarmId).toBe(row.linkStatus === 'offline' ? alarm?.id ?? null : null);
  }
  expect(connectivityView(d, snap).some(r => r.alarmId != null)).toBe(true);
});

it('shares active Recipe values and reset availability with reduce', async () => {
  const { activeRecipeParameter, createPlantState, reduce } = await import('../index');
  const initial = createPlantState(d);
  const result = reduce(initial, { type: 'setpoint-override', tagId: 'E2-puller.puller-speed', value: 2, reason: 'trial' }, { tick: 1 });
  if (!result.ok) throw new Error(result.error.code);
  for (const state of [initial, result.state]) {
    for (const row of tagGridView(d, simulate(d, state.lastTick, state.overlay)).rows) {
      const tag = d.tags.find(t => t.id === row.tagId)!;
      expect(row.recipeValue).toBe(activeRecipeParameter(d, tag)?.setpoint ?? null);
      const reset = reduce(state, { type: 'reset-to-recipe', tagId: row.tagId }, { tick: state.lastTick });
      expect(row.canResetToRecipe).toBe(reset.ok && reset.events.length > 0);
    }
  }
});

it('exports unfiltered defaults and supplies current Tag details and action refusal reasons', () => {
  expect(TAG_GRID_DEFAULT_FILTERS).toEqual({});
  const rows = tagGridView(d, snap, TAG_GRID_DEFAULT_FILTERS).rows;
  for (const row of rows) {
    expect(tagDetailView(d, snap, row.tagId)).toEqual(row);
    expect(row.overrideUnavailable).toBe(row.status === 'stale' ? 'tag-stale' : !row.writable ? 'tag-not-writable' : null);
    expect(row.resetUnavailable).toBe(row.status === 'stale' ? 'tag-stale' : row.recipeValue === null ? 'no-recipe-value' : null);
  }
  expect(tagDetailView(d, snap, 'missing')).toBeNull();
});

it('refreshes dialog details from the supplied Plant State snapshot', () => {
  const id = 'E1-puller.puller-speed';
  const changed = simulate(d, 100, { setpoints: new Map([[id, [{ fromTick: 100, value: 3 }]]]) });
  expect(tagDetailView(d, changed, id)).toMatchObject({ setpoint: 3, recipeValue: 2.1, canResetToRecipe: true });
  expect(tagDetailView(d, snap, id)).toMatchObject({ setpoint: 2.1, canResetToRecipe: false });
});
