import { isActive } from '../plant/alarms';
import { activeRecipeParameter } from '../parameters';
import { normalizeFilters, type FilterInput } from './filters';
import { assertSessionTick } from '../sim/context';
import type { LineId, LinkStatus, MockDataset, Tag, Timestamp } from '../mock/types';
import type { Snapshot } from '../sim/simulate';
import type { MachineLink } from '../sim/links';
import type { TagReading, TagStatus } from '../sim/tags';

interface TagFilterValues {
  lineId?: LineId;
  machineId?: string;
  status?: TagStatus;
  /** Case-insensitive substring of the Tag name. */
  search?: string;
}
export type TagFilters = FilterInput<TagFilterValues>;

export const TAG_GRID_DEFAULT_FILTERS: TagFilters = Object.freeze({});

export interface TagRow {
  tagId: string;
  lineId: LineId;
  machineId: string;
  name: string;
  value: number;
  unit: string;
  /** The setpoint in force at the snapshot tick, after any Setpoint Override. */
  setpoint: number;
  min: number;
  max: number;
  status: TagStatus;
  alarm: 'high' | 'low' | null;
  writable: boolean;
  /** Writable and not Stale. A Tag of an Offline Machine cannot be overridden. */
  canOverride: boolean;
  /** Core refusal reason for an unavailable Override. */
  overrideUnavailable: 'tag-stale' | 'tag-not-writable' | null;
  /** Core reason why Reset is unavailable, including an unchanged Recipe value. */
  resetUnavailable: 'tag-stale' | 'no-recipe-value' | 'recipe-value-unchanged' | null;
  recipeValue: number | null;
  /** A different Recipe value exists and the Tag is not Stale, matching reset-to-recipe. */
  canResetToRecipe: boolean;
  linkStatus: LinkStatus;
  lastSeenAt: Timestamp;
}

/** The Live Parameter Matrix grid (Screen 5): one row per Tag in dataset order. Filters combine with AND. */
export function tagGridView(d: MockDataset, snapshot: Snapshot, input: TagFilters | null = TAG_GRID_DEFAULT_FILTERS): { rows: TagRow[]; empty: boolean } {
  const filters = normalizeFilters<TagFilterValues>(input);
  assertSessionTick(snapshot.tick);
  const readings = new Map(snapshot.tags.map((r) => [r.tagId, r]));
  const links = new Map(snapshot.machines.map((m) => [m.machineId, m]));
  const needle = filters.search?.toLowerCase() ?? '';
  const rows: TagRow[] = [];
  for (const tag of d.tags) {
    if (filters.lineId && tag.lineId !== filters.lineId) continue;
    if (filters.machineId && tag.machineId !== filters.machineId) continue;
    if (needle && !tag.name.toLowerCase().includes(needle)) continue;
    const reading = readings.get(tag.id)!;
    if (filters.status && reading.status !== filters.status) continue;
    const link = links.get(tag.machineId)!;
    rows.push(tagRow(d, tag, reading, link));
  }
  return { rows, empty: rows.length === 0 };
}

function tagRow(d: MockDataset, tag: Tag, reading: TagReading, link: MachineLink): TagRow {
  const recipeValue = activeRecipeParameter(d, tag)?.setpoint ?? null;
  return {
    tagId: tag.id, lineId: tag.lineId, machineId: tag.machineId, name: tag.name, value: reading.value, unit: tag.unit,
    setpoint: reading.setpoint, min: tag.min, max: tag.max, status: reading.status, alarm: reading.alarm,
    writable: tag.writable, canOverride: tag.writable && reading.status !== 'stale',
    overrideUnavailable: reading.status === 'stale' ? 'tag-stale' : !tag.writable ? 'tag-not-writable' : null,
    resetUnavailable: reading.status === 'stale' ? 'tag-stale' : recipeValue === null ? 'no-recipe-value' : recipeValue === reading.setpoint ? 'recipe-value-unchanged' : null,
    recipeValue, canResetToRecipe: reading.status !== 'stale' && recipeValue !== null && recipeValue !== reading.setpoint,
    linkStatus: link.status, lastSeenAt: link.lastSeenAt,
  };
}

/** Current details for an open Tag dialog, independent of grid filters and virtualization. */
export function tagDetailView(d: MockDataset, snapshot: Snapshot, tagId: string): TagRow | null {
  assertSessionTick(snapshot.tick);
  const tag = d.tags.find(tag => tag.id === tagId);
  if (!tag) return null;
  return tagRow(d, tag, snapshot.tags.find(reading => reading.tagId === tagId)!,
    snapshot.machines.find(link => link.machineId === tag.machineId)!);
}

export interface ConnectivityRow {
  alarmId: string | null;
  machineId: string;
  lineId: LineId;
  linkStatus: LinkStatus;
  latencyMs: number | null;
  packetLossPct: number;
  lastSeenAt: Timestamp;
  errorCount: number;
}

const LINK_RANK: Record<LinkStatus, number> = { offline: 0, degraded: 1, online: 2 };

export interface ConnectivitySort { column: 'status' | 'latency' | 'packetLoss' | 'machine'; direction: 'asc' | 'desc' }

export const DIAGNOSTICS_DEFAULT_SORT: ConnectivitySort = { column: 'status', direction: 'asc' };
/**
 * Default: Offline, Degraded, Online, then Machine id. Explicit status uses that severity order.
 * Explicit sorts put nulls last in both directions; ties always use Machine id ascending.
 */
export function connectivityView(d: MockDataset, snapshot: Snapshot, sort?: ConnectivitySort): ConnectivityRow[] {
  assertSessionTick(snapshot.tick);
  const { column, direction } = sort ?? DIAGNOSTICS_DEFAULT_SORT;
  if (!['status', 'latency', 'packetLoss', 'machine'].includes(column)) throw new Error('unknown connectivity column');
  if (direction !== 'asc' && direction !== 'desc') throw new Error('unknown connectivity direction');
  const alarmByMachine = new Map<string, string>();
  for (const a of d.alarms) if (a.message.key === 'alarm.comm-loss' &&
    isActive(a) && !alarmByMachine.has(a.machineId)) alarmByMachine.set(a.machineId, a.id);
  const value = (row: ConnectivityRow) => column === 'status' ? LINK_RANK[row.linkStatus] : column === 'latency' ? row.latencyMs : column === 'packetLoss' ? row.packetLossPct : row.machineId;
  const lineOf = new Map(d.machines.map((m) => [m.id, m.lineId]));
  return snapshot.machines
    .map((m): ConnectivityRow => ({
      alarmId: m.status === 'offline' ? alarmByMachine.get(m.machineId) ?? null : null,
      machineId: m.machineId, lineId: lineOf.get(m.machineId)!, linkStatus: m.status, latencyMs: m.latencyMs,
      packetLossPct: m.packetLossPct, lastSeenAt: m.lastSeenAt, errorCount: m.errorCount,
    }))
    .sort((a, b) => {
      const x = value(a), y = value(b);
      const compared = x === y ? 0 : x === null ? 1 : y === null ? -1 : (x < y ? -1 : 1) * (direction === 'asc' ? 1 : -1);
      return compared || (a.machineId < b.machineId ? -1 : a.machineId > b.machineId ? 1 : 0);
    });
}
