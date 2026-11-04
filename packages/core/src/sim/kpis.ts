import { IDEAL_UNITS_PER_MIN } from '../mock/batches';
import type { ActiveBatch, Line, LineId, MockDataset } from '../mock/types';
import { simulatedTime } from './clock';
import { hash, smooth } from './noise';
import type { TagReading } from './tags';

export const TAKT_SECONDS = 120;
const SHIFT_TICKS = 8 * 3600;
/** A running Batch makes 95 percent of the ideal rate, the same factor the Mock Dataset used for its progress so far. */
const EFFICIENCY = 0.95;

export interface BatchProgress {
  batchId: string;
  lotId: string;
  producedUnits: number;
  targetUnits: number;
  /** Produced over target, one decimal. */
  percent: number;
  elapsedMs: number;
}

export interface LineLive {
  lineId: LineId;
  batch: BatchProgress | null;
  outputThisShift: number;
  scrapThisShift: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  /** Cycle time against takt, on Assembly Lines. */
  cycle: { value: number; takt: number } | null;
  /** Line speed, on the other Lines. */
  lineSpeed: { value: number; unit: string } | null;
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

function unitsAt(b: ActiveBatch, rate: number, tick: number): number {
  return Math.min(b.targetUnits, b.producedUnits + Math.floor((rate * EFFICIENCY * tick) / 60));
}

const SPEED_TAG: Partial<Record<LineId, string>> = {
  E1: 'E1-puller.puller-speed',
  E2: 'E2-puller.puller-speed',
  RF1: 'RF1-roll-former.line-speed',
  P1: 'P1-stamping-press.stroke-rate',
  C1: 'C1-cnc.feed-rate',
};

export function readLines(d: MockDataset, tick: number, readings: TagReading[]): LineLive[] {
  const value = (id: string) => readings.find((r) => r.tagId === id)?.value;
  const unit = (id: string) => d.tags.find((t) => t.id === id)?.unit ?? '';
  return d.lines.map((line: Line) => {
    const active = d.activeBatches.find((b) => b.lineId === line.id);
    const cycleValue = line.type === 'assembly' ? value(`${line.id}-corner-weld.cycle-time`) : undefined;
    const speedTag = SPEED_TAG[line.id];
    const speedValue = speedTag ? value(speedTag) : undefined;
    const base = {
      lineId: line.id,
      cycle: cycleValue === undefined ? null : { value: cycleValue, takt: TAKT_SECONDS },
      lineSpeed: speedTag && speedValue !== undefined ? { value: speedValue, unit: unit(speedTag) } : null,
    };
    if (!active) {
      return { ...base, batch: null, outputThisShift: 0, scrapThisShift: 0, availability: 0, performance: 0, quality: 0, oee: 0 };
    }
    const rate = IDEAL_UNITS_PER_MIN[line.type] as number;
    const produced = unitsAt(active, rate, tick);
    const shiftStart = Math.floor(tick / SHIFT_TICKS) * SHIFT_TICKS;
    const output = produced - unitsAt(active, rate, shiftStart);
    const scrapRatio = active.producedUnits > 0 ? active.scrapUnits / active.producedUnits : 0;
    const b = baselineOf(d, line.id);
    const key = hash(line.id);
    const wobble = (salt: number, size: number) => (smooth(key + salt, tick, 300) - 0.5) * size;
    const availability = round3(clamp(b.availability + wobble(1, 0.04)));
    const performance = round3(clamp(b.performance + wobble(2, 0.04)));
    const quality = round3(clamp(b.quality + wobble(3, 0.02)));
    return {
      ...base,
      batch: {
        batchId: active.id,
        lotId: active.lotId,
        producedUnits: produced,
        targetUnits: active.targetUnits,
        percent: Math.round((produced / active.targetUnits) * 1000) / 10,
        elapsedMs: simulatedTime(tick) - active.start,
      },
      outputThisShift: output,
      scrapThisShift: Math.floor(output * scrapRatio),
      availability,
      performance,
      quality,
      oee: round3(availability * performance * quality),
    };
  });
}
