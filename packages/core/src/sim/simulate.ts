import type { HourlyRecord, MockDataset, Timestamp } from '../mock/types';
import { shiftInfo, simulatedTime, type ShiftInfo } from './clock';
import { readHours, readLines, type LineLive } from './kpis';
import { readLinks, type MachineLink } from './links';
import { assertTick, contextOf } from './context';
import { assertOverlay, type Overlay } from './overlay';
import { readTag, type TagReading } from './tags';

export interface Snapshot {
  tick: number;
  time: Timestamp;
  shift: ShiftInfo;
  tags: TagReading[];
  machines: MachineLink[];
  lines: LineLive[];
  /** Hourly output since load, one record per Line per hour started. Same shape as the history in the Mock Dataset. */
  hours: HourlyRecord[];
}

/** Everything that changes over time, as a pure function of the Mock Dataset and the tick. */
export function simulate(d: MockDataset, tick: number, overlay?: Overlay): Snapshot {
  assertTick(tick);
  if (tick < 0) throw new Error('simulate needs a tick of 0 or more, use tagSeries for the time before load');
  assertOverlay(overlay);
  const ctx = contextOf(d);
  const machines = readLinks(d.machines, tick);
  const tags = [...ctx.tagById.values()].map((t) => readTag(ctx, t, tick, overlay));
  return { tick, time: simulatedTime(tick), shift: shiftInfo(tick), tags, machines, lines: readLines(d, tick, tags, overlay), hours: readHours(d, tick, overlay) };
}
