import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { HOUR, NOW } from '../mock/time';
import type { HourlyRecord, MockDataset } from '../mock/types';
import { createPlantState, reduce } from '../plant';
import { readHours } from '../sim/kpis';
import { performanceView, type RangeId, type Scope } from './performance';

const d = generateMockDataset();
const site: Scope = { kind: 'site' };
const ranges: RangeId[] = ['last-shift', 'last-24h', 'last-7d', 'last-30d'];
const scopes: Scope[] = [site, ...d.areas.map((a): Scope => ({ kind: 'area', areaId: a.id })),
  ...d.lines.map((l): Scope => ({ kind: 'line', lineId: l.id }))];
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

function stub(hours: HourlyRecord[] = []): MockDataset {
  return {
    seed: 1, now: NOW, areas: d.areas, lines: d.lines, machines: [], users: [], products: [], recipes: [],
    recipeVersions: [], lots: [], genealogies: [], batches: [], activeBatches: [], tags: [], alarms: [],
    events: [], shiftHistory: [], hourlyOutput: hours,
  };
}

function hour(offset: number, overrides: Partial<HourlyRecord> = {}): HourlyRecord {
  return {
    hourStart: NOW + offset * HOUR, lineId: 'E1', plannedMin: 60, runMin: 30,
    targetUnits: 100, goodUnits: 40, scrapUnits: 10,
    downtime: [{ reason: 'changeover', minutes: 30 }], ...overrides,
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function parts(rows: readonly Pick<HourlyRecord, 'plannedMin' | 'runMin' | 'targetUnits' | 'goodUnits' | 'scrapUnits'>[]) {
  const planned = sum(rows.map((h) => h.plannedMin));
  const made = sum(rows.map((h) => h.goodUnits + h.scrapUnits));
  const target = sum(rows.map((h) => h.targetUnits));
  const a = planned ? sum(rows.map((h) => h.runMin)) / planned : 0;
  const p = target ? made / target : 0;
  const q = made ? sum(rows.map((h) => h.goodUnits)) / made : 0;
  return { value: round3(round3(a) * round3(p) * round3(q)), availability: round3(a), performance: round3(p), quality: round3(q) };
}

function inScope(h: HourlyRecord, scope: Scope): boolean {
  if (scope.kind === 'site') return true;
  if (scope.kind === 'line') return h.lineId === scope.lineId;
  return d.lines.some((l) => l.id === h.lineId && l.areaId === scope.areaId);
}

describe('performance windows', () => {
  // Each hour has a distinct literal marker, including hours outside both windows.
  const hours = Array.from({ length: 1511 }, (_, i) => hour(i - 1500, { goodUnits: i + 1 }));
  const dataset = stub(hours.filter((h) => h.hourStart < NOW));
  const live = hours.filter((h) => h.hourStart >= NOW);
  const boundaries = [
    { tick: 0, current: 0, shiftEnd: 0 },
    { tick: 100, current: 0, shiftEnd: 0 },
    { tick: 3600, current: 1, shiftEnd: 0 },
    { tick: 28800, current: 8, shiftEnd: 8 },
    { tick: 30000, current: 8, shiftEnd: 8 },
  ];

  for (const { tick, current, shiftEnd } of boundaries) {
    it(`uses the completed Shift and adjacent equal windows at tick ${tick}`, () => {
      for (const range of ranges) {
        const count = range === 'last-shift' ? 8 : range === 'last-24h' ? 24 : range === 'last-7d' ? 168 : 720;
        const end = range === 'last-shift' ? shiftEnd : range === 'last-24h' ? current + 1 : 0;
        const selected = hours.filter((h) => h.hourStart >= NOW + (end - count) * HOUR && h.hourStart < NOW + end * HOUR);
        const previous = hours.filter((h) => h.hourStart >= NOW + (end - 2 * count) * HOUR && h.hourStart < NOW + (end - count) * HOUR);
        expect(selected).toHaveLength(count);
        expect(previous).toHaveLength(count);
        const view = performanceView(dataset, live, tick, site, range);
        expect(view.output[0]?.start).toBe(NOW + (end - count) * HOUR);
        expect(sum(view.output.map((b) => b.goodUnits))).toBe(sum(selected.map((h) => h.goodUnits)));
        if (!view.oee || !view.oee.change) throw new Error('expected production in both windows');
        expect(view.oee.previous).toEqual(parts(previous));
        const expected = parts(selected);
        for (const key of ['value', 'availability', 'performance', 'quality'] as const) {
          expect(view.oee[key]).toBe(expected[key]);
          expect(view.oee.change[key]).toBe(round3(expected[key] - parts(previous)[key]));
        }
      }
    });
  }

  it('starts the tick 0 last Shift at 22:00 on the previous local date', () => {
    const view = performanceView(d, [], 0, site, 'last-shift');
    expect(view.output.map((b) => b.start)).toEqual(Array.from({ length: 8 }, (_, i) => NOW + (i - 8) * HOUR));
    expect(view.shifts[0]).toMatchObject({ date: '2025-12-31', shift: 'S3', startsAt: Date.parse('2025-12-31T22:00:00-03:00') });
  });

  it('includes synthetic live partial minutes in 24h, and excludes them from last Shift', () => {
    const dataset = stub([hour(-1)]);
    const live = [hour(0, { plannedMin: 2, runMin: 1, targetUnits: 10, goodUnits: 3, scrapUnits: 1,
      downtime: [{ reason: 'minor-stops', minutes: 1 }] })];
    const view = performanceView(dataset, live, 100, site, 'last-24h');
    expect(view.output.at(-1)).toEqual({ start: NOW, date: '2026-01-01', hour: 6, targetUnits: 10, goodUnits: 3, scrapUnits: 1 });
    expect(view.oee).toMatchObject({ value: 0.195, availability: 0.5, performance: 0.491, quality: 0.796 });
    expect(performanceView(dataset, live, 100, site, 'last-shift')).toEqual(performanceView(dataset, [], 100, site, 'last-shift'));
  });

  it('emits the empty current hour at an exact hour boundary without inventing production', () => {
    const view = performanceView(stub([hour(-24), hour(-23), hour(-1)]), [], 0, site, 'last-24h');
    expect(view.output).toHaveLength(24);
    expect(view.output[0]?.start).toBe(NOW - 23 * HOUR);
    expect(view.output.at(-1)).toEqual({ start: NOW, date: '2026-01-01', hour: 6, targetUnits: 0, goodUnits: 0, scrapUnits: 0 });
    expect(sum(view.output.map((b) => b.goodUnits))).toBe(80);
  });

  it.each([['last-7d', 168, 8], ['last-30d', 720, 31]] as const)('groups %s by local calendar date and counts distinct hours', (range, count, days) => {
    const records = Array.from({ length: count }, (_, i) => hour(i - count));
    const dataset = stub(records.filter((h) => h.hourStart < NOW));
    const view = performanceView(dataset, records.filter((h) => h.hourStart >= NOW), 100, site, range);
    expect(view.output).toHaveLength(days);
    expect(view.output[0]).toMatchObject({ start: NOW - count * HOUR, date: range === 'last-7d' ? '2025-12-25' : '2025-12-02', hour: 6, hours: 18 });
    expect(view.output.at(-1)).toMatchObject({ start: Date.parse('2026-01-01T00:00:00-03:00'), date: '2026-01-01', hour: 0, hours: 6 });
    expect(sum(view.output.map((b) => b.hours ?? 0))).toBe(count);
    for (const b of view.output.slice(1, -1)) expect(b.hours).toBe(24);
    expect(sum(view.output.map((b) => b.targetUnits))).toBe(count * 100);
    expect(sum(view.output.map((b) => b.goodUnits))).toBe(count * 40);
    expect(sum(view.output.map((b) => b.scrapUnits))).toBe(count * 10);
  });
});

describe('performance arithmetic', () => {
  it('uses weighted totals and multiplies rounded parts, and reports fraction point changes', () => {
    const live = [hour(0, { plannedMin: 3, runMin: 2, targetUnits: 3, goodUnits: 1, scrapUnits: 1,
      downtime: [{ reason: 'changeover', minutes: 1 }] })];
    const previous = hour(-24, { targetUnits: 100, goodUnits: 90, scrapUnits: 10, runMin: 60, downtime: [] });
    const view = performanceView(stub([previous]), live, 180, site, 'last-24h');
    expect(view.oee).toEqual({
      value: 0.222, availability: 0.667, performance: 0.667, quality: 0.5,
      previous: { value: 0.9, availability: 1, performance: 1, quality: 0.9 },
      change: { value: -0.678, availability: -0.333, performance: -0.333, quality: -0.4 },
    });
  });

  it('weights hours and Lines by their totals rather than averaging ratios', () => {
    const rows = [hour(0), hour(0, { lineId: 'E2', plannedMin: 20, runMin: 20, targetUnits: 20, goodUnits: 20, scrapUnits: 0, downtime: [] })];
    expect(performanceView(stub(), rows, 1200, site, 'last-24h').oee).toMatchObject({ value: 0.312, availability: 0.625, performance: 0.583, quality: 0.857 });
  });

  it('returns finite zero ratios for zero denominators and detects run minutes or any units', () => {
    expect(performanceView(stub(), [], 0, site, 'last-shift')).toEqual({ hasProduction: false, oee: null, pareto: [], output: [], shifts: [] });
    expect(performanceView(stub(), [], 0, site, 'last-shift').hasProduction).toBe(false);
    for (const overrides of [{ runMin: 1 }, { goodUnits: 1 }, { scrapUnits: 1 }]) {
      const live = [hour(0, { plannedMin: 0, runMin: 0, targetUnits: 0, goodUnits: 0, scrapUnits: 0, downtime: [], ...overrides })];
      expect(performanceView(stub(), live, 100, site, 'last-24h').hasProduction).toBe(true);
    }
  });

  it('sorts Pareto ties by reason id and balances percentage rounding', () => {
    const reasons = ['weld-fault', 'saw-jam', 'minor-stops', 'material-shortage', 'die-change', 'changeover'] as const;
    const view = performanceView(stub([hour(-1, { runMin: 54, downtime: reasons.map((reason) => ({ reason, minutes: 1 })) })]), [], 0, site, 'last-shift');
    expect(view.pareto.map((p) => p.reason)).toEqual([...reasons].sort());
    expect(view.pareto.map((p) => p.sharePct)).toEqual([16.7, 16.7, 16.7, 16.7, 16.6, 16.6]);
    expect(view.pareto.map((p) => p.cumulativePct)).toEqual([16.7, 33.4, 50.1, 66.8, 83.4, 100]);
  });
});

describe.each([0, 30000])('performance conservation at tick %i', (tick) => {
  const live = readHours(d, tick);
  const all = [...d.hourlyOutput, ...live];
  it.each(ranges)('%s balances minutes, output, Pareto and scope totals', (range) => {
    const end = range === 'last-shift' ? NOW + (tick < 28800 ? 0 : 8) * HOUR : range === 'last-24h' ? NOW + (Math.floor(tick / 3600) + 1) * HOUR : NOW;
    const count = range === 'last-shift' ? 8 : range === 'last-24h' ? 24 : range === 'last-7d' ? 168 : 720;
    const window = all.filter((h) => h.hourStart >= end - count * HOUR && h.hourStart < end);
    const totals = scopes.map((scope) => {
      const rows = window.filter((h) => inScope(h, scope));
      const view = performanceView(d, live, tick, scope, range);
      const downtime = sum(view.pareto.map((p) => p.minutes));
      if (!view.hasProduction) {
        expect(view).toEqual({ hasProduction: false, oee: null, pareto: [], output: [], shifts: [] });
        // Hidden idle minutes still contribute when this Line is included in a wider scope.
        return { good: 0, scrap: 0, target: sum(rows.map((h) => h.targetUnits)),
          downtime: sum(rows.flatMap((h) => h.downtime.map((loss) => loss.minutes))), run: 0, planned: sum(rows.map((h) => h.plannedMin)) };
      }
      expect(downtime + sum(rows.map((h) => h.runMin))).toBe(sum(rows.map((h) => h.plannedMin)));
      for (const field of ['targetUnits', 'goodUnits', 'scrapUnits'] as const) {
        expect(sum(view.output.map((b) => b[field]))).toBe(sum(rows.map((h) => h[field])));
      }
      expect(view.oee).toMatchObject(parts(rows));
      expect(view.pareto.every((p) => p.minutes > 0)).toBe(true);
      if (downtime) {
        expect(sum(view.pareto.map((p) => p.sharePct))).toBeCloseTo(100, 10);
        expect(view.pareto.at(-1)?.cumulativePct).toBe(100);
      }
      for (let i = 1; i < view.pareto.length; i++) {
        const a = view.pareto[i - 1]!;
        const b = view.pareto[i]!;
        expect(a.minutes > b.minutes || (a.minutes === b.minutes && a.reason < b.reason)).toBe(true);
        expect(b.cumulativePct).toBeGreaterThanOrEqual(a.cumulativePct);
        expect(b.cumulativePct).toBeLessThanOrEqual(100);
      }
      return { good: sum(view.output.map((b) => b.goodUnits)), scrap: sum(view.output.map((b) => b.scrapUnits)),
        target: sum(view.output.map((b) => b.targetUnits)), downtime, run: sum(rows.map((h) => h.runMin)), planned: sum(rows.map((h) => h.plannedMin)) };
    });
    for (const key of ['good', 'scrap', 'target', 'downtime', 'run', 'planned'] as const) {
      expect(totals[0]![key]).toBe(sum(totals.slice(1, 4).map((t) => t[key])));
      expect(totals[0]![key]).toBe(sum(totals.slice(4).map((t) => t[key])));
    }
  });
});

describe('performance Shift history and purity', () => {
  it('rebuilds 30 completed history Shifts for every scope and ignores stored Shift records', () => {
    for (const scope of scopes) {
      const view = performanceView(d, [], 0, scope, 'last-shift');
      if (!view.hasProduction) continue;
      expect(view.shifts).toHaveLength(30);
      expect(view.shifts).toEqual(performanceView({ ...d, shiftHistory: [] }, [], 0, scope, 'last-30d').shifts);
      for (const [i, shift] of view.shifts.entries()) {
        const records = d.shiftHistory.filter((r) => r.date === shift.date && r.shift === shift.shift && inScope({ ...r, hourStart: 0 }, scope));
        expect(shift.startsAt).toBe(NOW - (i + 1) * 8 * HOUR);
        expect(shift.oee).toBe(parts(records).value);
        for (const field of ['goodUnits', 'scrapUnits', 'targetUnits'] as const) expect(shift[field]).toBe(sum(records.map((r) => r[field])));
      }
      const ascending = [...view.shifts].reverse();
      expect(view.shifts.filter((s) => s.best)).toEqual([ascending.reduce((a, b) => b.oee > a.oee ? b : a)]);
      expect(view.shifts.filter((s) => s.worst)).toEqual([ascending.reduce((a, b) => b.oee < a.oee ? b : a)]);
    }
  });

  it('includes a newly completed live Shift but excludes the current partial Shift', () => {
    const live = Array.from({ length: 9 }, (_, i) => hour(i));
    const view = performanceView(stub(), live, 30000, site, 'last-24h');
    expect(view.shifts[0]).toMatchObject({ date: '2026-01-01', shift: 'S1', startsAt: NOW, oee: 0.2, goodUnits: 320, scrapUnits: 80, targetUnits: 800 });
    expect(view.shifts.every((s) => s.startsAt < NOW + 8 * HOUR)).toBe(true);
  });

  it('marks no Shift when all 30 OEE values tie', () => {
    const dataset = stub(Array.from({ length: 240 }, (_, i) => hour(i - 240)));
    const view = performanceView(dataset, [], 0, site, 'last-24h');
    expect(view.shifts).toHaveLength(30);
    expect(view.shifts.filter((s) => s.best || s.worst)).toEqual([]);
  });

  it('marks no Shift with fewer than two recorded Shifts', () => {
    const view = performanceView(stub([hour(-1)]), [], 0, site, 'last-shift');
    expect(view.shifts).toHaveLength(1);
    expect(view.shifts.filter((s) => s.best || s.worst)).toEqual([]);
  });

  // C1 is the idle Line: its last finished Batch ended more than 8 hours (but less than 24) before load.
  it.each(['last-shift', 'last-24h'] as const)('has production for E1 in %s', (range) => {
    expect(performanceView(d, [], 0, { kind: 'line', lineId: 'E1' }, range).hasProduction).toBe(true);
  });

  it('has no production for the idle Line C1 in the last Shift, so Screen 4 can show its empty state', () => {
    const idle = performanceView(d, [], 0, { kind: 'line', lineId: 'C1' }, 'last-shift');
    const units = sum(idle.output.map((b) => b.goodUnits + b.scrapUnits));
    expect(idle.hasProduction, `C1 last-shift contains ${units} units`).toBe(false);
    expect(idle).toEqual({ hasProduction: false, oee: null, pareto: [], output: [], shifts: [] });
  });

  it('still shows the production C1 made before it went idle in the last 24 hours', () => {
    expect(performanceView(d, [], 0, { kind: 'line', lineId: 'C1' }, 'last-24h').hasProduction).toBe(true);
  });

  it('is deterministic with frozen inputs and owns all returned data', () => {
    const dataset = freeze(structuredClone(d));
    const live = freeze(readHours(dataset, 30000));
    const before = JSON.stringify({ dataset, live });
    const a = performanceView(dataset, live, 30000, freeze(site), 'last-30d');
    expect(a).toEqual(performanceView(dataset, live, 30000, site, 'last-30d'));
    a.pareto[0]!.minutes = -1;
    a.output[0]!.goodUnits = -1;
    a.shifts[0]!.goodUnits = -1;
    expect(JSON.stringify({ dataset, live })).toBe(before);
    expect(performanceView(dataset, live, 30000, site, 'last-30d').pareto[0]!.minutes).toBeGreaterThan(0);
  });

  it('computes site/last-30d with median under 100 ms', () => {
    const live = readHours(d, 30000);
    const elapsed: number[] = [];
    for (let i = 0; i < 9; i++) {
      const start = performance.now();
      performanceView(d, live, 30000, site, 'last-30d');
      elapsed.push(performance.now() - start);
    }
    const median = [...elapsed].sort((a, b) => a - b)[4]!;
    console.info(`performance site/last-30d median: ${median.toFixed(3)} ms; max: ${Math.max(...elapsed).toFixed(3)} ms`);
    expect(median).toBeLessThan(100);
  });
});

describe('Screen 4 session invariants', () => {
  it.each(['last-7d', 'last-30d'] as const)('keeps E2 %s totals, OEE, Pareto and output fixed through actions', (range) => {
    let state = createPlantState(d);
    const baseline = performanceView(d, [], 0, { kind: 'line', lineId: 'E2' }, range);
    const tag = d.tags.find((t) => t.lineId === 'E2' && t.writable)!;
    for (const tick of [0, 100, 3600, 30000]) {
      for (const action of [{ type: 'pause', lineId: 'E2' }, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'Check fixed history' }] as const) {
        const result = reduce(state, action, { tick });
        if (!result.ok) throw new Error(result.error.code);
        state = result.state;
      }
      const view = performanceView(d, readHours(d, tick, state.overlay), tick, { kind: 'line', lineId: 'E2' }, range);
      expect(view.oee).toEqual(baseline.oee);
      expect(view.pareto).toEqual(baseline.pareto);
      expect(view.output).toEqual(baseline.output);
      expect(view).toEqual(baseline);
    }
  });

  it('uses null previous and change when the adjacent previous range has no production', () => {
    const view = performanceView(stub([hour(-1), hour(-9, { runMin: 0, goodUnits: 0, scrapUnits: 0 })]), [], 0, site, 'last-shift');
    expect(view.oee).toMatchObject({ previous: null, change: null });
  });

  it('does not display zero quality for run minutes without units', () => {
    const view = performanceView(stub([hour(-1, { goodUnits: 0, scrapUnits: 0 })]), [], 0, site, 'last-shift');
    expect(view.hasProduction).toBe(true);
    expect(view.oee?.quality).toBeNull();
  });

  it('multiplies displayed OEE parts across scopes, ranges and ticks', () => {
    for (const tick of [0, 100, 1800, 3600, 28799, 28800, 30000]) {
      for (const scope of scopes) for (const range of ranges) {
        const value = performanceView(d, readHours(d, tick), tick, scope, range).oee;
        if (scope.kind === 'line' && scope.lineId === 'E1') expect(value).not.toBeNull();
        for (const parts of [value, value?.previous]) {
          if (parts && parts.quality !== null) expect(parts.value).toBe(round3(parts.availability * parts.performance * parts.quality));
        }
      }
    }
  });

  it('carries Sao Paulo local dates and hours on every bucket', () => {
    for (const range of ranges) {
      for (const bucket of performanceView(d, [], 0, site, range).output) {
        const local = new Date(bucket.start - 3 * HOUR);
        expect(bucket.date).toBe(local.toISOString().slice(0, 10));
        expect(bucket.hour).toBe(local.getUTCHours());
      }
    }
  });
});
