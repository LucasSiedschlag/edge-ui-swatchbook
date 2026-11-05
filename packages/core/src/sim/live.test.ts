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
});
