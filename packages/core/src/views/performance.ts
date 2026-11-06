import { HOUR, shiftAt, spDate } from '../mock/time';
import type { AreaId, DowntimeReason, HourlyRecord, LineId, MockDataset, ShiftId } from '../mock/types';
import { shiftInfo } from '../sim/clock';

import { type RangeId, rangeWindow } from './ranges';
export type { RangeId } from './ranges';
export type Scope = { kind: 'site' } | { kind: 'area'; areaId: AreaId } | { kind: 'line'; lineId: LineId };

export interface OeeParts {
  value: number;
  availability: number;
  performance: number;
  quality: number;
}

export interface ParetoRow {
  reason: DowntimeReason;
  minutes: number;
  sharePct: number;
  cumulativePct: number;
}

export interface OutputBucket {
  start: number;
  targetUnits: number;
  goodUnits: number;
  scrapUnits: number;
  /** Distinct hour slots in this local day, including empty boundary slots; only present for day buckets. */
  hours?: number;
}

export interface PerformanceShift {
  date: string;
  shift: ShiftId;
  startsAt: number;
  oee: number;
  goodUnits: number;
  scrapUnits: number;
  targetUnits: number;
  best: boolean;
  worst: boolean;
}

export interface PerformanceView {
  oee: OeeParts & { previous: OeeParts; change: OeeParts };
  pareto: ParetoRow[];
  output: OutputBucket[];
  shifts: PerformanceShift[];
  hasProduction: boolean;
}

interface Totals {
  plannedMin: number;
  runMin: number;
  targetUnits: number;
  goodUnits: number;
  scrapUnits: number;
}

const SHIFT = 8 * HOUR;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const totals = (): Totals => ({ plannedMin: 0, runMin: 0, targetUnits: 0, goodUnits: 0, scrapUnits: 0 });

function add(to: Totals, h: HourlyRecord): void {
  to.plannedMin += h.plannedMin;
  to.runMin += h.runMin;
  to.targetUnits += h.targetUnits;
  to.goodUnits += h.goodUnits;
  to.scrapUnits += h.scrapUnits;
}

function oee(t: Totals): OeeParts {
  const made = t.goodUnits + t.scrapUnits;
  const availability = t.plannedMin ? t.runMin / t.plannedMin : 0;
  const performance = t.targetUnits ? made / t.targetUnits : 0;
  const quality = made ? t.goodUnits / made : 0;
  // Multiply the raw ratios so rounding the displayed parts does not change OEE.
  return { value: round3(availability * performance * quality), availability: round3(availability),
    performance: round3(performance), quality: round3(quality) };
}

function paretoOf(minutes: Map<DowntimeReason, number>): ParetoRow[] {
  const rows = [...minutes].filter(([, value]) => value > 0)
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0));
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return [];
  // Allocate whole tenths by largest remainder. Shares total exactly 100 without cumulative overshoot.
  const exact = rows.map(([, value]) => value / total * 1000);
  const tenths = exact.map(Math.floor);
  const order = exact.map((value, i) => ({ i, remainder: value - tenths[i]! }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const left = 1000 - tenths.reduce((sum, value) => sum + value, 0);
  for (let k = 0; k < left; k++) tenths[order[k]!.i]! += 1;
  let cumulative = 0;
  return rows.map(([reason, value], i) => {
    cumulative += tenths[i]!;
    return { reason, minutes: value, sharePct: tenths[i]! / 10, cumulativePct: cumulative / 10 };
  });
}

/**
 * now = simulatedTime(tick). Last Shift is the eight hours before shiftInfo(tick).startsAt.
 * Other ranges contain 24, 168 or 720 hour slots ending with the current hour, including its real partial minutes.
 * The previous range is the same number of hour slots immediately before. Only supplied hourly records add minutes.
 * Day buckets use America/Sao_Paulo dates and start at their first included hour, allowing partial first and last days.
 * The last 30 completed Shifts depend on scope alone, with missing hours contributing zero production and minutes.
 */
export function performanceView(d: MockDataset, live: readonly HourlyRecord[], tick: number, scope: Scope, range: RangeId): PerformanceView {
  const shiftEnd = shiftInfo(tick).startsAt;
  const { start, end, hours } = rangeWindow(range, tick);
  const previousStart = start - hours * HOUR;
  const lines = new Set(d.lines.filter((line) => scope.kind === 'site' ||
    (scope.kind === 'area' ? line.areaId === scope.areaId : line.id === scope.lineId)).map((line) => line.id));
  const current = totals();
  const previous = totals();
  const downtime = new Map<DowntimeReason, number>();
  const shiftTotals = Array.from({ length: 30 }, totals);
  const output: OutputBucket[] = [];
  const byHour = new Map<number, OutputBucket>();
  const daily = range === 'last-7d' || range === 'last-30d';
  let date = '';
  let bucket: OutputBucket | undefined;
  // Empty slots preserve hour and local day boundaries, even at tick 0 or for an idle Line.
  for (let h = start; h < end; h += HOUR) {
    const nextDate = daily ? spDate(h) : '';
    if (!bucket || !daily || date !== nextDate) {
      bucket = { start: h, targetUnits: 0, goodUnits: 0, scrapUnits: 0, ...(daily ? { hours: 0 } : {}) };
      output.push(bucket);
      date = nextDate;
    }
    if (daily) bucket.hours = (bucket.hours ?? 0) + 1;
    byHour.set(h, bucket);
  }

  // History followed by live hours is the sole source for all blocks, including Shift history.
  for (const h of [...d.hourlyOutput, ...live]) {
    if (!lines.has(h.lineId)) continue;
    if (h.hourStart >= shiftEnd - 30 * SHIFT && h.hourStart < shiftEnd) {
      const index = Math.floor((shiftEnd - h.hourStart - 1) / SHIFT);
      add(shiftTotals[index]!, h);
    }
    if (h.hourStart < previousStart || h.hourStart >= end) continue;
    if (h.hourStart < start) {
      add(previous, h);
      continue;
    }
    add(current, h);
    for (const loss of h.downtime) downtime.set(loss.reason, (downtime.get(loss.reason) ?? 0) + loss.minutes);
    const out = byHour.get(h.hourStart)!;
    out.targetUnits += h.targetUnits;
    out.goodUnits += h.goodUnits;
    out.scrapUnits += h.scrapUnits;
  }

  const shifts: PerformanceShift[] = shiftTotals.map((t, i) => {
    const startsAt = shiftEnd - (i + 1) * SHIFT;
    return { date: spDate(startsAt), shift: shiftAt(startsAt), startsAt, oee: oee(t).value,
      goodUnits: t.goodUnits, scrapUnits: t.scrapUnits, targetUnits: t.targetUnits, best: false, worst: false };
  });
  // Scan oldest first so equal displayed OEE values choose the earliest Shift.
  let best = shifts[29]!;
  let worst = best;
  for (let i = 28; i >= 0; i--) {
    const shift = shifts[i]!;
    if (shift.oee > best.oee) best = shift;
    if (shift.oee < worst.oee) worst = shift;
  }
  best.best = true;
  worst.worst = true;
  const value = oee(current);
  const before = oee(previous);
  return {
    oee: { ...value, previous: before, change: {
      value: round3(value.value - before.value), availability: round3(value.availability - before.availability),
      performance: round3(value.performance - before.performance), quality: round3(value.quality - before.quality),
    } },
    pareto: paretoOf(downtime), output, shifts,
    hasProduction: current.runMin > 0 || current.goodUnits > 0 || current.scrapUnits > 0,
  };
}
