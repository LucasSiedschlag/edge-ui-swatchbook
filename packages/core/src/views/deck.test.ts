import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { createPlantState, lineStatus, reduce, type PlantAction, type PlantState } from '../plant';
import { simulate } from '../sim/simulate';
import { criticalBannerView } from './banner';
import { deckView } from './deck';

const d = generateMockDataset();
const state = createPlantState(d);

describe('Operations Live Deck', () => {
  it('validates Line and tick before selecting', () => {
    const snapshot = simulate(d, 0, state.overlay);
    expect(() => deckView(state, snapshot, 'missing' as 'E1', 0)).toThrow('unknown line');
    expect(() => deckView(state, snapshot, 'E1', -1)).toThrow('tick must be 0 or more');
  });
  it.each(['E1', 'A2', 'C1'] as const)('projects each field from the shared sources for %s', lineId => {
    for (const tick of [0, 100, 3600]) {
      const snapshot = simulate(d, tick, state.overlay);
      const v = deckView(state, snapshot, lineId, tick);
      const live = snapshot.lines.find(l => l.lineId === lineId)!;
      const status = lineStatus(state, lineId, tick);
      expect(v.lines).toEqual(d.lines.map(l => ({ id: l.id, ...lineStatus(state, l.id, tick) })));
      expect(v.selected).toEqual({ id: lineId, status: status.status, stopReason: status.reason, criticalAlarms: status.criticalAlarms });
      expect(v.kpis).toEqual({ kind: d.lines.find(l => l.id === lineId)!.type === 'assembly' ? 'cycle' : 'lineSpeed', oee: live.oee, availability: live.availability, performance: live.performance, quality: live.quality,
        outputThisShift: live.outputThisShift, scrapThisShift: live.scrapThisShift, cycle: live.cycle, lineSpeed: live.lineSpeed });
      expect(v.banner).toEqual(criticalBannerView(state, tick, lineId));
      expect(v.shift).toEqual({ id: snapshot.shift.shift, startsAt: snapshot.shift.startsAt, endsAt: snapshot.shift.endsAt, remainingMs: snapshot.shift.remainingMs });
      expect(v.emptyBatch).toBe(live.batch === null);
      if (!live.batch) expect(v.batch).toBeNull();
      else {
        const b = d.activeBatches.find(b => b.id === live.batch!.batchId)!;
        expect(v.batch).toEqual({ ...live.batch, productCode: d.products.find(p => p.id === b.productId)!.code,
          recipeVersion: d.recipeVersions.find(r => r.id === b.recipeVersionId)!.number, start: b.start });
      }
    }
  });
  it('pins the E1 Critical banner, A2 Fault and C1 empty state at load', () => {
    const snap = simulate(d, 0, state.overlay);
    expect(deckView(state, snap, 'E1', 0).selected.status).toBe('alarm');
    expect(deckView(state, snap, 'E1', 0).banner.count).toBeGreaterThan(0);
    expect(deckView(state, snap, 'A2', 0).selected).toMatchObject({ status: 'stopped', stopReason: 'fault' });
    expect(deckView(state, snap, 'C1', 0)).toMatchObject({ emptyBatch: true, batch: null });
  });
  it('takes KPI numbers and progress verbatim from the supplied Snapshot', () => {
    const snap = simulate(d, 0, state.overlay);
    const live = snap.lines.find(l => l.lineId === 'E1')!;
    live.oee = 0.123;
    live.outputThisShift = 12345;
    live.scrapThisShift = 99;
    live.batch!.percent = 17;
    live.batch!.elapsedMs = 123;
    const v = deckView(state, snap, 'E1', 0);
    expect(v.kpis).toMatchObject({ oee: 0.123, outputThisShift: 12345, scrapThisShift: 99 });
    expect(v.batch).toMatchObject({ percent: 17, elapsedMs: 123 });
  });
});


function checkActions(s: PlantState, tick: number): void {
  const snapshot = simulate(d, tick, s.overlay);
  for (const line of d.lines) {
    const v = deckView(s, snapshot, line.id, tick);
    for (const [flag, action] of [
      ['pause', { type: 'pause', lineId: line.id }], ['resume', { type: 'resume', lineId: line.id }],
      ['emergencyStop', { type: 'emergency-stop', lineId: line.id, confirmed: true }], ['reset', { type: 'reset', lineId: line.id }],
    ] as const) {
      const result = reduce(s, action, { tick });
      expect(v.actions[flag], `${line.id} ${tick} ${flag}`).toBe(result.ok && result.events.length > 0);
    }
    expect(v.actions.shiftHandover).toBe(true);
    const status = lineStatus(s, line.id, tick);
    expect(v.selected).toEqual({ id: line.id, status: status.status, stopReason: status.reason, criticalAlarms: status.criticalAlarms });
    expect(v.banner).toEqual(criticalBannerView(s, tick, line.id));
    expect(v.kpis.oee).toBe(snapshot.lines.find(l => l.lineId === line.id)!.oee);
  }
}

describe('Deck action availability', () => {
  it('equals reducer changes on every Line at several ticks', () => {
    for (const tick of [0, 1, 50, 100, 400, 900, 3600, 86400]) checkActions(state, tick);
  });
  it('equals reducer changes after actual Pause, Emergency stop, Reset and Resume on every Line', () => {
    let resumes = 0;
    for (const line of d.lines) {
      let s = state;
      let tick = 10;
      for (const type of ['pause', 'emergency-stop', 'reset', 'resume'] as const) {
        const action: PlantAction = type === 'emergency-stop' ? { type, lineId: line.id, confirmed: true } : { type, lineId: line.id };
        const result = reduce(s, action, { tick });
        if (type !== 'resume') expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.events.length).toBeGreaterThan(0);
          s = result.state;
          if (type === 'resume') resumes++;
        } else expect(result.error.code).toBe('critical-alarm-active');
        checkActions(s, tick);
        checkActions(s, tick + 2);
        checkActions(s, 3600);
        checkActions(s, 86400);
        tick += 10;
      }
    }
    expect(resumes).toBeGreaterThan(0);
  });
  it('requires Emergency stop confirmation and exposes each resulting stop reason', () => {
    expect(reduce(state, { type: 'emergency-stop', lineId: 'E2', confirmed: false }, { tick: 10 })).toEqual({ ok: false, error: { code: 'confirmation-required' } });
    let s = state;
    for (const [type, reason] of [['pause', 'paused'], ['emergency-stop', 'emergency-stop'], ['reset', 'paused']] as const) {
      const action: PlantAction = type === 'emergency-stop' ? { type, lineId: 'E2', confirmed: true } : { type, lineId: 'E2' };
      const result = reduce(s, action, { tick: 10 });
      if (!result.ok) throw new Error(result.error.code);
      s = result.state;
      expect(deckView(s, simulate(d, 10, s.overlay), 'E2', 10).selected.stopReason).toBe(reason);
    }
  });
});

it('exports deckView from core', async () => {
  expect((await import('../index') as Record<string, unknown>).deckView).toBeTypeOf('function');
});

it('is deterministic and does not mutate a deeply frozen dataset, Plant State or Snapshot', () => {
  function freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      if (value instanceof Map) {
        for (const [key, item] of value) { freeze(key); freeze(item); }
        for (const method of ['set', 'delete', 'clear']) Object.defineProperty(value, method, { value: () => { throw new Error('frozen Map'); } });
      }
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  const dataset = freeze(generateMockDataset());
  const paused = reduce(createPlantState(dataset), { type: 'pause', lineId: 'E2' }, { tick: 10 });
  if (!paused.ok) throw new Error(paused.error.code);
  const s = freeze(paused.state);
  const before = JSON.stringify(s, (_, value) => value instanceof Map ? [...value] : value);
  for (const tick of [10, 100, 10]) {
    const snap = freeze(simulate(dataset, tick, s.overlay));
    const beforeSnapshot = JSON.stringify(snap);
    for (const line of dataset.lines) expect(deckView(s, snap, line.id, tick)).toEqual(deckView(s, snap, line.id, tick));
    expect(JSON.stringify(snap)).toBe(beforeSnapshot);
  }
  expect(JSON.stringify(s, (_, value) => value instanceof Map ? [...value] : value)).toBe(before);
});

it('reports deckView median timing for all seven Lines', () => {
  const tick = 100;
  const snap = simulate(d, tick, state.overlay);
  for (const line of d.lines) deckView(state, snap, line.id, tick);
  const times = Array.from({ length: 9 }, () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) for (const line of d.lines) deckView(state, snap, line.id, tick);
    return (performance.now() - start) / 70;
  }).sort((a, b) => a - b);
  console.info(`deckView median: ${times[4]!.toFixed(3)} ms per call`);
  expect(times[4]).toBeLessThan(50);
});

it('uses the reducer effective tick after Pause and rejects stale Snapshots', () => {
  const paused = reduce(state, { type: 'pause', lineId: 'E2' }, { tick: 50 });
  if (!paused.ok) throw new Error(paused.error.code);
  const s = paused.state;
  const snap = simulate(d, 50, s.overlay);
  expect(deckView(s, snap, 'E2', 49)).toEqual(deckView(s, snap, 'E2', 50));
  expect(deckView(s, snap, 'E2', 49).selected.stopReason).toBe('paused');
  expect(() => deckView(s, simulate(d, 49, s.overlay), 'E2', 49)).toThrow('snapshot tick must match effective tick 50');
  expect(() => deckView(s, simulate(d, 51, s.overlay), 'E2', 50)).toThrow('snapshot tick must match effective tick 50');
  expect(() => deckView(s, simulate(d, 50, state.overlay), 'E2', 50)).toThrow('snapshot overlay must match Plant State');
  expect(() => deckView(s, simulate(d, 50), 'E2', 50)).toThrow('snapshot overlay must match Plant State');
  const equivalent = { ...s.overlay };
  expect(() => deckView(s, simulate(d, 50, equivalent), 'E2', 50)).toThrow('snapshot overlay must match Plant State');
});

it('keeps paused Resume probes cheap at late ticks, including uncached actions', () => {
  const paused = reduce(state, { type: 'pause', lineId: 'E2' }, { tick: 50 });
  if (!paused.ok) throw new Error(paused.error.code);
  const measurements: { tick: number; fresh: number; cached: number }[] = [];
  for (const tick of [3600, 86400, 604800]) {
    const s = paused.state;
    const snapshot = simulate(d, tick, s.overlay);
    // Warm the existing Alarm timeline, as the Deck status already does before asking for actions.
    lineStatus(s, 'E2', tick);
    const fresh = Array.from({ length: 9 }, () => {
      const source = { ...s };
      const start = performance.now();
      deckView(source, snapshot, 'E2', tick);
      return performance.now() - start;
    }).sort((a, b) => a - b)[4]!;
    deckView(s, snapshot, 'E2', tick);
    const cached = Array.from({ length: 9 }, () => {
      const start = performance.now();
      deckView(s, snapshot, 'E2', tick);
      return performance.now() - start;
    }).sort((a, b) => a - b)[4]!;
    console.info(`paused Resume ${tick / 3600} h: uncached ${fresh.toFixed(3)} ms; cached ${cached.toFixed(3)} ms`);
    measurements.push({ tick, fresh, cached });
  }
  const at = (tick: number) => measurements.find(m => m.tick === tick)!;
  // The old code rebuilt the whole history, so its cost grew about 60 times from 1 hour to 7 days. The growth is what we
  // guard, because it survives a busy machine better than a tight absolute bound. The absolute bound is only a safety net.
  expect(at(86400).fresh).toBeLessThan(25);
  expect(at(86400).cached).toBeLessThan(25);
  expect(at(604800).fresh / Math.max(at(3600).fresh, 0.05)).toBeLessThan(15);
});

it('keeps KPI kind tied to Line type while paused, idle or finished', () => {
  for (const line of d.lines) {
    const result = reduce(state, { type: 'pause', lineId: line.id }, { tick: 50 });
    if (!result.ok) throw new Error(result.error.code);
    for (const s of [state, result.state]) for (const tick of [50, 86400]) {
      const view = deckView(s, simulate(d, tick, s.overlay), line.id, tick);
      expect(view.kpis.kind).toBe(line.type === 'assembly' ? 'cycle' : 'lineSpeed');
      if (line.type === 'assembly' && s === result.state) expect(view.kpis.cycle).toBeNull();
    }
  }
});

it('reads the active Batch Recipe Version from Plant State', () => {
  const session = { ...state, recipeVersions: state.recipeVersions.map(v => ({ ...v, number: v.number + 100 })) };
  const view = deckView(session, simulate(d, 0, session.overlay), 'E2', 0);
  const batch = d.activeBatches.find(b => b.lineId === 'E2')!;
  expect(view.batch!.recipeVersion).toBe(session.recipeVersions.find(v => v.id === batch.recipeVersionId)!.number);
});
