import { SHIFT_IDS, BATCH_STATUSES } from '../mock/types';
import { normalizeFilters, type FilterInput } from './filters';
import { spDayStart, spDayEnd } from '../mock/time';
import { findBatch } from '../mock/lookup';
import { alarmList, type PlantState } from '../plant';
import { batchModel } from '../sim/kpis';
import { simulatedTime } from '../sim/clock';
import { assertSessionTick } from '../sim/context';
import { alarmListView, type AlarmRow } from './alarms';
import type { AreaId, Batch, BatchStatus, Genealogy, LineId, MockDataset, Parameter, RecipeVersion, ShiftId, TextRef } from '../mock/types';

export interface LedgerRow {
  batchId: string;
  lotId: string;
  upstreamLotId: string | null;
  areaId: AreaId;
  lineId: LineId;
  productId: string;
  productCode: string;
  recipeVersionId: string;
  recipeVersion: number;
  shift: ShiftId;
  start: number;
  end: number;
  durationMinutes: number;
  status: BatchStatus;
  yieldPct: number;
  scrap: number;
}
export type LedgerColumn = keyof LedgerRow;
export interface LedgerRange { min?: number; max?: number }
/** Lists combine with AND. Local start dates and numeric ranges are inclusive. */
export interface LedgerFilterValues {
  batchId?: string;
  lotId?: string;
  upstreamLotId?: string;
  areas?: readonly AreaId[];
  lines?: readonly LineId[];
  products?: readonly string[];
  shifts?: readonly ShiftId[];
  statuses?: readonly BatchStatus[];
  recipeVersion?: LedgerRange;
  yield?: LedgerRange;
  scrap?: LedgerRange;
  duration?: LedgerRange;
  start?: { fromDate?: string; toDate?: string };
  end?: { fromDate?: string; toDate?: string };
}
export type LedgerFilters = FilterInput<LedgerFilterValues>;
export type ActiveFilter = { [K in keyof LedgerFilterValues]-?: { column: K; value: Exclude<LedgerFilterValues[K], undefined> } }[keyof LedgerFilterValues];
export interface LedgerQuery {
  filters?: LedgerFilters | null;
  sort?: { column: LedgerColumn; direction: 'asc' | 'desc' };
  /** Selection survives filtering. Hidden selected Batches still count toward the limit of four. */
  selected?: readonly string[];
}
export interface LedgerView {
  rows: LedgerRow[];
  rowCount: number;
  totalCount: number;
  empty: boolean;
  activeFilters: ActiveFilter[];
  selectedCount: number;
  /** Count of distinct selected Batches absent from the filtered rows. */
  selectedHidden: number;
}

interface BaseRows {
  rows: readonly Readonly<LedgerRow>[];
  rowsById: ReadonlyMap<string, Readonly<LedgerRow>>;
  batchesById: ReadonlyMap<string, Batch>;
  search: readonly (readonly string[])[];
}
const bases = new WeakMap<MockDataset, BaseRows>();
const order = (a: string | number | null, b: string | number | null): number => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;

function baseOf(d: MockDataset): BaseRows {
  let base = bases.get(d);
  if (base) return base;
  const lots = new Map(d.lots.map(l => [l.id, l]));
  const lines = new Map(d.lines.map(l => [l.id, l]));
  const products = new Map(d.products.map(p => [p.id, p]));
  // Finished history always reads Mock Dataset versions; only running Batches use session versions.
  const versions = new Map(d.recipeVersions.map(v => [v.id, v]));
  const rows = d.batches.map((b): Readonly<LedgerRow> => Object.freeze({
    batchId: b.id, lotId: b.lotId, upstreamLotId: lots.get(b.lotId)!.upstreamLotId,
    areaId: lines.get(b.lineId)!.areaId, lineId: b.lineId,
    productId: b.productId, productCode: products.get(b.productId)!.code,
    recipeVersionId: b.recipeVersionId, recipeVersion: versions.get(b.recipeVersionId)!.number,
    shift: b.shift, start: b.start, end: b.end, durationMinutes: (b.end - b.start) / 60000,
    status: b.status, yieldPct: b.yieldPct, scrap: b.scrap,
  }));
  base = {
    rows, rowsById: new Map(rows.map(r => [r.batchId, r])), batchesById: new Map(d.batches.map(b => [b.id, b])),
    search: rows.map(r => [r.batchId, r.lotId, r.upstreamLotId ?? ''].map(s => s.toLowerCase())),
  };
  bases.set(d, base);
  return base;
}

const COLUMNS: readonly LedgerColumn[] = ['batchId', 'lotId', 'upstreamLotId', 'areaId', 'lineId', 'productId', 'productCode', 'recipeVersionId', 'recipeVersion', 'shift', 'start', 'end', 'durationMinutes', 'status', 'yieldPct', 'scrap'];
export const LEDGER_FILTER_COLUMNS = ['batchId', 'lotId', 'upstreamLotId', 'areas', 'lines', 'products', 'recipeVersion', 'shifts', 'start', 'end', 'duration', 'statuses', 'yield', 'scrap'] as const satisfies readonly (keyof LedgerFilterValues)[];
export type LedgerFilterColumn = typeof LEDGER_FILTER_COLUMNS[number];
const inRange = (n: number, r?: LedgerRange) => !r || ((r.min === undefined || n >= r.min) && (r.max === undefined || n <= r.max));

/** Finished Batches only. Code point ordering, null first ascending. Batch id ties always ascend. */
export function ledgerView(d: MockDataset, query: LedgerQuery): LedgerView {
  const { column, direction } = query.sort ?? { column: 'start', direction: 'desc' };
  if (!COLUMNS.includes(column)) throw new Error('unknown ledger column');
  if (direction !== 'asc' && direction !== 'desc') throw new Error('unknown ledger direction');
  const f = normalizeFilters<LedgerFilterValues>(query.filters);
  const choices: [readonly string[] | undefined, readonly string[]][] = [
    [f.areas, d.areas.map(a => a.id)], [f.lines, d.lines.map(l => l.id)],
    [f.products, d.products.map(p => p.id)], [f.shifts, SHIFT_IDS],
    [f.statuses, BATCH_STATUSES],
  ];
  for (const [values, known] of choices) if (values?.some(v => !known.includes(v))) throw new Error('unknown ledger filter id');
  for (const column of ['recipeVersion', 'yield', 'scrap', 'duration'] as const) {
    const range = f[column];
    if (range && Object.values(range).some(n => n !== undefined && !Number.isFinite(n))) throw new Error('range bounds must be finite');
    if (range?.min !== undefined && range.max !== undefined && range.min > range.max) throw new Error(`${column} min must not exceed max`);
  }
  const dates = (column: 'start' | 'end') => {
    const range = f[column];
    const from = range?.fromDate === undefined ? undefined : spDayStart(range.fromDate);
    const to = range?.toDate === undefined ? undefined : spDayEnd(range.toDate);
    if (from !== undefined && to !== undefined && from > to) throw new Error(`${column} fromDate must not be after toDate`);
    return { from, to };
  };
  const start = dates('start'), end = dates('end');
  const base = baseOf(d);
  const needles = [f.batchId, f.lotId, f.upstreamLotId].map(s => s?.toLowerCase() ?? '');
  const activeFilters: ActiveFilter[] = [];
  for (const column of LEDGER_FILTER_COLUMNS) {
    const value = f[column];
    if (value !== undefined) activeFilters.push({ column, value } as ActiveFilter);
  }
  const rows = base.rows.filter((r, i) =>
    needles.every((needle, j) => !needle || base.search[i]![j]!.includes(needle)) &&
    (!f.areas || f.areas.includes(r.areaId)) && (!f.lines || f.lines.includes(r.lineId)) &&
    (!f.products || f.products.includes(r.productId)) && (!f.shifts || f.shifts.includes(r.shift)) &&
    (!f.statuses || f.statuses.includes(r.status)) && inRange(r.recipeVersion, f.recipeVersion) && inRange(r.yieldPct, f.yield) &&
    inRange(r.scrap, f.scrap) && inRange(r.durationMinutes, f.duration) &&
    (start.from === undefined || r.start >= start.from) && (start.to === undefined || r.start <= start.to) &&
    (end.from === undefined || r.end >= end.from) && (end.to === undefined || r.end <= end.to));
  rows.sort((a, b) => order(a[column], b[column]) * (direction === 'asc' ? 1 : -1) || order(a.batchId, b.batchId));
  const selected = new Set(query.selected ?? []);
  const visible = new Set(rows.map(r => r.batchId));
  return { rows, rowCount: rows.length, totalCount: base.rows.length, empty: rows.length === 0, activeFilters,
    selectedCount: selected.size, selectedHidden: [...selected].filter(id => !visible.has(id)).length };
}


export const MAX_COMPARE = 4;
export interface SelectionResult { selected: string[]; result: 'selected' | 'deselected' | 'selection-limit' }

export function toggleSelection(selected: readonly string[], batchId: string): SelectionResult {
  if (selected.includes(batchId)) return { selected: selected.filter(id => id !== batchId), result: 'deselected' };
  // Preserve the caller's selection on a refused fifth selection, without writing through this reference.
  if (selected.length >= MAX_COMPARE) return { selected: selected as string[], result: 'selection-limit' };
  return { selected: [...selected, batchId], result: 'selected' };
}

export function canCompare(selected: readonly string[]): boolean {
  const count = new Set(selected).size;
  return count >= 2 && count <= MAX_COMPARE;
}

export interface ParameterActual { actual: number | null; setpoint: number; deviationPct: number | null }
export interface CompareParameter { key: string; name: TextRef; unit: string; values: (ParameterActual | null)[] }
export type CompareColumn = Pick<LedgerRow, 'batchId' | 'durationMinutes' | 'yieldPct' | 'scrap' | 'status' | 'lineId'>;
export type CompareView = { columns: CompareColumn[]; parameters: CompareParameter[] } | { error: 'compare-count' | 'unknown-batch' };

function runParameters(version: RecipeVersion): Parameter[] {
  return version.steps.filter(s => s.kind === 'run' || s.kind === 'process').flatMap(s => s.parameters);
}

/** A zero setpoint has no defined percentage deviation. Missing actuals stay unknown. */
function actualOf(p: Parameter, actual: number | undefined): ParameterActual {
  return { actual: actual ?? null, setpoint: p.setpoint, deviationPct: actual === undefined || p.setpoint === 0 ? null : (actual - p.setpoint) / Math.abs(p.setpoint) * 100 };
}

/** Compare finished Batches. Parameter keys sort by code point; values follow distinct ids in input order. */
export function compareBatches(d: MockDataset, ids: readonly string[]): CompareView {
  ids = [...new Set(ids)];
  if (!canCompare(ids)) return { error: 'compare-count' };
  const base = baseOf(d);
  const byId = base.batchesById;
  if (ids.some(id => !byId.has(id))) return { error: 'unknown-batch' };
  const batches = ids.map(id => byId.get(id)!);
  const versions = new Map(d.recipeVersions.map(v => [v.id, v]));
  const parameters = batches.map(b => new Map(runParameters(versions.get(b.recipeVersionId)!).map(p => [p.key, p])));
  const union = new Map<string, Parameter>();
  for (const params of parameters) for (const [key, p] of params) if (!union.has(key)) union.set(key, p);
  return {
    columns: batches.map(b => {
      const row = base.rowsById.get(b.id)!;
      return { batchId: row.batchId, durationMinutes: row.durationMinutes, yieldPct: row.yieldPct, scrap: row.scrap, status: row.status, lineId: row.lineId };
    }),
    parameters: [...union].sort(([a], [b]) => order(a, b)).map(([key, p]) => ({
      key, name: p.name, unit: p.unit,
      values: batches.map((b, i) => { const param = parameters[i]!.get(key); return param ? actualOf(param, b.actuals[key]) : null; }),
    })),
  };
}


export interface DetailParameter extends ParameterActual {
  parameterId: string;
  key: string;
  name: TextRef;
  unit: string;
  min: number;
  max: number;
  insideLimits: boolean | null;
}
export type GenealogyKind = Exclude<keyof Genealogy, 'lotId'>;
export interface DetailGenealogyNode { kind: GenealogyKind; lotId: string; batchId: string | null; serial?: string; linked: boolean }
export interface BatchHeader {
  batchId: string;
  lotId: string;
  status: BatchStatus | 'running';
  lineId: LineId;
  productCode: string;
  start: number;
  end: number | null;
}
export type BatchDetail = { header: BatchHeader; genealogy: DetailGenealogyNode[]; parameters: DetailParameter[]; alarms: AlarmRow[] } | { error: 'unknown-batch' };

/** Genealogy is the stored chain, including pre-window Lots. Running Batches have no recorded actuals. Their end becomes known at completion. */
export function batchDetail(state: PlantState, tick: number, batchId: string): BatchDetail {
  assertSessionTick(tick);
  const d = state.dataset;
  const b = findBatch(d, batchId);
  if (!b) return { error: 'unknown-batch' };
  const chain = d.genealogies.find(g => g.lotId === b.lotId);
  const genealogy: DetailGenealogyNode[] = [];
  for (const kind of ['materialLot', 'extrusion', 'metalwork', 'assembly'] as const) {
    const node = chain?.[kind];
    if (node) genealogy.push({ kind, ...node, linked: node.batchId !== null && node.batchId !== b.id && findBatch(d, node.batchId) !== undefined });
  }
  const version = ('end' in b ? d.recipeVersions : state.recipeVersions).find(v => v.id === b.recipeVersionId)!;
  const parameters = runParameters(version).map((p): DetailParameter => {
    const actual = 'actuals' in b ? b.actuals[p.key] : undefined;
    return { parameterId: p.id, key: p.key, name: p.name, unit: p.unit, min: p.min, max: p.max,
      ...actualOf(p, actual), insideLimits: actual === undefined ? null : actual >= p.min && actual <= p.max };
  });
  // The Batch owns Alarms raised in [start, actual completion), including time delayed by stops.
  const end = 'end' in b ? b.end : simulatedTime(batchModel(d, b, state.overlay).completionTick);
  const completed = end <= simulatedTime(tick);
  const alarmIds = new Set(alarmList(state, tick).filter(a => a.batchId === batchId && a.raisedAt >= b.start && a.raisedAt < end).map(a => a.id));
  const alarms = alarmListView(state, tick, { states: ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'] }).rows.filter(a => alarmIds.has(a.id));
  return {
    header: { batchId: b.id, lotId: b.lotId, status: 'status' in b ? b.status : completed ? 'completed' : 'running', lineId: b.lineId,
      productCode: d.products.find(p => p.id === b.productId)!.code, start: b.start, end: completed ? end : null },
    genealogy, parameters, alarms,
  };
}
