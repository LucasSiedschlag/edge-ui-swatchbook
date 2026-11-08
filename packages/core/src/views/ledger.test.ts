import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { batchDetail, canCompare, compareBatches, MAX_COMPARE, toggleSelection, ledgerView } from './ledger';

import { alarmList, createPlantState } from '../plant';
import { alarmListView } from './alarms';

const d = generateMockDataset();
const state = createPlantState(d);

describe('ledger rows', () => {
  it('includes exactly the 5000 finished Batches and every column', () => {
    const v = ledgerView(d, {});
    expect(v.rowCount).toBe(5000);
    expect(v.totalCount).toBe(d.batches.length);
    expect(v.empty).toBe(false);
    expect(v.activeFilters).toEqual([]);
    const b = d.batches[0]!;
    expect(v.rows.find(r => r.batchId === b.id)).toEqual({
      batchId: b.id, lotId: b.lotId, upstreamLotId: d.lots.find(l => l.id === b.lotId)!.upstreamLotId,
      areaId: d.lines.find(l => l.id === b.lineId)!.areaId, lineId: b.lineId,
      productId: b.productId, productCode: d.products.find(p => p.id === b.productId)!.code,
      recipeVersionId: b.recipeVersionId, recipeVersion: d.recipeVersions.find(r => r.id === b.recipeVersionId)!.number,
      shift: b.shift, start: b.start, end: b.end, durationMinutes: (b.end - b.start) / 60000,
      status: b.status, yieldPct: b.yieldPct, scrap: b.scrap,
    });
    expect(v.rows.every(r => !d.activeBatches.some(b => b.id === r.batchId))).toBe(true);
  });

  it('defaults to start descending and Batch id ascending for ties', () => {
    const sample = { ...d, batches: ['z', 'a', 'm'].map((id, i) => ({ ...d.batches[0]!, id, start: i === 2 ? 0 : 1 })) };
    expect(ledgerView(sample, {}).rows.map(r => r.batchId)).toEqual(['a', 'z', 'm']);
  });
});

const sample = {
  ...d,
  batches: [
    { ...d.batches[0]!, id: 'b', lineId: 'E1' as const, shift: 'S1' as const, start: 1000, end: 121000, yieldPct: 90, scrap: 10, status: 'completed' as const },
    { ...d.batches[1]!, id: 'A', lineId: 'A1' as const, shift: 'S2' as const, start: 2000, end: 182000, yieldPct: 95, scrap: 5, status: 'rework' as const },
    { ...d.batches[2]!, id: 'a', lineId: 'C1' as const, shift: 'S3' as const, start: 3000, end: 243000, yieldPct: 95, scrap: 0, status: 'aborted' as const },
  ],
};
const ids = (filters: import('./ledger').LedgerFilters) => ledgerView(sample, { filters }).rows.map(r => r.batchId);

describe('ledger filters and ordering', () => {
  it('applies each choice filter and AND combinations', () => {
    expect(ids({ areas: ['extrusion'] })).toEqual(['b']);
    expect(ids({ lines: ['A1'] })).toEqual(['A']);
    expect(ids({ shifts: ['S3'] })).toEqual(['a']);
    expect(ids({ statuses: ['rework'] })).toEqual(['A']);
    const product = sample.batches[0]!.productId;
    expect(ids({ products: [product] })).toEqual(sample.batches.filter(b => b.productId === product).reverse().map(b => b.id));
    expect(ids({ yield: { min: 95 }, scrap: { max: 5 }, lines: ['A1'], shifts: ['S2'] })).toEqual(['A']);
    expect(ids({ areas: ['extrusion'], lines: ['A1'] })).toEqual([]);
  });
  it.each(['areas', 'lines', 'products', 'shifts', 'statuses'] as const)('%s empty list leaves rows and active filters unchanged', key => {
    const v = ledgerView(sample, { filters: { [key]: [] } });
    expect(v).toMatchObject({ rowCount: 3, totalCount: 3, empty: false });
    expect(v.activeFilters).toEqual([]);
  });
  it('uses inclusive numeric ranges', () => {
    expect(ids({ yield: { min: 95, max: 95 } })).toEqual(['a', 'A']);
    expect(ids({ scrap: { min: 5, max: 10 } })).toEqual(['A', 'b']);
    expect(ids({ duration: { min: 2, max: 3 } })).toEqual(['A', 'b']);
    expect(ids({ duration: { max: 2 } })).toEqual(['b']);
    expect(ids({ yield: { min: 96 } })).toEqual([]);
    expect(() => ids({ scrap: { min: 10, max: 5 } })).toThrow('scrap min must not exceed max');
  });
  it('filters each ID column independently with case folding and trimming', () => {
    for (const column of ['batchId', 'lotId', 'upstreamLotId'] as const) {
      const v = ledgerView(d, { filters: { [column]: '  e1  ' } });
      expect(v.rows.length).toBeGreaterThan(0);
      expect(v.rows.every(r => r[column]?.toLowerCase().includes('e1'))).toBe(true);
      expect(v.activeFilters).toEqual([{ column, value: 'e1' }]);
      expect(ledgerView(d, { filters: { [column]: '  ' } }).activeFilters).toEqual([]);
    }
    expect(ledgerView(d, { filters: { batchId: 'E1' } }).rowCount).toBe(700);
    const upstream = ledgerView(d, { filters: { upstreamLotId: 'E1' } }).rows;
    expect(upstream.every(r => r.areaId === 'assembly')).toBe(true);
    expect(upstream.map(r => r.batchId).sort()).toEqual(d.batches.filter(b =>
      d.lots.find(l => l.id === b.lotId)!.upstreamLotId?.includes('E1')).map(b => b.id).sort());
    expect(ledgerView(d, { filters: { batchId: 'E1', upstreamLotId: 'E1' } }).empty).toBe(true);
  });
  it('reports set filters in fixed column order and copies their values', () => {
    const filters = { duration: {}, start: {}, scrap: { max: 0 }, yield: {}, statuses: [], shifts: [], products: [], lines: [], areas: [], batchId: ' b ' };
    const active = ledgerView(sample, { filters }).activeFilters;
    expect(active).toEqual([
      { column: 'batchId', value: 'b' }, { column: 'scrap', value: { max: 0 } },
    ]);
    expect(active.find(f => f.column === 'scrap')!.value).not.toBe(filters.scrap);
  });
  it('sorts every column both ways, keeping Batch id ties ascending', () => {
    const columns = Object.keys(ledgerView(d, {}).rows[0]!) as import('./ledger').LedgerColumn[];
    for (const column of columns) for (const direction of ['asc', 'desc'] as const) {
      const rows = ledgerView(d, { sort: { column, direction } }).rows;
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1]!, b = rows[i]!;
        if (a[column] === b[column]) expect(a.batchId <= b.batchId).toBe(true);
        else if (a[column] === null) expect(direction).toBe('asc');
        else if (b[column] === null) expect(direction).toBe('desc');
        else expect(direction === 'asc' ? a[column]! < b[column]! : a[column]! > b[column]!).toBe(true);
      }
    }
    expect(ledgerView(sample, { sort: { column: 'batchId', direction: 'asc' } }).rows.map(r => r.batchId)).toEqual(['A', 'a', 'b']);
  });
  it('rejects unknown choice ids and non-finite bounds at entry', () => {
    expect(() => ledgerView(d, { filters: { lines: ['missing' as 'E1'] } })).toThrow();
    expect(() => ledgerView(d, { filters: { products: ['missing'] } })).toThrow();
    expect(() => ledgerView(d, { filters: { yield: { min: NaN } } })).toThrow();
  });
});


describe('ledger selection and comparison', () => {
  it('pins the exact fifth-selection trace and deselection', () => {
    expect(MAX_COMPARE).toBe(4);
    let selected: string[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const v = toggleSelection(selected, id);
      expect(v.result).toBe('selected');
      selected = v.selected;
    }
    expect(selected).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleSelection(selected, 'e')).toEqual({ selected, result: 'selection-limit' });
    expect(toggleSelection(selected, 'e').selected).toBe(selected);
    expect(toggleSelection(selected, 'b')).toEqual({ selected: ['a', 'c', 'd'], result: 'deselected' });
    expect(selected).toEqual(['a', 'b', 'c', 'd']);
    for (let n = 0; n <= 5; n++) expect(canCompare(Array.from({ length: n }, (_, i) => String(i)))).toBe(n >= 2 && n <= 4);
  });
  it('validates counts and unknown finished Batch ids', () => {
    for (const ids of [[], ['x'], ['a', 'b', 'c', 'd', 'e']]) expect(compareBatches(d, ids)).toEqual({ error: 'compare-count' });
    expect(compareBatches(d, [d.batches[0]!.id, 'missing'])).toEqual({ error: 'unknown-batch' });
    expect(compareBatches(d, [d.batches[0]!.id, d.activeBatches[0]!.id])).toEqual({ error: 'unknown-batch' });
  });
  it.each([2, 3, 4])('compares %i Batches in input order with the union of run and process Parameters', count => {
    const batches = ['E1', 'A1', 'P1', 'C1'].slice(0, count).map(line => d.batches.find(b => b.lineId === line)!);
    const v = compareBatches(d, batches.map(b => b.id));
    if ('error' in v) throw new Error(v.error);
    expect(v.columns.map(c => c.batchId)).toEqual(batches.map(b => b.id));
    const expectedKeys = new Set<string>();
    for (const [i, b] of batches.entries()) {
      expect(v.columns[i]).toEqual({ batchId: b.id, durationMinutes: (b.end - b.start) / 60000, yieldPct: b.yieldPct, scrap: b.scrap, status: b.status, lineId: b.lineId });
      const parameters = d.recipeVersions.find(v => v.id === b.recipeVersionId)!.steps.filter(s => s.kind === 'run' || s.kind === 'process').flatMap(s => s.parameters);
      for (const p of parameters) expectedKeys.add(p.key);
      for (const row of v.parameters) {
        const p = parameters.find(p => p.key === row.key);
        expect(row.values[i]).toEqual(p ? { actual: b.actuals[p.key], setpoint: p.setpoint, deviationPct: p.setpoint === 0 ? null : (b.actuals[p.key]! - p.setpoint) / Math.abs(p.setpoint) * 100 } : null);
        if (p) expect(row.name).toEqual(p.name);
      }
    }
    expect(v.parameters.map(p => p.key)).toEqual([...expectedKeys].sort());
  });
});


describe('Batch detail', () => {
  it('rejects unknown Batches and negative ticks at entry', () => {
    expect(batchDetail(state, 0, 'missing')).toEqual({ error: 'unknown-batch' });
    expect(() => batchDetail(state, -1, 'missing')).toThrow('tick must be 0 or more');
  });
  it.each(d.lines.map(l => l.id))('preserves the Genealogy chain on %s for early and recent Batches', lineId => {
    const batches = d.batches.filter(b => b.lineId === lineId);
    for (const b of [...batches.slice(0, 3), ...batches.slice(-3)]) {
      const detail = batchDetail(state, 0, b.id);
      if ('error' in detail) throw new Error(detail.error);
      const g = d.genealogies.find(g => g.lotId === b.lotId)!;
      const expected = (['materialLot', 'extrusion', 'metalwork', 'assembly'] as const).flatMap(kind => {
        const node = g[kind];
        return node ? [{ kind, ...node, linked: node.batchId !== null && node.batchId !== b.id && [...d.batches, ...d.activeBatches].some(b => b.id === node.batchId) }] : [];
      });
      expect(detail.genealogy).toEqual(expected);
      expect(detail.header).toEqual({ batchId: b.id, lotId: b.lotId, status: b.status, lineId: b.lineId, productCode: d.products.find(p => p.id === b.productId)!.code, start: b.start, end: b.end });
      if (lineId.startsWith('E')) expect(detail.genealogy.map(n => n.kind)).toEqual(['materialLot', 'extrusion']);
      if (lineId.startsWith('A')) expect(detail.genealogy.map(n => n.kind)).toEqual(['materialLot', 'extrusion', 'metalwork', 'assembly']);
      expect(detail.genealogy.filter(n => n.lotId.includes('-PRE-')).every(n => !n.linked)).toBe(true);
    }
  });
  it('reports every run/process Parameter actual, limits and setpoint', () => {
    for (const line of d.lines) {
      const b = d.batches.find(b => b.lineId === line.id)!;
      const detail = batchDetail(state, 0, b.id);
      if ('error' in detail) throw new Error(detail.error);
      const params = d.recipeVersions.find(v => v.id === b.recipeVersionId)!.steps.filter(s => s.kind === 'run' || s.kind === 'process').flatMap(s => s.parameters);
      expect(detail.parameters).toEqual(params.map(p => ({ parameterId: p.id, key: p.key, name: p.name, unit: p.unit, min: p.min, max: p.max, actual: b.actuals[p.key], setpoint: p.setpoint, deviationPct: p.setpoint === 0 ? null : (b.actuals[p.key]! - p.setpoint) / Math.abs(p.setpoint) * 100, insideLimits: b.actuals[p.key]! >= p.min && b.actuals[p.key]! <= p.max })));
    }
  });
  it('uses the Alarm list row shape and includes cleared Alarms linked by Batch id', () => {
    const tick = 100;
    const list = alarmList(state, tick);
    const allRows = alarmListView(state, tick, { states: ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'] }).rows;
    const batchIds = [...new Set(list.map(a => a.batchId).filter((id): id is string => id !== null))];
    expect(batchIds.length).toBeGreaterThan(0);
    for (const id of batchIds) {
      const detail = batchDetail(state, tick, id);
      if ('error' in detail) throw new Error(detail.error);
      const alarmIds = new Set(list.filter(a => a.batchId === id).map(a => a.id));
      expect(detail.alarms).toEqual(allRows.filter(a => alarmIds.has(a.id)));
    }
  });
  it('shows running Batch header and Genealogy without inventing actuals or an end', () => {
    const b = d.activeBatches[0]!;
    const detail = batchDetail(state, 50, b.id);
    if ('error' in detail) throw new Error(detail.error);
    expect(detail.header).toMatchObject({ batchId: b.id, status: 'running', end: null });
    expect(detail.parameters.length).toBeGreaterThan(0);
    expect(detail.parameters.every(p => p.actual === null && p.deviationPct === null && p.insideLimits === null)).toBe(true);
    expect(detail.genealogy.some(n => n.batchId === b.id && !n.linked)).toBe(true);
  });
});

it('rejects unknown sort fields even on an empty Ledger', () => {
  expect(() => ledgerView({ ...d, batches: [] }, { sort: { column: 'missing' as 'start', direction: 'asc' } })).toThrow('unknown ledger column');
  expect(() => ledgerView(d, { sort: { column: 'start', direction: 'bad' as 'asc' } })).toThrow('unknown ledger direction');
});

it('uses literal Parameter deviations, inclusive limits and unknown values', () => {
  const original = d.recipeVersions[0]!;
  const source = original.steps[0]!;
  const template = source.parameters[0]!;
  const version = { ...original, steps: [{ ...source, kind: 'run' as const, parameters: [
    { ...template, key: 'positive', setpoint: 100, min: 90, max: 110 },
    { ...template, key: 'negative', setpoint: -100, min: -110, max: -90 },
    { ...template, key: 'zero', setpoint: 0, min: -1, max: 1 },
    { ...template, key: 'missing', setpoint: 10, min: 0, max: 20 },
  ] }] };
  const b = { ...d.batches[0]!, recipeVersionId: version.id, actuals: { positive: 110, negative: -110, zero: 2 } };
  const second = { ...b, id: 'second-batch' };
  const dataset = { ...d, batches: [b, second], recipeVersions: [version] };
  const detail = batchDetail({ ...state, dataset, recipeVersions: [version] }, 0, b.id);
  if ('error' in detail) throw new Error(detail.error);
  expect(detail.parameters.map(p => [p.actual, p.setpoint, p.deviationPct, p.insideLimits])).toEqual([
    [110, 100, 10, true], [-110, -100, -10, true], [2, 0, null, false], [null, 10, null, null],
  ]);
  const compared = compareBatches(dataset, [b.id, second.id]);
  if ('error' in compared) throw new Error(compared.error);
  expect(compared.columns.map(c => c.batchId)).toEqual([b.id, second.id]);
  expect(compared.parameters.find(p => p.key === 'zero')!.values).toEqual([
    { actual: 2, setpoint: 0, deviationPct: null }, { actual: 2, setpoint: 0, deviationPct: null },
  ]);
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    if (value instanceof Map) {
      for (const [key, item] of value) { deepFreeze(key); deepFreeze(item); }
      for (const method of ['set', 'delete', 'clear']) Object.defineProperty(value, method, { value: () => { throw new Error('frozen Map'); } });
    }
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

it('is deterministic on deeply frozen inputs and protects cached rows from caller writes', () => {
  const dataset = deepFreeze(generateMockDataset());
  const s = deepFreeze(createPlantState(dataset));
  const before = JSON.stringify(s, (_, value) => value instanceof Map ? [...value] : value);
  const query = deepFreeze({ filters: { lines: ['E1' as const], scrap: { min: 1 } }, sort: { column: 'yieldPct' as const, direction: 'desc' as const } });
  const first = ledgerView(dataset, query);
  expect(ledgerView(dataset, query)).toEqual(first);
  expect(() => { first.rows[0]!.scrap = -1; }).toThrow();
  first.rows.pop();
  expect(ledgerView(dataset, query).rowCount).toBe(first.rowCount);
  const ids = deepFreeze(dataset.batches.slice(0, 4).map(b => b.id));
  expect(compareBatches(dataset, ids)).toEqual(compareBatches(dataset, ids));
  expect(toggleSelection(ids, 'fifth').selected).toBe(ids);
  for (const tick of [0, 100, 0]) {
    const id = dataset.activeBatches[0]!.id;
    expect(batchDetail(s, tick, id)).toEqual(batchDetail(s, tick, id));
  }
  expect(JSON.stringify(s, (_, value) => value instanceof Map ? [...value] : value)).toBe(before);
});

it('filters and sorts 5000 rows below a generous 50 ms median, including cold datasets', () => {
  const query = { filters: { yield: { min: 0 }, duration: { min: 0 } }, sort: { column: 'yieldPct' as const, direction: 'desc' as const } };
  const run = (cold: boolean) => Array.from({ length: 9 }, () => {
    const start = performance.now();
    expect(ledgerView(cold ? { ...d } : d, query).rows).toHaveLength(5000);
    return performance.now() - start;
  }).sort((a, b) => a - b)[4]!;
  const cold = run(true), warm = run(false);
  console.info(`ledgerView median: cold ${cold.toFixed(3)} ms; cached ${warm.toFixed(3)} ms`);
  expect(cold).toBeLessThan(50);
  expect(warm).toBeLessThan(50);
});

it('exports the ledger API from core', async () => {
  const core = await import('../index') as Record<string, unknown>;
  for (const name of ['ledgerView', 'toggleSelection', 'canCompare', 'compareBatches', 'batchDetail']) expect(core[name]).toBeTypeOf('function');
  expect(core.MAX_COMPARE).toBe(4);
});

it('includes both complete local dates supplied by a date picker', () => {
  const dates = { ...d, batches: [
    { ...d.batches[0]!, id: 'midnight', start: Date.UTC(2025, 11, 31, 3) },
    { ...d.batches[0]!, id: 'late', start: Date.UTC(2026, 0, 1, 1, 59) },
    { ...d.batches[0]!, id: 'last-ms', start: Date.UTC(2026, 0, 1, 2, 59, 59, 999) },
    { ...d.batches[0]!, id: 'next-day', start: Date.UTC(2026, 0, 1, 3) },
    { ...d.batches[0]!, id: 'before', start: Date.UTC(2025, 11, 31, 2, 59, 59, 999) },
  ] };
  const rows = (start: import('./ledger').LedgerFilters['start']) => ledgerView(dates, { filters: { start } }).rows.map(r => r.batchId);
  expect(rows({ fromDate: '2025-12-31', toDate: '2025-12-31' })).toEqual(['last-ms', 'late', 'midnight']);
  expect(rows({ toDate: '2025-12-31' })).toEqual(['last-ms', 'late', 'midnight', 'before']);
  expect(rows({ toDate: '2025-12-30' })).toEqual(['before']);
  expect(rows({ fromDate: '2025-12-31' })).toEqual(['next-day', 'last-ms', 'late', 'midnight']);
  expect(() => rows({ toDate: 'garbage' })).toThrow('YYYY-MM-DD');
});

it('normalizes empty Ledger filters at entry and rejects inverted ranges', () => {
  for (const value of [undefined, null, [], ''] as const) {
    expect(ledgerView(d, { filters: { batchId: value, lotId: value, upstreamLotId: value,
      areas: value, lines: value, products: value, shifts: value, statuses: value,
      start: value, yield: value, duration: value, scrap: value } })).toEqual(ledgerView(d, {}));
  }
  expect(ledgerView(d, { filters: null })).toEqual(ledgerView(d, {}));
  expect(ledgerView(d, { filters: { start: {}, yield: {}, duration: {}, scrap: {} } })).toEqual(ledgerView(d, {}));
  for (const column of ['yield', 'duration', 'scrap'] as const) {
    expect(() => ledgerView(d, { filters: { [column]: { min: 2, max: 1 } } })).toThrow(`${column} min must not exceed max`);
  }
  expect(() => ledgerView(d, { filters: { start: { fromDate: '2026-01-01', toDate: '2025-12-31' } } })).toThrow('start fromDate must not be after toDate');
});

it('keeps running Batch B-A1-01151 Alarms inside its planned run at tick 86400', () => {
  const b = d.activeBatches.find(b => b.id === 'B-A1-01151')!;
  const detail = batchDetail(state, 86400, b.id);
  if ('error' in detail) throw new Error(detail.error);
  expect(detail.alarms.length).toBeGreaterThan(0);
  expect(detail.alarms.every(a => a.raisedAt >= b.start && a.raisedAt < b.plannedEnd)).toBe(true);
});

it('checks Alarm raise times as well as the Batch id for both finished and running Batches', () => {
  for (const b of [d.batches[0]!, d.activeBatches[0]!]) {
    const end = 'end' in b ? b.end : b.plannedEnd;
    const alarms = [b.start - 1, b.start, end - 1, end, end + 1].map((raisedAt, i) => ({
      ...d.alarms[0]!, id: `bounded-${i}`, batchId: b.id, raisedAt,
    }));
    const dataset = { ...d, alarms };
    const detail = batchDetail(createPlantState(dataset), 86400, b.id);
    if ('error' in detail) throw new Error(detail.error);
    expect(detail.alarms.filter(a => a.id.startsWith('bounded-')).map(a => a.id).sort()).toEqual(['bounded-1', 'bounded-2']);
  }
});

it('requires two distinct comparison ids and compares each selection once', () => {
  const [a, b] = d.batches;
  expect(compareBatches(d, [a!.id, a!.id])).toEqual({ error: 'compare-count' });
  expect(canCompare([a!.id, a!.id])).toBe(false);
  const compared = compareBatches(d, [a!.id, a!.id, b!.id]);
  if ('error' in compared) throw new Error(compared.error);
  expect(compared.columns.map(c => c.batchId)).toEqual([a!.id, b!.id]);
});

it('counts hidden selections toward the limit and restores them when filters clear', () => {
  const selected = d.batches.filter(b => b.lineId === 'E1').slice(0, 4).map(b => b.id);
  const hidden = ledgerView(d, { selected, filters: { lines: ['A1'] } });
  expect(hidden.selectedCount).toBe(4);
  expect(hidden.selectedHidden).toBe(4);
  expect(toggleSelection(selected, d.batches.find(b => b.lineId === 'A1')!.id).result).toBe('selection-limit');
  const restored = ledgerView(d, { selected });
  expect(restored.selectedCount).toBe(4);
  expect(restored.selectedHidden).toBe(0);
  expect(ledgerView(d, { selected: [...selected, selected[0]!] }).selectedCount).toBe(4);
  expect(ledgerView(d, {}).selectedHidden).toBe(0);
});

it('reads finished Recipe Versions from the Mock Dataset and running versions from Plant State', () => {
  const versions = state.recipeVersions.map(v => ({ ...v, number: v.number + 100,
    steps: v.steps.map(s => ({ ...s, parameters: s.parameters.map(p => ({ ...p, setpoint: p.setpoint + 1 })) })) }));
  const session = { ...state, recipeVersions: versions };
  const finished = d.batches[0]!;
  const detail = batchDetail(session, 0, finished.id);
  expect(detail).toEqual(batchDetail(state, 0, finished.id));
  const running = d.activeBatches[0]!;
  const activeDetail = batchDetail(session, 0, running.id);
  if ('error' in activeDetail) throw new Error(activeDetail.error);
  const version = versions.find(v => v.id === running.recipeVersionId)!;
  expect(activeDetail.parameters.map(p => p.setpoint)).toEqual(version.steps.filter(s => s.kind === 'run' || s.kind === 'process').flatMap(s => s.parameters.map(p => p.setpoint)));
  const row = ledgerView(d, {}).rows.find(r => r.batchId === finished.id)!;
  const compared = compareBatches(d, [finished.id, d.batches[1]!.id]);
  if ('error' in compared) throw new Error(compared.error);
  expect(compared.columns[0]!.durationMinutes).toBe(row.durationMinutes);
});
