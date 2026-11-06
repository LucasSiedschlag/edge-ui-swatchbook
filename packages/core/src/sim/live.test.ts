import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import type { Overlay } from './overlay';
import { simulate } from './simulate';

const d = generateMockDataset();
const HOUR = 3_600_000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const forLine = (tick: number, line: string, overlay?: Overlay) => {
  const s = simulate(d, tick, overlay);
  return { live: s.lines.find((l) => l.lineId === line), hours: s.hours.filter((h) => h.lineId === line) };
};

describe('live hourly and Shift records', () => {
  it('has nothing at tick 0', () => {
    const s = simulate(d, 0);
    expect(s.hours).toHaveLength(0);
    for (const l of s.lines) expect([l.shiftRunMin, l.shiftTargetUnits, l.shiftGoodUnits]).toEqual([0, 0, 0]);
  });

  it('adds one record per Line for every hour started since load', () => {
    expect(simulate(d, 3600).hours).toHaveLength(7);
    expect(simulate(d, 3601).hours).toHaveLength(14);
    const hours = simulate(d, 7300).hours;
    expect(new Set(hours.map((h) => h.hourStart))).toEqual(new Set([d.now, d.now + HOUR, d.now + 2 * HOUR]));
    expect(hours.every((h) => h.runMin <= 60 && h.runMin >= 0)).toBe(true);
  });

  it('adds up to the output and run time this Shift', () => {
    for (const line of ['E1', 'A1', 'RF1']) {
      const { live, hours } = forLine(7300, line);
      expect(sum(hours.map((h) => h.goodUnits + h.scrapUnits))).toBe(live?.outputThisShift);
      expect(sum(hours.map((h) => h.goodUnits))).toBe(live?.shiftGoodUnits);
      expect(Math.abs(sum(hours.map((h) => h.runMin)) - (live?.shiftRunMin ?? 0))).toBeLessThanOrEqual(3);
    }
  });

  it('keeps the target at or above what was made, like the history records', () => {
    for (const h of simulate(d, 7300).hours) expect(h.targetUnits).toBeGreaterThanOrEqual(h.goodUnits + h.scrapUnits);
  });

  it('shows an idle Line, and a finished Batch, as zero run time', () => {
    expect(forLine(7300, 'C1').hours.every((h) => h.runMin === 0 && h.goodUnits === 0)).toBe(true);
    expect(forLine(7300, 'A1').hours[2]?.runMin).toBe(0);
  });

  it('loses run time in the hour a Line was paused', () => {
    const paused: Overlay = { runTicks: (line, from, to) => (line === 'E1' ? Math.max(0, to - from - Math.max(0, Math.min(to, 660) - Math.max(from, 60))) : to - from) };
    const plain = forLine(3601, 'E1').hours[0];
    const lost = forLine(3601, 'E1', paused).hours[0];
    expect((plain?.runMin ?? 0) - (lost?.runMin ?? 0)).toBeGreaterThanOrEqual(9);
  });

  it('starts again at zero for the next Shift', () => {
    const { live } = forLine(8 * 3600, 'E1');
    expect([live?.shiftRunMin, live?.shiftTargetUnits, live?.shiftGoodUnits]).toEqual([0, 0, 0]);
  });

  it('uses elapsed whole minutes for the last partial hour and balances run plus downtime', () => {
    for (const tick of [1, 29, 30, 59, 60, 3599, 3600, 3601, 3630, 7300, 28_801]) {
      const s = simulate(d, tick);
      for (const h of s.hours) {
        const elapsed = Math.min(3600, tick - (h.hourStart - d.now) / 1000);
        expect(h.plannedMin).toBe(Math.round(elapsed / 60));
        expect(h.runMin + sum(h.downtime.map((x) => x.minutes))).toBe(h.plannedMin);
        for (const x of h.downtime) expect(x.minutes).toBeGreaterThan(0);
      }
    }
  });

  it('sums current Shift hourly downtime, run minutes and output for every Line across Shift boundaries', () => {
    // Pauses cross hour and Shift boundaries, including a stop after production has finished.
    const spans = [[3571, 3631], [7191, 7259], [28_770, 28_870], [31_200, 31_291], [57_570, 57_670]];
    const paused: Overlay = {
      runTicks: (_line, from, to) => to - from - sum(spans.map(([a = 0, b = 0]) => Math.max(0, Math.min(to, b) - Math.max(from, a)))),
    };
    const totals = (rows: { downtime: { reason: string; minutes: number }[] }[]) => {
      const out: Record<string, number> = {};
      for (const row of rows) for (const x of row.downtime) out[x.reason] = (out[x.reason] ?? 0) + x.minutes;
      return out;
    };
    for (const overlay of [undefined, paused]) {
      for (const tick of [0, 30, 3601, 3631, 7259, 20_000, 28_799, 28_800, 28_801, 28_870, 31_300, 57_670, 86_401]) {
        const s = simulate(d, tick, overlay);
        const shiftStart = d.now + Math.floor(tick / 28_800) * 28_800_000;
        for (const live of s.lines) {
          const hours = s.hours.filter((h) => h.lineId === live.lineId && h.hourStart >= shiftStart);
          expect(totals(hours)).toEqual(totals([{ downtime: live.shiftDowntime }]));
          expect(Math.abs(sum(hours.map((h) => h.runMin)) - live.shiftRunMin)).toBeLessThanOrEqual(3);
          expect(sum(hours.map((h) => h.goodUnits))).toBe(live.shiftGoodUnits);
          expect(sum(hours.map((h) => h.scrapUnits))).toBe(live.scrapThisShift);
          expect(sum(hours.map((h) => h.targetUnits))).toBe(live.shiftTargetUnits);
          expect(sum(hours.map((h) => h.plannedMin))).toBe(Math.round((tick % 28_800) / 60));
        }
      }
    }
  });

  it('labels hourly pauses as minor stops and idle or completed time as changeover', () => {
    const paused: Overlay = { runTicks: (_line, from, to) => to - from - Math.max(0, Math.min(to, 900) - Math.max(from, 300)) };
    const hours = simulate(d, 1200, paused).hours;
    expect(hours.find((h) => h.lineId === 'E1')?.downtime).toEqual([{ reason: 'minor-stops', minutes: 10 }]);
    expect(hours.find((h) => h.lineId === 'C1')?.downtime).toEqual([{ reason: 'minor-stops', minutes: 10 }, { reason: 'changeover', minutes: 10 }]);
    expect(forLine(7300, 'A1').hours[2]?.downtime).toEqual([{ reason: 'changeover', minutes: 2 }]);
  });
});
