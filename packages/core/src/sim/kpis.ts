import { IDEAL_UNITS_PER_MIN } from '../mock/batches';
import type { ActiveBatch, DowntimeReason, HourlyRecord, Line, LineId, MockDataset } from '../mock/types';
import { simulatedTime } from './clock';
import { hash, smooth } from './noise';
import { type Overlay, runTicksOf } from './overlay';
import type { TagReading } from './tags';

export const TAKT_SECONDS = 120;
const SHIFT_TICKS = 8 * 3600;
/** A running Batch makes 95 percent of the ideal rate, the same factor the Mock Dataset used for its progress so far. */
const EFFICIENCY = 0.95;
/** Ticks over which the live KPIs take over from the history baseline at the start of a Shift. */
const BLEND_TICKS = 1800;

export interface BatchProgress {
  batchId: string;
  lotId: string;
  producedUnits: number;
  targetUnits: number;
  /** Produced over target, one decimal. */
  percent: number;
  /** True once produced reaches target. The Line stays Running but makes nothing more. */
  complete: boolean;
  elapsedMs: number;
}

export interface LineLive {
  lineId: LineId;
  batch: BatchProgress | null;
  outputThisShift: number;
  scrapThisShift: number;
  /** Good units this Shift. */
  shiftGoodUnits: number;
  /** Ideal output for the time the Line made product this Shift. */
  shiftTargetUnits: number;
  /** Minutes the Line made product this Shift. */
  shiftRunMin: number;
  /** Lost time this Shift so far. Pauses and stops are minor stops, time with no Batch to run is changeover. */
  shiftDowntime: { reason: DowntimeReason; minutes: number }[];
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  /** Cycle time against takt, on Assembly Lines. */
  cycle: { value: number; takt: number; stale: boolean } | null;
  /** Line speed, on the other Lines. */
  lineSpeed: { value: number; unit: string; stale: boolean } | null;
}

interface Baseline { availability: number; performance: number; quality: number }
const baselines = new WeakMap<MockDataset, Map<LineId, Baseline>>();

/** What each Line did over its last 21 Shifts, so the live KPIs start where the history left off. */
function baselineOf(d: MockDataset, lineId: LineId): Baseline {
  let byLine = baselines.get(d);
  if (!byLine) baselines.set(d, (byLine = new Map()));
  const known = byLine.get(lineId);
  if (known) return known;
  const rows = d.shiftHistory.filter((r) => r.lineId === lineId).slice(-21);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const made = sum((r) => r.goodUnits + r.scrapUnits);
  const b: Baseline = {
    availability: sum((r) => r.runMin) / (sum((r) => r.plannedMin) || 1),
    performance: made / (sum((r) => r.targetUnits) || 1),
    quality: sum((r) => r.goodUnits) / (made || 1),
  };
  byLine.set(lineId, b);
  return b;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** How one running Batch advances. It only advances while the Line runs, and stops when the target is reached. */
function modelOf(active: ActiveBatch, rate: number, line: LineId, overlay?: Overlay) {
  const perTick = (rate * EFFICIENCY) / 60;
  const completeAfter = Math.ceil((active.targetUnits - active.producedUnits) / perTick);
  const ran = (from: number, to: number) => runTicksOf(overlay, line, from, to);
  const ratio = active.producedUnits > 0 ? active.scrapUnits / active.producedUnits : 0;
  return {
    /** Units made by a tick, good and scrap together. */
    unitsAt: (tick: number) => Math.min(active.targetUnits, active.producedUnits + Math.floor(perTick * ran(0, tick))),
    /** Ticks in a window in which the Line was making product. */
    makingTicks: (from: number, to: number) => Math.min(ran(0, to), completeAfter) - Math.min(ran(0, from), completeAfter),
    scrapOf: (units: number) => Math.floor(units * ratio),
    ranIn: ran,
  };
}

/** The shared live hour calculation. A partial hour plans only its elapsed minutes, rounded to whole minutes. */
function readHour(d: MockDataset, lineId: LineId, m: ReturnType<typeof modelOf> | null, from: number, to: number, overlay?: Overlay): HourlyRecord {
  const plannedMin = Math.round((to - from) / 60);
  const runMin = m ? Math.round(m.makingTicks(from, to) / 60) : 0;
  const ran = runTicksOf(overlay, lineId, from, to);
  // Keep rounding inside the minute budget: Pauses are minor stops, and time with nothing to run is changeover.
  const pausedMin = Math.max(0, Math.min(Math.round((to - from - ran) / 60), plannedMin - runMin));
  const changeoverMin = plannedMin - runMin - pausedMin;
  const downtime: HourlyRecord['downtime'] = [];
  if (pausedMin > 0) downtime.push({ reason: 'minor-stops', minutes: pausedMin });
  if (changeoverMin > 0) downtime.push({ reason: 'changeover', minutes: changeoverMin });
  const made = m ? m.unitsAt(to) - m.unitsAt(from) : 0;
  const scrap = m ? m.scrapOf(m.unitsAt(to)) - m.scrapOf(m.unitsAt(from)) : 0;
  return {
    hourStart: d.now + from * 1000, lineId, plannedMin, runMin, downtime,
    targetUnits: Math.round(made / EFFICIENCY), goodUnits: made - scrap, scrapUnits: scrap,
  };
}

/** A live Shift sums the same hour records that Screen 4 reads. */
function readShift(d: MockDataset, lineId: LineId, m: ReturnType<typeof modelOf> | null, from: number, to: number, overlay?: Overlay) {
  let runMin = 0;
  let goodUnits = 0;
  let scrapUnits = 0;
  let targetUnits = 0;
  const downtime: HourlyRecord['downtime'] = [];
  for (let start = from; start < to; start += 3600) {
    const h = readHour(d, lineId, m, start, Math.min(to, start + 3600), overlay);
    runMin += h.runMin;
    goodUnits += h.goodUnits;
    scrapUnits += h.scrapUnits;
    targetUnits += h.targetUnits;
    for (const x of h.downtime) {
      const existing = downtime.find((d) => d.reason === x.reason);
      if (existing) existing.minutes += x.minutes;
      else downtime.push({ ...x });
    }
  }
  return { runMin, goodUnits, scrapUnits, targetUnits, downtime };
}

const SPEED_TAG: Partial<Record<LineId, string>> = {
  E1: 'E1-puller.puller-speed',
  E2: 'E2-puller.puller-speed',
  RF1: 'RF1-roll-former.line-speed',
  P1: 'P1-stamping-press.stroke-rate',
  C1: 'C1-cnc.feed-rate',
};

export function readLines(d: MockDataset, tick: number, readings: TagReading[], overlay?: Overlay): LineLive[] {
  const reading = (id: string) => readings.find((r) => r.tagId === id);
  const unit = (id: string) => d.tags.find((t) => t.id === id)?.unit ?? '';
  return d.lines.map((line: Line) => {
    const active = d.activeBatches.find((b) => b.lineId === line.id);
    const m = active ? modelOf(active, IDEAL_UNITS_PER_MIN[line.type] as number, line.id, overlay) : null;
    // A Line that is paused, stopped, idle or finished with its Batch is not making product, so it has no speed or cycle time.
    const making = m ? m.makingTicks(tick, tick + 1) > 0 : false;
    const cycleTag = line.type === 'assembly' ? `${line.id}-corner-weld.cycle-time` : undefined;
    const cycleReading = cycleTag ? reading(cycleTag) : undefined;
    const speedTag = SPEED_TAG[line.id];
    const speedReading = speedTag ? reading(speedTag) : undefined;
    const base = {
      lineId: line.id,
      cycle: cycleReading && making ? { value: cycleReading.value, takt: TAKT_SECONDS, stale: cycleReading.status === 'stale' } : null,
      lineSpeed:
        speedTag && speedReading
          ? { value: making ? speedReading.value : 0, unit: unit(speedTag), stale: speedReading.status === 'stale' }
          : null,
    };

    const shiftStart = Math.floor(tick / SHIFT_TICKS) * SHIFT_TICKS;
    const elapsed = tick - shiftStart;
    const ran = runTicksOf(overlay, line.id, shiftStart, tick);
    const makingTicks = m ? m.makingTicks(shiftStart, tick) : 0;
    const totals = readShift(d, line.id, m, shiftStart, tick, overlay);
    const shiftDowntime = totals.downtime;

    if (!active || !m) {
      return { ...base, batch: null, outputThisShift: 0, scrapThisShift: 0, shiftGoodUnits: 0, shiftTargetUnits: 0, shiftRunMin: 0, shiftDowntime, availability: 0, performance: 0, quality: 0, oee: 0 };
    }
    const produced = m.unitsAt(tick);
    const output = totals.goodUnits + totals.scrapUnits;
    const scrap = totals.scrapUnits;
    const target = totals.targetUnits;

    // The first half hour of a Shift starts from the history baseline and moves to the live numbers.
    const b = baselineOf(d, line.id);
    // The blend runs while the Line has work this Shift, so a Pause lowers the numbers smoothly instead of jumping them.
    const hasWork = m.unitsAt(shiftStart) < active.targetUnits;
    const w = hasWork ? Math.min(1, elapsed / BLEND_TICKS) : 1;
    const key = hash(line.id);
    const wobble = (salt: number, size: number) => (smooth(key + salt, tick, 300) - 0.5) * size * (1 - w);
    const mix = (baseline: number, live: number, salt: number, size: number) => round3(clamp(baseline * (1 - w) + live * w + wobble(salt, size)));
    // The baseline only counts for the time the Line actually ran, so a Line stopped across a Shift change does not jump up.
    const ranShare = elapsed > 0 ? ran / elapsed : runTicksOf(overlay, line.id, tick, tick + 1) > 0 ? 1 : 0;
    const availability = mix(b.availability * ranShare, elapsed > 0 ? makingTicks / elapsed : 0, 1, 0.04);
    // Before the first unit of a Shift lands, a Line with work to do keeps the baseline instead of falling to 0 and jumping back up.
    const performance = mix(b.performance, output > 0 ? output / target : hasWork ? b.performance : 0, 2, 0.04);
    const quality = mix(b.quality, output > 0 ? (output - scrap) / output : hasWork ? b.quality : 0, 3, 0.02);
    return {
      ...base,
      batch: {
        batchId: active.id,
        lotId: active.lotId,
        producedUnits: produced,
        targetUnits: active.targetUnits,
        percent: Math.round((produced / active.targetUnits) * 1000) / 10,
        complete: produced >= active.targetUnits,
        elapsedMs: simulatedTime(tick) - active.start,
      },
      outputThisShift: output,
      scrapThisShift: scrap,
      shiftGoodUnits: output - scrap,
      shiftTargetUnits: target,
      shiftRunMin: totals.runMin,
      shiftDowntime,
      availability,
      performance,
      quality,
      oee: round3(availability * performance * quality),
    };
  });
}

/** One record per Line for every hour started since load. Partial hours plan elapsed minutes, rounded to whole minutes. */
export function readHours(d: MockDataset, tick: number, overlay?: Overlay): HourlyRecord[] {
  const out: HourlyRecord[] = [];
  const models = new Map(d.lines.map((line) => {
    const active = d.activeBatches.find((b) => b.lineId === line.id);
    return [line.id, active ? modelOf(active, IDEAL_UNITS_PER_MIN[line.type] as number, line.id, overlay) : null];
  }));
  const hours = Math.ceil(tick / 3600);
  for (let h = 0; h < hours; h++) {
    const from = h * 3600;
    const to = Math.min(tick, from + 3600);
    for (const line of d.lines) {
      out.push(readHour(d, line.id, models.get(line.id) ?? null, from, to, overlay));
    }
  }
  return out;
}
