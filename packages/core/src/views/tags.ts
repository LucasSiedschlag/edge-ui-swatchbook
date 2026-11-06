import { assertSessionTick } from '../sim/context';
import type { LineId, LinkStatus, MockDataset, Timestamp } from '../mock/types';
import type { Snapshot } from '../sim/simulate';
import type { TagStatus } from '../sim/tags';

export interface TagFilters {
  lineId?: LineId;
  machineId?: string;
  status?: TagStatus;
  /** Case-insensitive substring of the Tag name. */
  search?: string;
}

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
  linkStatus: LinkStatus;
  lastSeenAt: Timestamp;
}

/** The Live Parameter Matrix grid (Screen 5): one row per Tag in dataset order. Filters combine with AND. */
export function tagGridView(d: MockDataset, snapshot: Snapshot, filters: TagFilters = {}): { rows: TagRow[]; empty: boolean } {
  assertSessionTick(snapshot.tick);
  const readings = new Map(snapshot.tags.map((r) => [r.tagId, r]));
  const links = new Map(snapshot.machines.map((m) => [m.machineId, m]));
  const needle = filters.search?.trim().toLowerCase() ?? '';
  const rows: TagRow[] = [];
  for (const tag of d.tags) {
    if (filters.lineId && tag.lineId !== filters.lineId) continue;
    if (filters.machineId && tag.machineId !== filters.machineId) continue;
    if (needle && !tag.name.toLowerCase().includes(needle)) continue;
    const reading = readings.get(tag.id)!;
    if (filters.status && reading.status !== filters.status) continue;
    const link = links.get(tag.machineId)!;
    rows.push({
      tagId: tag.id, lineId: tag.lineId, machineId: tag.machineId, name: tag.name, value: reading.value, unit: tag.unit,
      setpoint: reading.setpoint, min: tag.min, max: tag.max, status: reading.status, alarm: reading.alarm,
      writable: tag.writable, canOverride: tag.writable && reading.status !== 'stale',
      linkStatus: link.status, lastSeenAt: link.lastSeenAt,
    });
  }
  return { rows, empty: rows.length === 0 };
}

export interface ConnectivityRow {
  machineId: string;
  lineId: LineId;
  linkStatus: LinkStatus;
  latencyMs: number | null;
  packetLossPct: number;
  lastSeenAt: Timestamp;
  errorCount: number;
}

const LINK_RANK: Record<LinkStatus, number> = { offline: 0, degraded: 1, online: 2 };

/** Link diagnostics of every Machine (Screen 6), Offline first, then Degraded, then Online, then by Machine id. */
export function connectivityView(d: MockDataset, snapshot: Snapshot): ConnectivityRow[] {
  assertSessionTick(snapshot.tick);
  const lineOf = new Map(d.machines.map((m) => [m.id, m.lineId]));
  return snapshot.machines
    .map((m): ConnectivityRow => ({
      machineId: m.machineId, lineId: lineOf.get(m.machineId)!, linkStatus: m.status, latencyMs: m.latencyMs,
      packetLossPct: m.packetLossPct, lastSeenAt: m.lastSeenAt, errorCount: m.errorCount,
    }))
    .sort((a, b) => LINK_RANK[a.linkStatus] - LINK_RANK[b.linkStatus] || (a.machineId < b.machineId ? -1 : a.machineId > b.machineId ? 1 : 0));
}
