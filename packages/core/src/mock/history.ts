import type { Rng } from './prng';
import { DAY, HISTORY_DAYS, HOUR, MINUTE, NOW, shiftAt, spDate } from './time';
import type { ActiveBatch, Batch, DowntimeReason, HourlyRecord, Line, LineType, ShiftRecord } from './types';

const SHIFT_MS = 8 * HOUR;
const HOURLY_DAYS = 7;

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

/** Shift and hourly output, built from the Batches so Ledger and Performance agree. NOW is the start of a Shift. */
export function generateHistory(rng: Rng, lines: Line[], batches: Batch[], active: ActiveBatch[]): HistorySection {
  const shiftCount = HISTORY_DAYS * 3;
  const shiftOrigin = NOW - HISTORY_DAYS * DAY;
  const hourOrigin = NOW - HOURLY_DAYS * DAY;
  const hourCount = HOURLY_DAYS * 24;

  const shiftBuckets = new Map<string, Bucket[]>();
  const hourBuckets = new Map<string, Bucket[]>();
  for (const line of lines) {
    const ivs = intervalsOf(line.id, batches, active);
    shiftBuckets.set(line.id, spread(ivs, shiftOrigin, SHIFT_MS, shiftCount));
    hourBuckets.set(line.id, spread(ivs, hourOrigin, HOUR, hourCount));
  }

  const shiftHistory: ShiftRecord[] = [];
  for (let k = 0; k < shiftCount; k++) {
    const start = shiftOrigin + k * SHIFT_MS;
    for (const line of lines) {
      const b = (shiftBuckets.get(line.id) as Bucket[])[k] as Bucket;
      const runMin = Math.min(480, Math.round(b.runMs / MINUTE));
      shiftHistory.push({
        date: spDate(start),
        shift: shiftAt(start),
        lineId: line.id,
        plannedMin: 480,
        runMin,
        downtime: allocateDowntime(rng, line.type, 480 - runMin),
        targetUnits: Math.round(b.target),
        goodUnits: Math.round(b.good),
        scrapUnits: Math.round(b.scrap),
      });
    }
  }

  const hourlyOutput: HourlyRecord[] = [];
  for (let k = 0; k < hourCount; k++) {
    for (const line of lines) {
      const b = (hourBuckets.get(line.id) as Bucket[])[k] as Bucket;
      hourlyOutput.push({
        hourStart: hourOrigin + k * HOUR,
        lineId: line.id,
        runMin: Math.min(60, Math.round(b.runMs / MINUTE)),
        targetUnits: Math.round(b.target),
        goodUnits: Math.round(b.good),
        scrapUnits: Math.round(b.scrap),
      });
    }
  }
  return { shiftHistory, hourlyOutput };
}
