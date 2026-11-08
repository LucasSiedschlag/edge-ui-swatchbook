import { findBatch } from '../mock/lookup';
import { alarmList, type PlantState } from '../plant';
import { assertSessionTick } from '../sim/context';
import { alarmListView, type AlarmRow } from './alarms';
import type { AreaId, BatchStatus, Genealogy, LineId, MockDataset, Parameter, RecipeVersion, ShiftId, TextRef } from '../mock/types';

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
/** Lists combine with AND. An empty list matches nothing. Start is [from, to); other ranges are inclusive. */
export interface LedgerFilters {
  text?: string;
  areas?: readonly AreaId[];
  lines?: readonly LineId[];
  products?: readonly string[];
  shifts?: readonly ShiftId[];
  statuses?: readonly BatchStatus[];
  yield?: LedgerRange;
  scrap?: LedgerRange;
  duration?: LedgerRange;
  start?: { from?: number; to?: number };
}
export type ActiveFilter = { [K in keyof LedgerFilters]-?: { column: K; value: Exclude<LedgerFilters[K], undefined> } }[keyof LedgerFilters];
export interface LedgerQuery { filters?: LedgerFilters; sort?: { column: LedgerColumn; direction: 'asc' | 'desc' } }
export interface LedgerView { rows: LedgerRow[]; rowCount: number; totalCount: number; empty: boolean; activeFilters: ActiveFilter[] }

interface BaseRows { rows: readonly Readonly<LedgerRow>[]; search: readonly (readonly string[])[] }
const bases = new WeakMap<MockDataset, BaseRows>();
const order = (a: string | number | null, b: string | number | null): number => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;

function baseOf(d: MockDataset): BaseRows {
  let base = bases.get(d);
  if (base) return base;
  const lots = new Map(d.lots.map(l => [l.id, l]));
  const lines = new Map(d.lines.map(l => [l.id, l]));
  const products = new Map(d.products.map(p => [p.id, p]));
  const versions = new Map(d.recipeVersions.map(v => [v.id, v]));
  const rows = d.batches.map((b): Readonly<LedgerRow> => Object.freeze({
    batchId: b.id, lotId: b.lotId, upstreamLotId: lots.get(b.lotId)!.upstreamLotId,
    areaId: lines.get(b.lineId)!.areaId, lineId: b.lineId,
    productId: b.productId, productCode: products.get(b.productId)!.code,
    recipeVersionId: b.recipeVersionId, recipeVersion: versions.get(b.recipeVersionId)!.number,
    shift: b.shift, start: b.start, end: b.end, durationMinutes: (b.end - b.start) / 60000,
    status: b.status, yieldPct: b.yieldPct, scrap: b.scrap,
  }));
  base = { rows, search: rows.map(r => [r.batchId, r.lotId, r.upstreamLotId ?? ''].map(s => s.toLowerCase())) };
  bases.set(d, base);
  return base;
}

const COLUMNS: readonly LedgerColumn[] = ['batchId', 'lotId', 'upstreamLotId', 'areaId', 'lineId', 'productId', 'productCode', 'recipeVersionId', 'recipeVersion', 'shift', 'start', 'end', 'durationMinutes', 'status', 'yieldPct', 'scrap'];
const FILTER_ORDER = ['text', 'areas', 'lines', 'products', 'shifts', 'start', 'duration', 'statuses', 'yield', 'scrap'] as const;
const inRange = (n: number, r?: LedgerRange) => !r || ((r.min === undefined || n >= r.min) && (r.max === undefined || n <= r.max));

/** Finished Batches only. Code point ordering, null first ascending. Batch id ties always ascend. */
export function ledgerView(d: MockDataset, query: LedgerQuery): LedgerView {
  const { column, direction } = query.sort ?? { column: 'start', direction: 'desc' };
  if (!COLUMNS.includes(column)) throw new Error('unknown ledger column');
  if (direction !== 'asc' && direction !== 'desc') throw new Error('unknown ledger direction');
  const f = query.filters ?? {};
  const choices: [readonly string[] | undefined, readonly string[]][] = [
    [f.areas, d.areas.map(a => a.id)], [f.lines, d.lines.map(l => l.id)],
    [f.products, d.products.map(p => p.id)], [f.shifts, ['S1', 'S2', 'S3']],
    [f.statuses, ['completed', 'aborted', 'rework']],
  ];
  for (const [values, known] of choices) if (values?.some(v => !known.includes(v))) throw new Error('unknown ledger filter id');
  for (const range of [f.yield, f.scrap, f.duration, f.start]) {
    if (range && Object.values(range).some(n => n !== undefined && !Number.isFinite(n))) throw new Error('range bounds must be finite');
  }
  const base = baseOf(d);
  const needle = f.text?.trim().toLowerCase() ?? '';
  const activeFilters: ActiveFilter[] = [];
  for (const column of FILTER_ORDER) {
    const value = column === 'text' ? f.text?.trim() : f[column];
    if (value === undefined || value === '') continue;
    activeFilters.push({ column, value: Array.isArray(value) ? [...value] : typeof value === 'object' ? { ...value } : value } as ActiveFilter);
  }
  const rows = base.rows.filter((r, i) =>
    (!needle || base.search[i]!.some(s => s.includes(needle))) &&
    (!f.areas || f.areas.includes(r.areaId)) && (!f.lines || f.lines.includes(r.lineId)) &&
    (!f.products || f.products.includes(r.productId)) && (!f.shifts || f.shifts.includes(r.shift)) &&
    (!f.statuses || f.statuses.includes(r.status)) && inRange(r.yieldPct, f.yield) &&
    inRange(r.scrap, f.scrap) && inRange(r.durationMinutes, f.duration) &&
    (f.start?.from === undefined || r.start >= f.start.from) && (f.start?.to === undefined || r.start < f.start.to));
  rows.sort((a, b) => order(a[column], b[column]) * (direction === 'asc' ? 1 : -1) || order(a.batchId, b.batchId));
  return { rows, rowCount: rows.length, totalCount: base.rows.length, empty: rows.length === 0, activeFilters };
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
  return selected.length >= 2 && selected.length <= MAX_COMPARE;
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

/** Compare finished Batches. Parameter keys sort by code point; values follow the ids, including repeated ids. */
export function compareBatches(d: MockDataset, ids: readonly string[]): CompareView {
  if (!canCompare(ids)) return { error: 'compare-count' };
  const byId = new Map(d.batches.map(b => [b.id, b]));
  if (ids.some(id => !byId.has(id))) return { error: 'unknown-batch' };
  const batches = ids.map(id => byId.get(id)!);
  const versions = new Map(d.recipeVersions.map(v => [v.id, v]));
  const parameters = batches.map(b => new Map(runParameters(versions.get(b.recipeVersionId)!).map(p => [p.key, p])));
  const union = new Map<string, Parameter>();
  for (const params of parameters) for (const [key, p] of params) if (!union.has(key)) union.set(key, p);
  return {
    columns: batches.map(b => ({ batchId: b.id, durationMinutes: (b.end - b.start) / 60000, yieldPct: b.yieldPct, scrap: b.scrap, status: b.status, lineId: b.lineId })),
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

/** Genealogy is the stored chain, including pre-window Lots. Running Batches have no recorded actuals or end. */
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
  const version = state.recipeVersions.find(v => v.id === b.recipeVersionId)!;
  const parameters = runParameters(version).map((p): DetailParameter => {
    const actual = 'actuals' in b ? b.actuals[p.key] : undefined;
    return { parameterId: p.id, key: p.key, name: p.name, unit: p.unit, min: p.min, max: p.max,
      ...actualOf(p, actual), insideLimits: actual === undefined ? null : actual >= p.min && actual <= p.max };
  });
  const alarmIds = new Set(alarmList(state, tick).filter(a => a.batchId === batchId).map(a => a.id));
  const alarms = alarmListView(state, tick, { states: ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared'] }).rows.filter(a => alarmIds.has(a.id));
  return {
    header: { batchId: b.id, lotId: b.lotId, status: 'status' in b ? b.status : 'running', lineId: b.lineId,
      productCode: d.products.find(p => p.id === b.productId)!.code, start: b.start, end: 'end' in b ? b.end : null },
    genealogy, parameters, alarms,
  };
}
