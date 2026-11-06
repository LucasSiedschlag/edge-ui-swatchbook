import { HOUR, shiftAt, spDate, spHour } from '../mock/time';
import type { AreaId, DowntimeReason, HourlyRecord, LineId, MockDataset, ShiftId } from '../mock/types';
import { shiftInfo, simulatedTime } from '../sim/clock';

import { type RangeId, performanceWindow } from './ranges';
export type { RangeId } from './ranges';
export type Scope = { kind: 'site' } | { kind: 'area'; areaId: AreaId } | { kind: 'line'; lineId: LineId };

export interface OeeParts {
  value: number;
  availability: number;
  performance: number;
  quality: number | null;
}

export interface ParetoRow {
  reason: DowntimeReason;
  minutes: number;
  sharePct: number;
  cumulativePct: number;
}

export interface OutputBucket {
  start: number;
  date: string;
  hour: number;
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
  oee: (OeeParts & { previous: OeeParts | null; change: OeeParts | null }) | null;
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
const hasProduction = (t: Totals) => t.runMin > 0 || t.goodUnits > 0 || t.scrapUnits > 0;
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
  const availability = round3(t.plannedMin ? t.runMin / t.plannedMin : 0);
  const performance = round3(t.targetUnits ? made / t.targetUnits : 0);
  const quality = made ? round3(t.goodUnits / made) : null;
  // Use the displayed parts, matching LineLive. No units means quality has no value.
  return { value: round3(availability * performance * (quality ?? 0)), availability, performance, quality };
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
 * All blocks sum the same hourly records. The previous window is adjacent and equal in length.
 * Long ranges end at load; short ranges use the Event Log windows.
 * Day buckets use America/Sao_Paulo dates, including partial boundary days.
 */
export function performanceView(d: MockDataset, live: readonly HourlyRecord[], tick: number, scope: Scope, range: RangeId): PerformanceView {
  const { start, end, hours } = performanceWindow(range, tick);
  const daily = range === 'last-7d' || range === 'last-30d';
  const shiftEnd = daily ? simulatedTime(0) : shiftInfo(tick).startsAt;
  const previousStart = start - hours * HOUR;
  const lines = new Set(d.lines.filter((line) => scope.kind === 'site' ||
    (scope.kind === 'area' ? line.areaId === scope.areaId : line.id === scope.lineId)).map((line) => line.id));
  const current = totals();
  const previous = totals();
  const downtime = new Map<DowntimeReason, number>();
  const shiftTotals = Array.from({ length: 30 }, totals);
  const output: OutputBucket[] = [];
  const byHour = new Map<number, OutputBucket>();
  let date = '';
  let bucket: OutputBucket | undefined;
  // Empty slots preserve hour and local day boundaries, even at tick 0 or for an idle Line.
  for (let h = start; h < end; h += HOUR) {
    const nextDate = daily ? spDate(h) : '';
    if (!bucket || !daily || date !== nextDate) {
      bucket = { start: h, date: spDate(h), hour: spHour(h), targetUnits: 0, goodUnits: 0, scrapUnits: 0, ...(daily ? { hours: 0 } : {}) };
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

  if (!hasProduction(current)) return { hasProduction: false, oee: null, pareto: [], output: [], shifts: [] };

  const shifts: PerformanceShift[] = shiftTotals.map((t, i) => ({ t, i }))
    .filter(({ t }) => t.plannedMin > 0 || hasProduction(t)).map(({ t, i }) => {
      const startsAt = shiftEnd - (i + 1) * SHIFT;
      return { date: spDate(startsAt), shift: shiftAt(startsAt), startsAt, oee: oee(t).value,
        goodUnits: t.goodUnits, scrapUnits: t.scrapUnits, targetUnits: t.targetUnits, best: false, worst: false };
    });
  // Equal displayed values have no best or worst. Otherwise ties choose the earliest Shift.
  if (shifts.length >= 2) {
    let best = shifts[shifts.length - 1]!;
    let worst = best;
    for (let i = shifts.length - 2; i >= 0; i--) {
      const shift = shifts[i]!;
      if (shift.oee > best.oee) best = shift;
      if (shift.oee < worst.oee) worst = shift;
    }
    if (best.oee !== worst.oee) {
      best.best = true;
      worst.worst = true;
    }
  }
  const value = oee(current);
  const before = hasProduction(previous) ? oee(previous) : null;
  return {
    oee: { ...value, previous: before, change: before ? {
      value: round3(value.value - before.value), availability: round3(value.availability - before.availability),
      performance: round3(value.performance - before.performance), quality: value.quality === null || before.quality === null ? null : round3(value.quality - before.quality),
    } : null },
    pareto: paretoOf(downtime), output, shifts,
    hasProduction: true,
  };
}
