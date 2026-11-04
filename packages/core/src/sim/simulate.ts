import type { MockDataset, Timestamp } from '../mock/types';
import { shiftInfo, simulatedTime, type ShiftInfo } from './clock';
import { readLines, type LineLive } from './kpis';
import { readLinks, type MachineLink } from './links';
import { forcedDirections, readTags, type TagReading } from './tags';

export interface Snapshot {
  tick: number;
  time: Timestamp;
  shift: ShiftInfo;
  tags: TagReading[];
  machines: MachineLink[];
  lines: LineLive[];
}

/** Everything that changes over time, as a pure function of the Mock Dataset and the tick. */
export function simulate(d: MockDataset, tick: number): Snapshot {
  const machines = readLinks(d.machines, tick);
  const offline = new Set(machines.filter((m) => m.status === 'offline').map((m) => m.machineId));
  const tags = readTags(d.tags, tick, offline, forcedDirections(d.alarms));
  return { tick, time: simulatedTime(tick), shift: shiftInfo(tick), tags, machines, lines: readLines(d, tick, tags) };
}
