import { DATE_PATTERNS, t, tr } from '../i18n';
import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { batchDetail, canCompare, compareBatches, MAX_COMPARE, toggleSelection, bulkSelection, ledgerSelection, ledgerView, LEDGER_SORT_COLUMNS, LEDGER_DEFAULT_SORT, nextLedgerSort, ledgerFilterDescriptions } from './ledger';

import { createPlantState } from '../plant';

const d = generateMockDataset();
const state = createPlantState(d);

describe('ledger rows', () => {
  it('includes exactly the 5000 finished Batches and a worked row with every column', () => {
    const view = ledgerView(d, {});
    expect(view).toMatchObject({ rowCount: 5000, totalCount: 5000, empty: false, activeFilters: [] });
    // Seed 20260101: LOT-A1-01150, A1, PR2 and R10-v2 records;
    // 05:29:37.542Z to 07:14:37.542Z is 105 minutes / 6300 seconds.
    expect(view.rows.find(row => row.batchId === 'B-A1-01150')).toEqual({
      batchId: 'B-A1-01150', lotId: 'LOT-A1-01150', upstreamLotId: 'LOT-E2-00659',
      areaId: 'assembly', lineId: 'A1', areaName: { key: 'area.assembly' },
      lineName: { key: 'line.assembly', params: { n: 1 } },
      productName: { key: 'product.window-2-leaf', params: { code: 'WIN-2L-70' } },
      productId: 'PR2', productCode: 'WIN-2L-70', recipeVersionId: 'R10-v2', recipeVersion: 2,
      shift: 'S3', start: 1767245377542, end: 1767251677542, durationMinutes: 105, durationSeconds: 6300,
      status: 'completed', yieldPct: 97.9, scrap: 1,
    });
    for (const id of ['B-E1-00701', 'B-E2-00701', 'B-RF1-00501', 'B-P1-00401', 'B-A1-01151', 'B-A2-01151'])
      expect(view.rows.some(row => row.batchId === id)).toBe(false);
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
    expect(ids({ products: ['PR6'] })).toEqual(['b']);
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
    const data = { ...d, batches: [
      { ...d.batches[0]!, id: 'E1-match', lotId: 'LOT-E1' },
      { ...d.batches[1]!, id: 'other', lotId: 'LOT-other' },
    ], lots: [
      { id: 'LOT-E1', batchId: 'E1-match', upstreamLotId: 'UP-E1' },
      { id: 'LOT-other', batchId: 'other', upstreamLotId: null },
    ] };
    for (const column of ['batchId', 'lotId', 'upstreamLotId'] as const) {
      const view = ledgerView(data, { filters: { [column]: '  e1  ' } });
      expect(view.rows.map(row => row.batchId)).toEqual(['E1-match']);
      expect(view.activeFilters).toEqual([{ column, value: 'e1' }]);
      expect(ledgerView(data, { filters: { [column]: '  ' } }).rowCount).toBe(2);
    }
    expect(ledgerView(d, { filters: { batchId: 'E1' } }).rowCount).toBe(700);
    const upstream = ledgerView(d, { filters: { upstreamLotId: 'E1' } });
    expect(upstream.rowCount).toBe(1216);
    expect(upstream.rows.slice(0, 3).map(row => row.batchId)).toEqual(['B-A2-01150', 'B-A1-01149', 'B-A2-01149']);
    expect(ledgerView(d, { filters: { batchId: 'E1', upstreamLotId: 'E1' } }).empty).toBe(true);
  });
  it('reports set filters in fixed column order and copies their values', () => {
    const filters = { duration: {}, start: {}, scrap: { max: 0 }, yield: {}, statuses: [], shifts: [], products: [], lines: [], areas: [], batchId: ' b ' };
    const active = ledgerView(sample, { filters }).activeFilters;
    expect(active).toEqual([
      { column: 'batchId', value: 'b' }, { column: 'scrap', value: { max: 0 } },
    ]);
    filters.scrap.max = 99;
    filters.batchId = 'changed';
    expect(active).toEqual([{ column: 'batchId', value: 'b' }, { column: 'scrap', value: { max: 0 } }]);
  });
  it('sorts every column both ways, keeping Batch id ties ascending', () => {
    // The three worked rows above: durations 2/3/4 min, yields 90/95/95,
    // scraps 10/5/0; PR6/PR7/PR8 and R30-v1/R32-v1/R40-v1.
    const orders = {
      batchId: [['A', 'a', 'b'], ['b', 'a', 'A']],
      lotId: [['a', 'b', 'A'], ['A', 'b', 'a']],
      upstreamLotId: [['a', 'b', 'A'], ['A', 'b', 'a']],
      areaId: [['A', 'b', 'a'], ['a', 'b', 'A']],
      lineId: [['A', 'a', 'b'], ['b', 'a', 'A']],
      productId: [['b', 'A', 'a'], ['a', 'A', 'b']],
      productCode: [['b', 'A', 'a'], ['a', 'A', 'b']],
      recipeVersionId: [['b', 'A', 'a'], ['a', 'A', 'b']],
      recipeVersion: [['A', 'a', 'b'], ['A', 'a', 'b']],
      shift: [['b', 'A', 'a'], ['a', 'A', 'b']],
      start: [['b', 'A', 'a'], ['a', 'A', 'b']],
      end: [['b', 'A', 'a'], ['a', 'A', 'b']],
      durationMinutes: [['b', 'A', 'a'], ['a', 'A', 'b']],
      status: [['a', 'b', 'A'], ['A', 'b', 'a']],
      yieldPct: [['b', 'A', 'a'], ['A', 'a', 'b']],
      scrap: [['a', 'A', 'b'], ['b', 'A', 'a']],
    };
    expect(Object.keys(orders)).toEqual(LEDGER_SORT_COLUMNS);
    for (const column of LEDGER_SORT_COLUMNS) {
      expect(ledgerView(sample, { sort: { column, direction: 'asc' } }).rows.map(row => row.batchId)).toEqual(orders[column][0]);
      expect(ledgerView(sample, { sort: { column, direction: 'desc' } }).rows.map(row => row.batchId)).toEqual(orders[column][1]);
    }
    const nullable = { ...sample, lots: sample.lots.map(lot => lot.id === 'LOT-RF1-00001' ? { ...lot, upstreamLotId: null } : lot) };
    expect(ledgerView(nullable, { sort: { column: 'upstreamLotId', direction: 'asc' } }).rows.map(row => row.batchId)).toEqual(['A', 'a', 'b']);
    expect(ledgerView(nullable, { sort: { column: 'upstreamLotId', direction: 'desc' } }).rows.map(row => row.batchId)).toEqual(['b', 'a', 'A']);
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
    expect(toggleSelection(selected, 'b')).toEqual({ selected: ['a', 'c', 'd'], result: 'deselected' });
    expect(selected).toEqual(['a', 'b', 'c', 'd']);
    for (const [selection, eligible] of [[[], false], [['a'], false], [['a', 'b'], true], [['a', 'b', 'c'], true], [['a', 'b', 'c', 'd'], true], [['a', 'b', 'c', 'd', 'e'], false]] as const) expect(canCompare(selection)).toBe(eligible);
  });
  it('validates counts and unknown finished Batch ids', () => {
    for (const ids of [[], ['x'], ['a', 'b', 'c', 'd', 'e']]) expect(compareBatches(d, ids)).toEqual({ error: 'compare-count' });
    expect(compareBatches(d, ['B-A1-01150', 'missing'])).toEqual({ error: 'unknown-batch' });
    expect(compareBatches(d, ['B-A1-01150', 'B-A1-01151'])).toEqual({ error: 'unknown-batch' });
  });
  it.each([2, 3, 4])('compares %i Batches in input order with the union of run and process Parameters', count => {
    const parameter = (key: string, setpoint: number) => ({ id: key, key, name: { key: 'parameter.cycle-time' as const }, unit: 's', min: 0, max: 300, setpoint });
    const step = d.recipeVersions[0]!.steps[0]!;
    const version = (id: string, kind: 'run' | 'process', parameters: ReturnType<typeof parameter>[]) => ({
      ...d.recipeVersions[0]!, id, steps: [{ ...step, kind, parameters }, { ...step, kind: 'load' as const, parameters: [parameter('ignored', 1)] }],
    });
    const data: import('../mock/types').MockDataset = { ...d, recipeVersions: [
      version('v1', 'run', [parameter('alpha', 100), parameter('common', 50)]),
      version('v2', 'process', [parameter('beta', 200), parameter('common', 80)]),
      version('v3', 'process', [parameter('zeta', 10)]),
      version('v4', 'run', [parameter('alpha', 50)]),
    ], batches: [
      { ...d.batches[0]!, id: 'extrusion', recipeVersionId: 'v1', lineId: 'E1' as const, start: 0, end: 120000, yieldPct: 90, scrap: 10, status: 'completed' as const, actuals: { alpha: 110, common: 50 } },
      { ...d.batches[0]!, id: 'assembly', recipeVersionId: 'v2', lineId: 'A1' as const, start: 0, end: 180000, yieldPct: 95, scrap: 5, status: 'rework' as const, actuals: { beta: 180, common: 88 } },
      { ...d.batches[0]!, id: 'press', recipeVersionId: 'v3', lineId: 'P1' as const, start: 0, end: 240000, yieldPct: 80, scrap: 20, status: 'aborted' as const, actuals: { zeta: 9 } },
      { ...d.batches[0]!, id: 'cnc', recipeVersionId: 'v4', lineId: 'C1' as const, start: 0, end: 300000, yieldPct: 85, scrap: 15, status: 'completed' as const, actuals: { alpha: 55 } },
    ] };
    const result = compareBatches(data, ['extrusion', 'assembly', 'press', 'cnc'].slice(0, count));
    if ('error' in result) throw new Error(result.error);
    expect(result.columns).toEqual([
      { batchId: 'extrusion', lineId: 'E1', durationMinutes: 2, durationSeconds: 120, yieldPct: 90, scrap: 10, status: 'completed' },
      { batchId: 'assembly', lineId: 'A1', durationMinutes: 3, durationSeconds: 180, yieldPct: 95, scrap: 5, status: 'rework' },
      { batchId: 'press', lineId: 'P1', durationMinutes: 4, durationSeconds: 240, yieldPct: 80, scrap: 20, status: 'aborted' },
      { batchId: 'cnc', lineId: 'C1', durationMinutes: 5, durationSeconds: 300, yieldPct: 85, scrap: 15, status: 'completed' },
    ].slice(0, count));
    // Worked percentages: 110 vs 100 = +10%; 180 vs 200 = -10%; 88 vs 80 = +10%.
    const expected = [
      { key: 'alpha', values: [{ actual: 110, setpoint: 100, deviationPct: 10 }, null, null, { actual: 55, setpoint: 50, deviationPct: 10 }] },
      { key: 'beta', values: [null, { actual: 180, setpoint: 200, deviationPct: -10 }, null, null] },
      { key: 'common', values: [{ actual: 50, setpoint: 50, deviationPct: 0 }, { actual: 88, setpoint: 80, deviationPct: 10 }, null, null] },
      ...(count >= 3 ? [{ key: 'zeta', values: [null, null, { actual: 9, setpoint: 10, deviationPct: -10 }, null] }] : []),
    ];
    expect(result.parameters).toEqual(expected.map(row => ({ ...row, name: { key: 'parameter.cycle-time' }, unit: 's', values: row.values.slice(0, count) })));
  });
});


describe('Batch detail', () => {
  it('rejects unknown Batches and negative ticks at entry', () => {
    expect(batchDetail(state, 0, 'missing')).toEqual({ error: 'unknown-batch' });
    expect(() => batchDetail(state, -1, 'missing')).toThrow('tick must be 0 or more');
  });
  // Seed 20260101: literal first/last three stored chains on each of the seven Lines.
  it.each([
    ["B-E1-00001", {"batchId": "B-E1-00001", "lotId": "LOT-E1-00001", "status": "completed", "lineId": "E1", "productCode": "DOR-2L-80", "start": 1759486911152, "end": 1759497351152}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00001", "batchId": "B-E1-00001", "linked": true}]],
    ["B-E1-00002", {"batchId": "B-E1-00002", "lotId": "LOT-E1-00002", "status": "completed", "lineId": "E1", "productCode": "WIN-1L-60", "start": 1759502182236, "end": 1759512742236}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00002", "batchId": "B-E1-00002", "linked": true}]],
    ["B-E1-00003", {"batchId": "B-E1-00003", "lotId": "LOT-E1-00003", "status": "completed", "lineId": "E1", "productCode": "WIN-1L-60", "start": 1759516330830, "end": 1759524310830}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00003", "batchId": "B-E1-00003", "linked": true}]],
    ["B-E1-00698", {"batchId": "B-E1-00698", "lotId": "LOT-E1-00698", "status": "completed", "lineId": "E1", "productCode": "WIN-PG-70", "start": 1767217790831, "end": 1767227330831}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00698", "batchId": "B-E1-00698", "linked": true}]],
    ["B-E1-00699", {"batchId": "B-E1-00699", "lotId": "LOT-E1-00699", "status": "completed", "lineId": "E1", "productCode": "WIN-1L-60", "start": 1767232614323, "end": 1767238134323}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00699", "batchId": "B-E1-00699", "linked": true}]],
    ["B-E1-00700", {"batchId": "B-E1-00700", "lotId": "LOT-E1-00700", "status": "completed", "lineId": "E1", "productCode": "WIN-PG-70", "start": 1767242276456, "end": 1767252116456}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00700", "batchId": "B-E1-00700", "linked": true}]],
    ["B-E2-00001", {"batchId": "B-E2-00001", "lotId": "LOT-E2-00001", "status": "completed", "lineId": "E2", "productCode": "WIN-PG-70", "start": 1759485075488, "end": 1759492515488}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00001", "batchId": "B-E2-00001", "linked": true}]],
    ["B-E2-00002", {"batchId": "B-E2-00002", "lotId": "LOT-E2-00002", "status": "aborted", "lineId": "E2", "productCode": "WIN-2L-70", "start": 1759494994493, "end": 1759500454493}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00002", "batchId": "B-E2-00002", "linked": true}]],
    ["B-E2-00003", {"batchId": "B-E2-00003", "lotId": "LOT-E2-00003", "status": "completed", "lineId": "E2", "productCode": "DOR-1L-80", "start": 1759503979193, "end": 1759511659193}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00003", "batchId": "B-E2-00003", "linked": true}]],
    ["B-E2-00698", {"batchId": "B-E2-00698", "lotId": "LOT-E2-00698", "status": "completed", "lineId": "E2", "productCode": "WIN-FX-60", "start": 1767220618578, "end": 1767227098578}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00698", "batchId": "B-E2-00698", "linked": true}]],
    ["B-E2-00699", {"batchId": "B-E2-00699", "lotId": "LOT-E2-00699", "status": "completed", "lineId": "E2", "productCode": "DOR-1L-80", "start": 1767229257531, "end": 1767236877531}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00699", "batchId": "B-E2-00699", "linked": true}]],
    ["B-E2-00700", {"batchId": "B-E2-00700", "lotId": "LOT-E2-00700", "status": "completed", "lineId": "E2", "productCode": "DOR-1L-80", "start": 1767241994762, "end": 1767249374762}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00700", "batchId": "B-E2-00700", "linked": true}]],
    ["B-RF1-00001", {"batchId": "B-RF1-00001", "lotId": "LOT-RF1-00001", "status": "completed", "lineId": "RF1", "productCode": "DOR-SL-80", "start": 1759482960047, "end": 1759496580047}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-00001", "batchId": "B-RF1-00001", "linked": true}]],
    ["B-RF1-00002", {"batchId": "B-RF1-00002", "lotId": "LOT-RF1-00002", "status": "completed", "lineId": "RF1", "productCode": "WIN-2L-70", "start": 1759502339392, "end": 1759516019392}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-00002", "batchId": "B-RF1-00002", "linked": true}]],
    ["B-RF1-00003", {"batchId": "B-RF1-00003", "lotId": "LOT-RF1-00003", "status": "rework", "lineId": "RF1", "productCode": "WIN-1L-60", "start": 1759520958436, "end": 1759531158436}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-00003", "batchId": "B-RF1-00003", "linked": true}]],
    ["B-RF1-00498", {"batchId": "B-RF1-00498", "lotId": "LOT-RF1-00498", "status": "completed", "lineId": "RF1", "productCode": "WIN-TT-70", "start": 1767203887913, "end": 1767214207913}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-00498", "batchId": "B-RF1-00498", "linked": true}]],
    ["B-RF1-00499", {"batchId": "B-RF1-00499", "lotId": "LOT-RF1-00499", "status": "completed", "lineId": "RF1", "productCode": "WIN-TT-70", "start": 1767214219485, "end": 1767229759485}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-00499", "batchId": "B-RF1-00499", "linked": true}]],
    ["B-RF1-00500", {"batchId": "B-RF1-00500", "lotId": "LOT-RF1-00500", "status": "completed", "lineId": "RF1", "productCode": "DOR-2L-80", "start": 1767235370030, "end": 1767251150030}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-00500", "batchId": "B-RF1-00500", "linked": true}]],
    ["B-P1-00001", {"batchId": "B-P1-00001", "lotId": "LOT-P1-00001", "status": "completed", "lineId": "P1", "productCode": "WIN-TT-70", "start": 1759486983031, "end": 1759498683031}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-P1-00001", "batchId": "B-P1-00001", "linked": true}]],
    ["B-P1-00002", {"batchId": "B-P1-00002", "lotId": "LOT-P1-00002", "status": "completed", "lineId": "P1", "productCode": "DOR-SL-80", "start": 1759503824318, "end": 1759515404318}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-P1-00002", "batchId": "B-P1-00002", "linked": true}]],
    ["B-P1-00003", {"batchId": "B-P1-00003", "lotId": "LOT-P1-00003", "status": "completed", "lineId": "P1", "productCode": "WIN-PG-70", "start": 1759518655733, "end": 1759531255733}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-P1-00003", "batchId": "B-P1-00003", "linked": true}]],
    ["B-P1-00398", {"batchId": "B-P1-00398", "lotId": "LOT-P1-00398", "status": "completed", "lineId": "P1", "productCode": "WIN-PG-70", "start": 1767187578823, "end": 1767202338823}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-P1-00398", "batchId": "B-P1-00398", "linked": true}]],
    ["B-P1-00399", {"batchId": "B-P1-00399", "lotId": "LOT-P1-00399", "status": "completed", "lineId": "P1", "productCode": "WIN-1L-60", "start": 1767208985272, "end": 1767222665272}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-P1-00399", "batchId": "B-P1-00399", "linked": true}]],
    ["B-P1-00400", {"batchId": "B-P1-00400", "lotId": "LOT-P1-00400", "status": "completed", "lineId": "P1", "productCode": "WIN-1L-60", "start": 1767226801833, "end": 1767242401833}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-P1-00400", "batchId": "B-P1-00400", "linked": true}]],
    ["B-C1-00001", {"batchId": "B-C1-00001", "lotId": "LOT-C1-00001", "status": "rework", "lineId": "C1", "productCode": "WIN-2L-70", "start": 1759484004718, "end": 1759497684718}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-C1-00001", "batchId": "B-C1-00001", "linked": true}]],
    ["B-C1-00002", {"batchId": "B-C1-00002", "lotId": "LOT-C1-00002", "status": "completed", "lineId": "C1", "productCode": "WIN-PG-70", "start": 1759505704703, "end": 1759517404703}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-C1-00002", "batchId": "B-C1-00002", "linked": true}]],
    ["B-C1-00003", {"batchId": "B-C1-00003", "lotId": "LOT-C1-00003", "status": "completed", "lineId": "C1", "productCode": "WIN-2L-70", "start": 1759519875429, "end": 1759528875429}, [{"kind": "materialLot", "lotId": "ML-STL-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-C1-00003", "batchId": "B-C1-00003", "linked": true}]],
    ["B-C1-00398", {"batchId": "B-C1-00398", "lotId": "LOT-C1-00398", "status": "completed", "lineId": "C1", "productCode": "DOR-1L-80", "start": 1767169752726, "end": 1767184812726}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-C1-00398", "batchId": "B-C1-00398", "linked": true}]],
    ["B-C1-00399", {"batchId": "B-C1-00399", "lotId": "LOT-C1-00399", "status": "completed", "lineId": "C1", "productCode": "WIN-2L-70", "start": 1767188005477, "end": 1767201265477}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-C1-00399", "batchId": "B-C1-00399", "linked": true}]],
    ["B-C1-00400", {"batchId": "B-C1-00400", "lotId": "LOT-C1-00400", "status": "completed", "lineId": "C1", "productCode": "WIN-TT-70", "start": 1767208817078, "end": 1767219917078}, [{"kind": "materialLot", "lotId": "ML-STL-030", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-C1-00400", "batchId": "B-C1-00400", "linked": true}]],
    ["B-A1-00001", {"batchId": "B-A1-00001", "lotId": "LOT-A1-00001", "status": "completed", "lineId": "A1", "productCode": "WIN-PG-70", "start": 1759483073896, "end": 1759486973896}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-PRE-039", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-PRE-065", "batchId": null, "linked": false}, {"kind": "assembly", "lotId": "LOT-A1-00001", "batchId": "B-A1-00001", "serial": "SN-A1-000001", "linked": true}]],
    ["B-A1-00002", {"batchId": "B-A1-00002", "lotId": "LOT-A1-00002", "status": "completed", "lineId": "A1", "productCode": "WIN-FX-60", "start": 1759488201464, "end": 1759494501464}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-PRE-086", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-PRE-037", "batchId": null, "linked": false}, {"kind": "assembly", "lotId": "LOT-A1-00002", "batchId": "B-A1-00002", "serial": "SN-A1-000002", "linked": true}]],
    ["B-A1-00003", {"batchId": "B-A1-00003", "lotId": "LOT-A1-00003", "status": "completed", "lineId": "A1", "productCode": "DOR-SL-80", "start": 1759494911148, "end": 1759500911148}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-PRE-013", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-PRE-078", "batchId": null, "linked": false}, {"kind": "assembly", "lotId": "LOT-A1-00003", "batchId": "B-A1-00003", "serial": "SN-A1-000003", "linked": true}]],
    ["B-A1-01148", {"batchId": "B-A1-01148", "lotId": "LOT-A1-01148", "status": "completed", "lineId": "A1", "productCode": "WIN-TT-70", "start": 1767232805273, "end": 1767238685273}, [{"kind": "materialLot", "lotId": "ML-PVC-041", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00625", "batchId": "B-E1-00625", "linked": true}, {"kind": "metalwork", "lotId": "LOT-C1-00400", "batchId": "B-C1-00400", "linked": true}, {"kind": "assembly", "lotId": "LOT-A1-01148", "batchId": "B-A1-01148", "serial": "SN-A1-001148", "linked": true}]],
    ["B-A1-01149", {"batchId": "B-A1-01149", "lotId": "LOT-A1-01149", "status": "completed", "lineId": "A1", "productCode": "DOR-1L-80", "start": 1767239173860, "end": 1767244153860}, [{"kind": "materialLot", "lotId": "ML-PVC-043", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00669", "batchId": "B-E1-00669", "linked": true}, {"kind": "metalwork", "lotId": "LOT-P1-00374", "batchId": "B-P1-00374", "linked": true}, {"kind": "assembly", "lotId": "LOT-A1-01149", "batchId": "B-A1-01149", "serial": "SN-A1-001149", "linked": true}]],
    ["B-A1-01150", {"batchId": "B-A1-01150", "lotId": "LOT-A1-01150", "status": "completed", "lineId": "A1", "productCode": "WIN-2L-70", "start": 1767245377542, "end": 1767251677542}, [{"kind": "materialLot", "lotId": "ML-PVC-043", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00659", "batchId": "B-E2-00659", "linked": true}, {"kind": "metalwork", "lotId": "LOT-RF1-00488", "batchId": "B-RF1-00488", "linked": true}, {"kind": "assembly", "lotId": "LOT-A1-01150", "batchId": "B-A1-01150", "serial": "SN-A1-001150", "linked": true}]],
    ["B-A2-00001", {"batchId": "B-A2-00001", "lotId": "LOT-A2-00001", "status": "completed", "lineId": "A2", "productCode": "DOR-2L-80", "start": 1759482280802, "end": 1759488100802}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-PRE-062", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-PRE-083", "batchId": null, "linked": false}, {"kind": "assembly", "lotId": "LOT-A2-00001", "batchId": "B-A2-00001", "serial": "SN-A2-000001", "linked": true}]],
    ["B-A2-00002", {"batchId": "B-A2-00002", "lotId": "LOT-A2-00002", "status": "completed", "lineId": "A2", "productCode": "DOR-1L-80", "start": 1759490080018, "end": 1759495960018}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-PRE-039", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-PRE-026", "batchId": null, "linked": false}, {"kind": "assembly", "lotId": "LOT-A2-00002", "batchId": "B-A2-00002", "serial": "SN-A2-000002", "linked": true}]],
    ["B-A2-00003", {"batchId": "B-A2-00003", "lotId": "LOT-A2-00003", "status": "completed", "lineId": "A2", "productCode": "WIN-2L-70", "start": 1759497720593, "end": 1759501500593}, [{"kind": "materialLot", "lotId": "ML-PVC-001", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-PRE-001", "batchId": null, "linked": false}, {"kind": "metalwork", "lotId": "LOT-RF1-PRE-005", "batchId": null, "linked": false}, {"kind": "assembly", "lotId": "LOT-A2-00003", "batchId": "B-A2-00003", "serial": "SN-A2-000003", "linked": true}]],
    ["B-A2-01148", {"batchId": "B-A2-01148", "lotId": "LOT-A2-01148", "status": "completed", "lineId": "A2", "productCode": "DOR-2L-80", "start": 1767231802791, "end": 1767236722791}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E2-00694", "batchId": "B-E2-00694", "linked": true}, {"kind": "metalwork", "lotId": "LOT-P1-00381", "batchId": "B-P1-00381", "linked": true}, {"kind": "assembly", "lotId": "LOT-A2-01148", "batchId": "B-A2-01148", "serial": "SN-A2-001148", "linked": true}]],
    ["B-A2-01149", {"batchId": "B-A2-01149", "lotId": "LOT-A2-01149", "status": "completed", "lineId": "A2", "productCode": "DOR-SL-80", "start": 1767237435266, "end": 1767243075266}, [{"kind": "materialLot", "lotId": "ML-PVC-045", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00694", "batchId": "B-E1-00694", "linked": true}, {"kind": "metalwork", "lotId": "LOT-RF1-00478", "batchId": "B-RF1-00478", "linked": true}, {"kind": "assembly", "lotId": "LOT-A2-01149", "batchId": "B-A2-01149", "serial": "SN-A2-001149", "linked": true}]],
    ["B-A2-01150", {"batchId": "B-A2-01150", "lotId": "LOT-A2-01150", "status": "completed", "lineId": "A2", "productCode": "WIN-1L-60", "start": 1767244814345, "end": 1767250694345}, [{"kind": "materialLot", "lotId": "ML-PVC-044", "batchId": null, "linked": false}, {"kind": "extrusion", "lotId": "LOT-E1-00683", "batchId": "B-E1-00683", "linked": true}, {"kind": "metalwork", "lotId": "LOT-P1-00399", "batchId": "B-P1-00399", "linked": true}, {"kind": "assembly", "lotId": "LOT-A2-01150", "batchId": "B-A2-01150", "serial": "SN-A2-001150", "linked": true}]]
  ] as const)('preserves the literal header and Genealogy for %s', (id, header, genealogy) => {
    const detail = batchDetail(state, 0, id);
    if ('error' in detail) throw new Error(detail.error);
    expect(detail.header).toEqual(header);
    expect(detail.genealogy).toEqual(genealogy);
  });
  // Recorded actuals and Recipe setpoints from the seed; e.g. 175.83 vs 175 = 0.47428571%.
  it.each([
    ['B-E1-00001', [
      {"parameterId": "R26-v1-s3-barrel-zone-1", "key": "barrel-zone-1", "name": {"key": "parameter.barrel-zone-1"}, "unit": "°C", "min": 165, "max": 195, "actual": 175.83, "setpoint": 175, "insideLimits": true, "deviationPct": expect.closeTo(0.47428571, 8) },
      {"parameterId": "R26-v1-s3-barrel-zone-2", "key": "barrel-zone-2", "name": {"key": "parameter.barrel-zone-2"}, "unit": "°C", "min": 165, "max": 195, "actual": 174.85, "setpoint": 177, "insideLimits": true, "deviationPct": expect.closeTo(-1.21468927, 8) },
      {"parameterId": "R26-v1-s3-barrel-zone-3", "key": "barrel-zone-3", "name": {"key": "parameter.barrel-zone-3"}, "unit": "°C", "min": 165, "max": 195, "actual": 185.37, "setpoint": 183, "insideLimits": true, "deviationPct": expect.closeTo(1.29508197, 8) },
      {"parameterId": "R26-v1-s3-barrel-zone-4", "key": "barrel-zone-4", "name": {"key": "parameter.barrel-zone-4"}, "unit": "°C", "min": 165, "max": 195, "actual": 187.49, "setpoint": 186, "insideLimits": true, "deviationPct": expect.closeTo(0.80107527, 8) },
      {"parameterId": "R26-v1-s3-barrel-zone-5", "key": "barrel-zone-5", "name": {"key": "parameter.barrel-zone-5"}, "unit": "°C", "min": 165, "max": 195, "actual": 192.05, "setpoint": 190, "insideLimits": true, "deviationPct": expect.closeTo(1.07894737, 8) },
      {"parameterId": "R26-v1-s3-screw-speed", "key": "screw-speed", "name": {"key": "parameter.screw-speed"}, "unit": "rpm", "min": 10, "max": 35, "actual": 19.71, "setpoint": 20, "insideLimits": true, "deviationPct": expect.closeTo(-1.45000000, 8) },
      {"parameterId": "R26-v1-s3-die-pressure", "key": "die-pressure", "name": {"key": "parameter.die-pressure"}, "unit": "bar", "min": 120, "max": 250, "actual": 184.17, "setpoint": 185, "insideLimits": true, "deviationPct": expect.closeTo(-0.44864865, 8) },
      {"parameterId": "R26-v1-s3-puller-speed", "key": "puller-speed", "name": {"key": "parameter.puller-speed"}, "unit": "m/min", "min": 0.5, "max": 3, "actual": 1.79, "setpoint": 1.8, "insideLimits": true, "deviationPct": expect.closeTo(-0.55555556, 8) }
    ]],
    ['B-E2-00001', [
      {"parameterId": "R36-v1-s3-barrel-zone-1", "key": "barrel-zone-1", "name": {"key": "parameter.barrel-zone-1"}, "unit": "°C", "min": 165, "max": 195, "actual": 172.87, "setpoint": 174, "insideLimits": true, "deviationPct": expect.closeTo(-0.64942529, 8) },
      {"parameterId": "R36-v1-s3-barrel-zone-2", "key": "barrel-zone-2", "name": {"key": "parameter.barrel-zone-2"}, "unit": "°C", "min": 165, "max": 195, "actual": 176.79, "setpoint": 177, "insideLimits": true, "deviationPct": expect.closeTo(-0.11864407, 8) },
      {"parameterId": "R36-v1-s3-barrel-zone-3", "key": "barrel-zone-3", "name": {"key": "parameter.barrel-zone-3"}, "unit": "°C", "min": 165, "max": 195, "actual": 180.14, "setpoint": 182, "insideLimits": true, "deviationPct": expect.closeTo(-1.02197802, 8) },
      {"parameterId": "R36-v1-s3-barrel-zone-4", "key": "barrel-zone-4", "name": {"key": "parameter.barrel-zone-4"}, "unit": "°C", "min": 165, "max": 195, "actual": 184.17, "setpoint": 186, "insideLimits": true, "deviationPct": expect.closeTo(-0.98387097, 8) },
      {"parameterId": "R36-v1-s3-barrel-zone-5", "key": "barrel-zone-5", "name": {"key": "parameter.barrel-zone-5"}, "unit": "°C", "min": 165, "max": 195, "actual": 192.58, "setpoint": 191, "insideLimits": true, "deviationPct": expect.closeTo(0.82722513, 8) },
      {"parameterId": "R36-v1-s3-screw-speed", "key": "screw-speed", "name": {"key": "parameter.screw-speed"}, "unit": "rpm", "min": 10, "max": 35, "actual": 20.81, "setpoint": 21, "insideLimits": true, "deviationPct": expect.closeTo(-0.90476190, 8) },
      {"parameterId": "R36-v1-s3-die-pressure", "key": "die-pressure", "name": {"key": "parameter.die-pressure"}, "unit": "bar", "min": 120, "max": 250, "actual": 186.53, "setpoint": 184, "insideLimits": true, "deviationPct": expect.closeTo(1.37500000, 8) },
      {"parameterId": "R36-v1-s3-puller-speed", "key": "puller-speed", "name": {"key": "parameter.puller-speed"}, "unit": "m/min", "min": 0.5, "max": 3, "actual": 2.11, "setpoint": 2.1, "insideLimits": true, "deviationPct": expect.closeTo(0.47619048, 8) }
    ]],
    ['B-RF1-00001', [
      {"parameterId": "R32-v1-s2-line-speed", "key": "line-speed", "name": {"key": "parameter.line-speed"}, "unit": "m/min", "min": 10, "max": 40, "actual": 28.06, "setpoint": 28, "insideLimits": true, "deviationPct": expect.closeTo(0.21428571, 8) },
      {"parameterId": "R32-v1-s2-forming-pressure", "key": "forming-pressure", "name": {"key": "parameter.forming-pressure"}, "unit": "bar", "min": 50, "max": 120, "actual": 72.71, "setpoint": 73, "insideLimits": true, "deviationPct": expect.closeTo(-0.39726027, 8) }
    ]],
    ['B-P1-00001', [
      {"parameterId": "R13-v1-s2-press-force", "key": "press-force", "name": {"key": "parameter.press-force"}, "unit": "kN", "min": 80, "max": 180, "actual": 127.87, "setpoint": 126, "insideLimits": true, "deviationPct": expect.closeTo(1.48412698, 8) },
      {"parameterId": "R13-v1-s2-stroke-rate", "key": "stroke-rate", "name": {"key": "parameter.stroke-rate"}, "unit": "spm", "min": 20, "max": 60, "actual": 44.07, "setpoint": 44, "insideLimits": true, "deviationPct": expect.closeTo(0.15909091, 8) }
    ]],
    ['B-C1-00001', [
      {"parameterId": "R09-v1-s2-spindle-speed", "key": "spindle-speed", "name": {"key": "parameter.spindle-speed"}, "unit": "rpm", "min": 3000, "max": 12000, "actual": 7906.26, "setpoint": 7948, "insideLimits": true, "deviationPct": expect.closeTo(-0.52516356, 8) },
      {"parameterId": "R09-v1-s2-feed-rate", "key": "feed-rate", "name": {"key": "parameter.feed-rate"}, "unit": "mm/min", "min": 800, "max": 3000, "actual": 1957.84, "setpoint": 1987, "insideLimits": true, "deviationPct": expect.closeTo(-1.46753900, 8) }
    ]],
    ['B-A1-00001', [
      {"parameterId": "R40-v1-s2-weld-temperature", "key": "weld-temperature", "name": {"key": "parameter.weld-temperature"}, "unit": "°C", "min": 240, "max": 270, "actual": 260.06, "setpoint": 259, "insideLimits": true, "deviationPct": expect.closeTo(0.40926641, 8) },
      {"parameterId": "R40-v1-s2-weld-time", "key": "weld-time", "name": {"key": "parameter.weld-time"}, "unit": "s", "min": 20, "max": 40, "actual": 28.76, "setpoint": 29, "insideLimits": true, "deviationPct": expect.closeTo(-0.82758621, 8) },
      {"parameterId": "R40-v1-s2-cycle-time", "key": "cycle-time", "name": {"key": "parameter.cycle-time"}, "unit": "s", "min": 60, "max": 119, "actual": 108.01, "setpoint": 107, "insideLimits": true, "deviationPct": expect.closeTo(0.94392523, 8) }
    ]],
    ['B-A2-00001', [
      {"parameterId": "R30-v1-s2-weld-temperature", "key": "weld-temperature", "name": {"key": "parameter.weld-temperature"}, "unit": "°C", "min": 240, "max": 270, "actual": 254.92, "setpoint": 252, "insideLimits": true, "deviationPct": expect.closeTo(1.15873016, 8) },
      {"parameterId": "R30-v1-s2-weld-time", "key": "weld-time", "name": {"key": "parameter.weld-time"}, "unit": "s", "min": 20, "max": 40, "actual": 26.3, "setpoint": 26, "insideLimits": true, "deviationPct": expect.closeTo(1.15384615, 8) },
      {"parameterId": "R30-v1-s2-cycle-time", "key": "cycle-time", "name": {"key": "parameter.cycle-time"}, "unit": "s", "min": 60, "max": 119, "actual": 113.05, "setpoint": 112, "insideLimits": true, "deviationPct": expect.closeTo(0.93750000, 8) }
    ]]
  ])('reports the literal run/process Parameter records for %s', (id, parameters) => {
    const detail = batchDetail(state, 0, id as string);
    if ('error' in detail) throw new Error(detail.error);
    expect(detail.parameters).toEqual(parameters);
  });
  // Literal seeded Alarm ownership, including cleared records, independent of alarmList.
  it.each([
    ["B-E1-00006", ["AL-0002"]],
    ["B-E1-00008", ["AL-0003"]],
    ["B-E2-00028", ["AL-0007"]],
    ["B-E1-00039", ["AL-0008"]],
    ["B-A1-00079", ["AL-0010"]],
    ["B-E1-00051", ["AL-0011"]],
    ["B-A2-00086", ["AL-0012"]],
    ["B-P1-00032", ["AL-0013"]],
    ["B-A2-00106", ["AL-0014"]],
    ["B-E2-00068", ["AL-0015"]],
    ["B-RF1-00051", ["AL-0016"]],
    ["B-A1-00122", ["AL-0017"]],
    ["B-E2-00079", ["AL-0019"]],
    ["B-C1-00048", ["AL-0020"]],
    ["B-A1-00151", ["AL-0022"]],
    ["B-E1-00090", ["AL-0023"]],
    ["B-A2-00152", ["AL-0024"]],
    ["B-RF1-00071", ["AL-0025"]],
    ["B-C1-00058", ["AL-0026"]],
    ["B-A2-00189", ["AL-0027"]],
    ["B-E1-00127", ["AL-0028"]],
    ["B-E1-00131", ["AL-0029"]],
    ["B-RF1-00105", ["AL-0031"]],
    ["B-A2-00242", ["AL-0033"]],
    ["B-A2-00259", ["AL-0034"]],
    ["B-C1-00094", ["AL-0035"]],
    ["B-E1-00174", ["AL-0037"]],
    ["B-A2-00298", ["AL-0038"]],
    ["B-A1-00305", ["AL-0039"]],
    ["B-RF1-00135", ["AL-0040"]],
    ["B-A1-00316", ["AL-0041"]],
    ["B-P1-00108", ["AL-0042"]],
    ["B-E2-00197", ["AL-0043"]],
    ["B-A2-00320", ["AL-0044"]],
    ["B-E2-00204", ["AL-0046"]],
    ["B-E1-00206", ["AL-0048"]],
    ["B-E2-00212", ["AL-0049"]],
    ["B-E2-00242", ["AL-0051"]],
    ["B-A2-00402", ["AL-0052"]],
    ["B-E1-00252", ["AL-0053"]],
    ["B-E2-00261", ["AL-0056"]],
    ["B-RF1-00196", ["AL-0057"]],
    ["B-C1-00162", ["AL-0058"]],
    ["B-RF1-00201", ["AL-0059"]],
    ["B-A2-00459", ["AL-0060"]],
    ["B-A1-00466", ["AL-0061"]],
    ["B-A2-00464", ["AL-0062"]],
    ["B-E2-00288", ["AL-0063"]],
    ["B-E1-00295", ["AL-0064", "AL-0065"]],
    ["B-A1-00489", ["AL-0066"]],
    ["B-A2-00487", ["AL-0068"]],
    ["B-E2-00302", ["AL-0069"]],
    ["B-A1-00498", ["AL-0070"]],
    ["B-A1-00518", ["AL-0073"]],
    ["B-A1-00522", ["AL-0074"]],
    ["B-A1-00532", ["AL-0075"]],
    ["B-E2-00328", ["AL-0076"]],
    ["B-A1-00551", ["AL-0077"]],
    ["B-E2-00353", ["AL-0079"]],
    ["B-A1-00580", ["AL-0080"]],
    ["B-C1-00210", ["AL-0082"]],
    ["B-A2-00612", ["AL-0084"]],
    ["B-A1-00643", ["AL-0086"]],
    ["B-A2-00639", ["AL-0087"]],
    ["B-E1-00404", ["AL-0088"]],
    ["B-RF1-00291", ["AL-0089"]],
    ["B-RF1-00294", ["AL-0090"]],
    ["B-A1-00675", ["AL-0091"]],
    ["B-A2-00671", ["AL-0092"]],
    ["B-A1-00703", ["AL-0094"]],
    ["B-C1-00254", ["AL-0095"]],
    ["B-E1-00446", ["AL-0098"]],
    ["B-E1-00449", ["AL-0099"]],
    ["B-E2-00455", ["AL-0101"]],
    ["B-E1-00454", ["AL-0102"]],
    ["B-E1-00460", ["AL-0103"]],
    ["B-E2-00462", ["AL-0105"]],
    ["B-A1-00796", ["AL-0106"]],
    ["B-A1-00798", ["AL-0107"]],
    ["B-RF1-00352", ["AL-0108"]],
    ["B-E1-00496", ["AL-0109"]],
    ["B-A2-00810", ["AL-0110"]],
    ["B-A1-00822", ["AL-0111"]],
    ["B-A1-00823", ["AL-0112"]],
    ["B-E2-00504", ["AL-0113"]],
    ["B-A1-00846", ["AL-0115"]],
    ["B-A1-00847", ["AL-0116"]],
    ["B-A2-00866", ["AL-0119"]],
    ["B-A2-00869", ["AL-0120"]],
    ["B-A1-00883", ["AL-0121"]],
    ["B-A2-00894", ["AL-0122"]],
    ["B-A1-00900", ["AL-0123"]],
    ["B-A1-00906", ["AL-0124"]],
    ["B-P1-00321", ["AL-0125"]],
    ["B-A2-00925", ["AL-0126"]],
    ["B-A1-00934", ["AL-0127"]],
    ["B-P1-00327", ["AL-0128"]],
    ["B-A2-00971", ["AL-0131"]],
    ["B-E2-00593", ["AL-0132"]],
    ["B-A1-00990", ["AL-0134"]],
    ["B-A1-01028", ["AL-0137"]],
    ["B-A1-01033", ["AL-0138"]],
    ["B-E1-00639", ["AL-0139"]],
    ["B-RF1-00462", ["AL-0140"]],
    ["B-E1-00650", ["AL-0141"]],
    ["B-E2-00652", ["AL-0142"]],
    ["B-A1-01103", ["AL-0146"]],
    ["B-RF1-00483", ["AL-0147"]],
    ["B-RF1-00486", ["AL-0148"]],
    ["B-A1-01112", ["AL-0149"]],
    ["B-E2-00688", ["AL-0150"]],
    ["B-A1-01149", ["AL-0152"]],
    ["B-E1-00700", ["AL-0153"]],
    ["B-A2-01150", ["AL-0154"]],
    ["B-A2-01151", ["AL-0159"]],
    ["B-E1-00701", ["AL-0160"]]
  ] as const)('includes the recorded Alarms owned by %s', (id, expected) => {
    const detail = batchDetail(state, 0, id);
    if ('error' in detail) throw new Error(detail.error);
    expect(detail.alarms.map(alarm => alarm.id)).toEqual(expected);
    if (id === 'B-E1-00006') expect(detail.alarms).toEqual([{
      id: 'AL-0002', priority: 'low', state: 'cleared', lineId: 'E1', areaId: 'extrusion',
      machineId: 'E1-extruder', machineName: { key: 'machine.extruder' }, tagId: 'E1-extruder.barrel-zone-1-temp',
      message: { key: 'alarm.high-value', params: { tag: 'barrel-zone-1-temp' } },
      raisedAt: 1759547470179, ageSeconds: 7710529.821, acknowledgedBy: 'U01', acknowledgedByName: 'Lucas Becker', canAcknowledge: false,
    }]);
  });
  it('shows running Batch header and Genealogy without inventing actuals or an end', () => {
    const detail = batchDetail(state, 50, 'B-E1-00701');
    if ('error' in detail) throw new Error(detail.error);
    expect(detail.header).toEqual({ batchId: 'B-E1-00701', lotId: 'LOT-E1-00701', status: 'running', end: null,
      lineId: 'E1', productCode: 'DOR-1L-80', start: 1767254760000 });
    expect(detail.parameters.map(p => [p.key, p.actual, p.deviationPct, p.insideLimits])).toEqual([
      ['barrel-zone-1', null, null, null], ['barrel-zone-2', null, null, null], ['barrel-zone-3', null, null, null],
      ['barrel-zone-4', null, null, null], ['barrel-zone-5', null, null, null], ['screw-speed', null, null, null],
      ['die-pressure', null, null, null], ['puller-speed', null, null, null],
    ]);
    expect(detail.genealogy).toEqual([
      { kind: 'materialLot', lotId: 'ML-PVC-045', batchId: null, linked: false },
      { kind: 'extrusion', lotId: 'LOT-E1-00701', batchId: 'B-E1-00701', linked: true },
    ]);
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
  const count = first.rowCount;
  first.rows.pop();
  expect(ledgerView(dataset, query).rowCount).toBe(count);
  const ids = deepFreeze(['B-A1-01150', 'B-A2-01150', 'B-E1-00700', 'B-E2-00700']);
  expect(compareBatches(dataset, ids)).toEqual(compareBatches(dataset, ids));
  const refused = toggleSelection(ids, 'fifth');
  expect(refused.selected).toEqual(['B-A1-01150', 'B-A2-01150', 'B-E1-00700', 'B-E2-00700']);
  refused.selected.pop();
  expect(ids).toEqual(['B-A1-01150', 'B-A2-01150', 'B-E1-00700', 'B-E2-00700']);
  for (const tick of [0, 100, 0]) {
    const id = dataset.activeBatches[0]!.id;
    expect(batchDetail(s, tick, id)).toEqual(batchDetail(s, tick, id));
  }
  expect(JSON.stringify(s, (_, value) => value instanceof Map ? [...value] : value)).toBe(before);
});

it('filters and sorts 5000 rows below a generous 1500 ms median, so a busy machine does not fail it, including cold datasets', () => {
  const query = { filters: { yield: { min: 0 }, duration: { min: 0 } }, sort: { column: 'yieldPct' as const, direction: 'desc' as const } };
  const run = (cold: boolean) => Array.from({ length: 9 }, () => {
    const start = performance.now();
    expect(ledgerView(cold ? { ...d } : d, query).rows).toHaveLength(5000);
    return performance.now() - start;
  }).sort((a, b) => a - b)[4]!;
  const cold = run(true), warm = run(false);
  console.info(`ledgerView median: cold ${cold.toFixed(3)} ms; cached ${warm.toFixed(3)} ms`);
  expect(cold).toBeLessThan(1500);
  expect(warm).toBeLessThan(1500);
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
  const expectUnfiltered = (view: ReturnType<typeof ledgerView>) => {
    expect(view).toMatchObject({ rowCount: 3, totalCount: 3, empty: false, activeFilters: [] });
    expect(view.rows.map(row => row.batchId)).toEqual(['a', 'A', 'b']);
  };
  for (const value of [undefined, null, [], ''] as const) {
    expectUnfiltered(ledgerView(sample, { filters: { batchId: value, lotId: value, upstreamLotId: value,
      areas: value, lines: value, products: value, shifts: value, statuses: value,
      start: value, yield: value, duration: value, scrap: value } }));
  }
  expectUnfiltered(ledgerView(sample, { filters: null }));
  expectUnfiltered(ledgerView(sample, { filters: { start: {}, yield: {}, duration: {}, scrap: {} } }));
  for (const column of ['yield', 'duration', 'scrap'] as const) {
    expect(() => ledgerView(d, { filters: { [column]: { min: 2, max: 1 } } })).toThrow(`${column} min must not exceed max`);
  }
  expect(() => ledgerView(d, { filters: { start: { fromDate: '2026-01-01', toDate: '2025-12-31' } } })).toThrow('start fromDate must not be after toDate');
});

it('keeps Batch B-A1-01151 Alarms inside its worked actual lifetime at tick 86400', () => {
  // 40 target minus 17 produced at 0.475 units/min: completion tick 2906,
  // 1767260906000; planned end 1767260640000 is earlier than completion.
  const data = { ...d, tags: [], alarms: [
    { ...d.alarms[0]!, id: 'after-planned-end', batchId: 'B-A1-01151', raisedAt: 1767260800000 },
    { ...d.alarms[0]!, id: 'at-completion', batchId: 'B-A1-01151', raisedAt: 1767260906000 },
    { ...d.alarms[0]!, id: 'after-completion', batchId: 'B-A1-01151', raisedAt: 1767260906001 },
  ] };
  const detail = batchDetail(createPlantState(data), 86400, 'B-A1-01151');
  if ('error' in detail) throw new Error(detail.error);
  expect(detail.header).toMatchObject({ status: 'completed', end: 1767260906000 });
  expect(detail.alarms.map(alarm => alarm.id)).toEqual(['after-planned-end']);
});

it.each([
  ['B-A1-01150', 1767245377542, 1767251677542],
  ['B-A1-01151', 1767255840000, 1767260906000],
] as const)('includes only Alarms raised in the literal lifetime of %s', (id, start, end) => {
  const alarms: import('../mock/types').Alarm[] = [start - 1, start, end - 1, end, end + 1].map((raisedAt, i) => ({
    ...d.alarms[0]!, id: `bounded-${i}`, batchId: id, raisedAt,
  }));
  alarms.push({ ...d.alarms[0]!, id: 'wrong-owner', batchId: 'B-A2-01150', raisedAt: start });
  const data = { ...d, tags: [], alarms };
  const detail = batchDetail(createPlantState(data), 86400, id);
  if ('error' in detail) throw new Error(detail.error);
  expect(detail.alarms.map(alarm => alarm.id)).toEqual(['bounded-1', 'bounded-2']);
});

it('requires two distinct comparison ids and compares each selection once', () => {
  expect(compareBatches(d, ['B-A1-01150', 'B-A1-01150'])).toEqual({ error: 'compare-count' });
  expect(canCompare(['B-A1-01150', 'B-A1-01150'])).toBe(false);
  const compared = compareBatches(d, ['B-A1-01150', 'B-A1-01150', 'B-A2-01150']);
  if ('error' in compared) throw new Error(compared.error);
  expect(compared.columns.map(column => column.batchId)).toEqual(['B-A1-01150', 'B-A2-01150']);
});

it('counts hidden selections toward the limit and restores them when filters clear', () => {
  const selected = ['B-E1-00700', 'B-E1-00699', 'B-E1-00698', 'B-E1-00697'];
  const hidden = ledgerView(d, { selected, filters: { lines: ['A1'] } });
  expect(hidden.selectedCount).toBe(4);
  expect(hidden.selectedHidden).toBe(4);
  expect(toggleSelection(selected, 'B-A1-01150').result).toBe('selection-limit');
  const restored = ledgerView(d, { selected });
  expect(restored.selectedCount).toBe(4);
  expect(restored.selectedHidden).toBe(0);
  expect(ledgerView(d, { selected: [...selected, selected[0]!] }).selectedCount).toBe(4);
  expect(ledgerView(d, {}).selectedHidden).toBe(0);
});

it('reads finished Recipe Versions from the Mock Dataset and running versions from Plant State', () => {
  const versions = state.recipeVersions.map(v => ({ ...v, number: v.number + 100,
    steps: v.steps.map(step => ({ ...step, parameters: step.parameters.map(p => ({ ...p, setpoint: p.setpoint + 1 })) })) }));
  const session = { ...state, recipeVersions: versions };
  const finished = batchDetail(session, 0, 'B-A1-01150');
  const running = batchDetail(session, 0, 'B-A1-01151');
  if ('error' in finished || 'error' in running) throw new Error('unexpected detail error');
  expect(finished.parameters.map(p => p.setpoint)).toEqual([250, 31, 109]);
  expect(running.parameters.map(p => p.setpoint)).toEqual([253, 27, 113]);
  const compared = compareBatches(d, ['B-A1-01150', 'B-A2-01150']);
  if ('error' in compared) throw new Error(compared.error);
  expect(compared.columns[0]).toEqual({ batchId: 'B-A1-01150', lineId: 'A1', status: 'completed', durationMinutes: 105, durationSeconds: 6300, yieldPct: 97.9, scrap: 1 });
});

it('filters Recipe Version numbers and inclusive end dates as the remaining Ledger column controls', () => {
  // Recorded Recipe Version 2 runs ending on Dec 31 in São Paulo.
  const view = ledgerView(d, { filters: { recipeVersion: { min: 2, max: 2 }, end: { fromDate: '2025-12-31', toDate: '2025-12-31' } } });
  expect(view.rowCount).toBe(18);
  expect(view.rows.map(row => row.batchId)).toEqual(["B-A1-01147", "B-A1-01146", "B-A2-01146", "B-E1-00698", "B-RF1-00499", "B-P1-00399", "B-RF1-00498", "B-A2-01144", "B-A2-01143", "B-E2-00696", "B-E1-00696", "B-P1-00398", "B-E1-00695", "B-A2-01140", "B-RF1-00496", "B-C1-00398", "B-A1-01136", "B-E2-00693"]);
  expect(() => ledgerView(d, { filters: { end: { fromDate: '2026-01-01', toDate: '2025-12-31' } } })).toThrow('end fromDate must not be after toDate');
  expect(() => ledgerView(d, { filters: { recipeVersion: { min: 3, max: 2 } } })).toThrow('recipeVersion min must not exceed max');
});

it('exports the sort cycle, duration units, selection safety and localized filter summaries', () => {
  expect(nextLedgerSort({ ...LEDGER_DEFAULT_SORT }, 'start')).toEqual({ column: 'start', direction: 'asc' });
  const asc = nextLedgerSort(LEDGER_DEFAULT_SORT, 'batchId');
  expect(asc).toEqual({ column: 'batchId', direction: 'asc' });
  const desc = nextLedgerSort(asc, 'batchId');
  expect(desc).toEqual({ column: 'batchId', direction: 'desc' });
  expect(nextLedgerSort(desc, 'batchId')).toEqual(LEDGER_DEFAULT_SORT);
  expect(ledgerView(d, {}).canSelectAll).toBe(false);
  expect(ledgerView(sample, {}).canSelectAll).toBe(true);
  expect(ledgerView(sample, { selected: ['hidden', 'also-hidden'] }).canSelectAll).toBe(false);
  const filters = ledgerView(d, { filters: { areas: ['extrusion'], duration: { min: 2.5 }, batchId: 'missing' } }).activeFilters;
  expect(ledgerFilterDescriptions(d, filters, 'en')).toEqual(['Batch ID: missing', 'Area: Extrusion', 'Duration (min): From: 2 min 30 s']);
  expect(ledgerFilterDescriptions(d, filters, 'pt-BR')).toEqual(['ID do lote de produção: missing', 'Área: Extrusão', 'Duração (min): De: 2 min 30 s']);
});

it.each([
  ['en', ['assembly', 'extrusion', 'metalworking'], ['aborted', 'completed', 'rework']],
  ['pt-BR', ['extrusion', 'metalworking', 'assembly'], ['completed', 'aborted', 'rework']],
] as const)('sorts localized Area and status labels in %s, with ascending Batch id ties', (locale, areas, statuses) => {
  for (const [column, expected] of [['areaId', areas], ['status', statuses]] as const) {
    const ascending = ledgerView(d, { locale, sort: { column, direction: 'asc' } }).rows;
    expect([...new Set(ascending.map(row => row[column]))]).toEqual(expected);
    const descending = ledgerView(d, { locale, sort: { column, direction: 'desc' } }).rows;
    expect([...new Set(descending.map(row => row[column]))]).toEqual([...expected].reverse());
    for (const rows of [ascending, descending]) for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1]![column] === rows[i]![column]) expect(rows[i - 1]!.batchId < rows[i]!.batchId).toBe(true);
    }
  }
  if (locale === 'en') expect(ledgerView(d, { sort: { column: 'areaId', direction: 'asc' } }).rows.slice(0, 3).map(row => row.batchId))
    .toEqual(['B-A1-00001', 'B-A1-00002', 'B-A1-00003']);
});

it('reports visible and hidden selection counts and applies bulk proposals atomically', () => {
  expect(ledgerSelection(ledgerView(d, {}).rows, ['B-A1-01150', 'hidden'])).toEqual({ selectedCount: 2, selectedHidden: 1, canSelectAll: false });
  const selected = ['a', 'b'];
  expect(bulkSelection(selected, ['a', 'b', 'c', 'd', 'e'])).toEqual({ selected, result: 'selection-limit' });
  expect(bulkSelection(selected, ['a', 'b', 'c'])).toEqual({ selected: ['a', 'b', 'c'], result: 'selected' });
  expect(bulkSelection(selected, ['a'])).toEqual({ selected: ['a'], result: 'deselected' });
});

it.each(['recipeVersion', 'yield', 'scrap', 'duration'] as const)('rejects every non-finite %s bound with a clear error', column => {
  for (const value of [NaN, Infinity, -Infinity]) for (const bound of ['min', 'max']) {
    expect(() => ledgerView(d, { filters: { [column]: { [bound]: value } } })).toThrow('range bounds must be finite');
  }
});

it('formats date filters with core local dates and includes Product codes', () => {
  const active = ledgerView(d, { filters: { start: { fromDate: '2025-12-30', toDate: '2025-12-31' }, end: { fromDate: '2025-12-30' } } }).activeFilters;
  expect(ledgerFilterDescriptions(d, active, 'en')).toEqual(['Start: From: 12/30/2025, To: 12/31/2025', 'End: From: 12/30/2025']);
  expect(ledgerFilterDescriptions(d, active, 'pt-BR')).toEqual(['Início: De: 30/12/2025, Até: 31/12/2025', 'Fim: De: 30/12/2025']);
  const product = { ...d.products[0]!, code: 'TEST', name: { key: 'product.window-1-leaf' as const, params: { code: 'TEST' } } };
  const filters = [{ column: 'products' as const, value: [product.id] }];
  expect(ledgerFilterDescriptions({ ...d, products: [product] }, filters, 'en')).toEqual(['Product: TEST · Single-leaf window (TEST)']);
  expect(ledgerFilterDescriptions({ ...d, products: [product] }, filters, 'pt-BR')).toEqual(['Produto: TEST · Janela de uma folha (TEST)']);
});

it('pins localized sort labels and picker patterns to each language', () => {
  const labels = (locale: 'en' | 'pt-BR', column: 'areaId' | 'status') => [...new Set(ledgerView(d, { locale, sort: { column, direction: 'asc' } }).rows
    .map(row => column === 'areaId' ? tr(locale, row.areaName) : t(locale, `batch-status.${row.status}`)))];
  expect(labels('pt-BR', 'areaId')).toEqual(['Extrusão', 'Metalurgia', 'Montagem']);
  expect(labels('pt-BR', 'status')).toEqual(['Concluído', 'Interrompido', 'Retrabalho']);
  expect(labels('en', 'areaId')).toEqual(['Assembly', 'Extrusion', 'Metalworking']);
  expect(labels('en', 'status')).toEqual(['Aborted', 'Completed', 'Rework']);
  expect(DATE_PATTERNS).toEqual({ en: 'MM/DD/YYYY', 'pt-BR': 'DD/MM/YYYY' });
});

it('rejects fractional Recipe Version bounds instead of describing rounded values', () => {
  for (const bound of ['min', 'max'] as const) {
    expect(() => ledgerView(d, { filters: { recipeVersion: { [bound]: 1.4 } } })).toThrow('recipeVersion bounds must be integers');
  }
});

it('deduplicates selection in order before checking the four-Batch limit', () => {
  expect(toggleSelection(['a', 'a', 'b', 'c'], 'd')).toEqual({ selected: ['a', 'b', 'c', 'd'], result: 'selected' });
});

it.each(['start', 'end'] as const)('includes both exact São Paulo day boundaries for the %s date filter', column => {
  // Dec 31 local is [2025-12-31T03:00Z, 2026-01-01T03:00Z).
  const data = { ...d, batches: [
    { ...d.batches[0]!, id: 'before', start: 1767150000000 - 1, end: 1767150000000 - 1 },
    { ...d.batches[0]!, id: 'inside-first', start: 1767150000000, end: 1767150000000 },
    { ...d.batches[0]!, id: 'inside-last', start: 1767236400000 - 1, end: 1767236400000 - 1 },
    { ...d.batches[0]!, id: 'after', start: 1767236400000, end: 1767236400000 },
  ] };
  const view = ledgerView(data, { filters: { [column]: { fromDate: '2025-12-31', toDate: '2025-12-31' } } });
  expect(view.rowCount).toBe(2);
  expect(view.rows.map(row => row.batchId)).toEqual(['inside-last', 'inside-first']);
  expect(ledgerView(data, { filters: { [column]: { fromDate: '2025-12-31' } } }).rows.map(row => row.batchId)).toEqual(['after', 'inside-last', 'inside-first']);
  expect(ledgerView(data, { filters: { [column]: { toDate: '2025-12-31' } } }).rows.map(row => row.batchId)).toEqual(['inside-last', 'inside-first', 'before']);
});

it('returns a literal live Alarm record only for the running Batch that owns it', () => {
  // One Tag forced above its 195 °C maximum at tick zero; the other Tags
  // and seeded Alarms are absent, so no incidental transitions affect the example.
  const data = { ...d, alarms: [], tags: d.tags.filter(tag => tag.id === 'E1-extruder.barrel-zone-1-temp') };
  const initial = createPlantState(data);
  const session = { ...initial, overlay: { ...initial.overlay,
    setpoints: new Map([['E1-extruder.barrel-zone-1-temp', [{ fromTick: 0, value: 1000 }]]]),
  } };
  const running = batchDetail(session, 100, 'B-E1-00701');
  const finished = batchDetail(session, 100, 'B-E1-00700');
  if ('error' in running || 'error' in finished) throw new Error('unexpected detail error');
  expect(running.alarms.map(alarm => ({ id: alarm.id, state: alarm.state, raisedAt: alarm.raisedAt, ageSeconds: alarm.ageSeconds, canAcknowledge: alarm.canAcknowledge }))).toEqual([
    { id: 'RZ-0-E1-extruder.barrel-zone-1-temp-high', state: 'active-unacknowledged', raisedAt: 1767258000000, ageSeconds: 100, canAcknowledge: true },
  ]);
  expect(finished.alarms).toEqual([]);
});
