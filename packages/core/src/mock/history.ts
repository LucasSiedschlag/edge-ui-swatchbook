import type { Rng } from './prng';
import { DAY, HISTORY_DAYS, HOUR, MINUTE, NOW, shiftAt, spDate } from './time';
import type { ActiveBatch, Batch, DowntimeReason, HourlyRecord, Line, LineType, ShiftRecord } from './types';

const SHIFT_MS = 8 * HOUR;

/** Which downtime reasons make sense on which Line type. */
const REASONS: Record<LineType, DowntimeReason[]> = {
  extrusion: ['die-change', 'saw-jam', 'vacuum-loss', 'material-shortage', 'changeover', 'minor-stops'],
  'roll-forming': ['material-shortage', 'changeover', 'minor-stops'],
  stamping: ['tool-change', 'changeover', 'minor-stops', 'material-shortage'],
  cnc: ['tool-change', 'changeover', 'minor-stops'],
  assembly: ['weld-fault', 'changeover', 'material-shortage', 'minor-stops'],
};

interface Interval { start: number; end: number; target: number; good: number; scrap: number }
interface Bucket { runMs: number; target: number; good: number; scrap: number }

/** Time a Batch ran, with its units. A running Batch counts up to NOW. */
function intervalsOf(lineId: string, batches: Batch[], active: ActiveBatch[]): Interval[] {
  const done = batches
    .filter((b) => b.lineId === lineId)
    .map((b) => ({ start: b.start, end: b.end, target: b.targetUnits, good: b.producedUnits - b.scrap, scrap: b.scrap }));
  const running = active
    .filter((b) => b.lineId === lineId)
    .map((b) => {
      const scrap = b.scrapUnits;
      const share = (NOW - b.start) / (b.plannedEnd - b.start);
      return { start: b.start, end: NOW, target: b.targetUnits * share, good: b.producedUnits - scrap, scrap };
    });
  return [...done, ...running];
}

/** Spreads each interval over the fixed-size windows it overlaps, in proportion to the time inside each. */
function spread(intervals: Interval[], origin: number, size: number, count: number): Bucket[] {
  const buckets: Bucket[] = Array.from({ length: count }, () => ({ runMs: 0, target: 0, good: 0, scrap: 0 }));
  for (const iv of intervals) {
    const len = iv.end - iv.start;
    const from = Math.max(0, Math.floor((iv.start - origin) / size));
    const to = Math.min(count - 1, Math.floor((iv.end - 1 - origin) / size));
    for (let k = from; k <= to; k++) {
      const w0 = origin + k * size;
      const overlap = Math.min(iv.end, w0 + size) - Math.max(iv.start, w0);
      if (overlap <= 0) continue;
      const f = overlap / len;
      const b = buckets[k] as Bucket;
      b.runMs += overlap;
      b.target += iv.target * f;
      b.good += iv.good * f;
      b.scrap += iv.scrap * f;
    }
  }
  return buckets;
}

/** Splits the minutes a Line was not running over one to three reasons that fit its type. */
function allocateDowntime(rng: Rng, type: LineType, minutes: number): { reason: DowntimeReason; minutes: number }[] {
  if (minutes <= 0) return [];
  const pool = [...REASONS[type]];
  const parts = Math.min(rng.int(1, 3), pool.length, minutes);
  const out: { reason: DowntimeReason; minutes: number }[] = [];
  let left = minutes;
  for (let i = 0; i < parts; i++) {
    const reason = pool.splice(rng.int(0, pool.length - 1), 1)[0] as DowntimeReason;
    const m = i === parts - 1 ? left : rng.int(1, left - (parts - 1 - i));
    out.push({ reason, minutes: m });
    left -= m;
  }
  return out;
}

export interface HistorySection {
  shiftHistory: ShiftRecord[];
  hourlyOutput: HourlyRecord[];
}

/** Sums chronological hourly records into Shifts, preserving hour then Line order. NOW is a Shift boundary. */
export function shiftsFromHours(hours: readonly HourlyRecord[]): ShiftRecord[] {
  const shifts = new Map<string, ShiftRecord>();
  for (const h of hours) {
    const start = NOW + Math.floor((h.hourStart - NOW) / SHIFT_MS) * SHIFT_MS;
    const key = `${start}/${h.lineId}`;
    let shift = shifts.get(key);
    if (!shift) {
      shift = {
        date: spDate(start), shift: shiftAt(start), lineId: h.lineId,
        plannedMin: 0, runMin: 0, downtime: [], targetUnits: 0, goodUnits: 0, scrapUnits: 0,
      };
      shifts.set(key, shift);
    }
    shift.plannedMin += h.plannedMin;
    shift.runMin += h.runMin;
    shift.targetUnits += h.targetUnits;
    shift.goodUnits += h.goodUnits;
    shift.scrapUnits += h.scrapUnits;
    for (const x of h.downtime) {
      const existing = shift.downtime.find((d) => d.reason === x.reason);
      if (existing) existing.minutes += x.minutes;
      else shift.downtime.push({ ...x });
    }
  }
  return [...shifts.values()];
}

/** Hourly records are the history base. Shift records only sum their eight hours. */
export function generateHistory(rng: Rng, lines: Line[], batches: Batch[], active: ActiveBatch[]): HistorySection {
  const hourOrigin = NOW - HISTORY_DAYS * DAY;
  const hourCount = HISTORY_DAYS * 24;
  const hourBuckets = new Map<string, Bucket[]>();
  for (const line of lines) {
    const buckets = spread(intervalsOf(line.id, batches, active), hourOrigin, HOUR, hourCount);
    // Round cumulative units and take differences, so small hourly scrap amounts are not repeatedly rounded away.
    for (const field of ['target', 'good', 'scrap'] as const) {
      let total = 0;
      for (const b of buckets) {
        const next = total + b[field];
        b[field] = Math.round(next) - Math.round(total);
        total = next;
      }
    }
    hourBuckets.set(line.id, buckets);
  }

  // Only the final idle tail has no next Batch. Gaps between Batches keep their Line-type reasons.
  const idleSince = new Map(lines.filter((line) => !active.some((b) => b.lineId === line.id))
    .map((line) => [line.id, Math.max(-Infinity, ...batches.filter((b) => b.lineId === line.id).map((b) => b.end))]));
  const hourlyOutput: HourlyRecord[] = [];
  for (let k = 0; k < hourCount; k++) {
    for (const line of lines) {
      const b = (hourBuckets.get(line.id) as Bucket[])[k] as Bucket;
      const runMin = Math.min(60, Math.round(b.runMs / MINUTE));
      const hourStart = hourOrigin + k * HOUR;
      const tailStart = idleSince.get(line.id);
      // Draw the usual allocation first so the seed keeps other Lines and earlier gaps unchanged.
      const downtime = allocateDowntime(rng, line.type, 60 - runMin);
      const idleTail = tailStart !== undefined && hourStart + HOUR > tailStart;
      hourlyOutput.push({
        hourStart,
        lineId: line.id,
        plannedMin: 60,
        runMin,
        downtime: idleTail && runMin < 60 ? [{ reason: 'changeover', minutes: 60 - runMin }] : downtime,
        targetUnits: b.target,
        goodUnits: b.good,
        scrapUnits: b.scrap,
      });
    }
  }
  return { shiftHistory: shiftsFromHours(hourlyOutput), hourlyOutput };
}
