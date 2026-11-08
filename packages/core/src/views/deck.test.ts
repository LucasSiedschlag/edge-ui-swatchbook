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
      expect(v.kpis).toEqual({ oee: live.oee, availability: live.availability, performance: live.performance, quality: live.quality,
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
    for (const tick of [0, 1, 100, 400, 3600]) checkActions(state, tick);
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
