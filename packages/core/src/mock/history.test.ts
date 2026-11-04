import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { DAY, HOUR, MINUTE, NOW } from './time';

const d = generateMockDataset();
const lineIds = d.lines.map((l) => l.id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const near = (a: number, b: number, rel = 0.005) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * rel);

describe('shift history', () => {
  it('has 90 days x 3 Shifts x 7 Lines = 1,890 records', () => {
    expect(d.shiftHistory).toHaveLength(1890);
  });

  it('has a unique record per date, Shift and Line, from 2025-10-03 to 2025-12-31', () => {
    const keys = new Set(d.shiftHistory.map((r) => `${r.date}|${r.shift}|${r.lineId}`));
    expect(keys.size).toBe(1890);
    const dates = [...new Set(d.shiftHistory.map((r) => r.date))].sort();
    expect(dates).toHaveLength(90);
    expect(dates[0]).toBe('2025-10-03');
    expect(dates[89]).toBe('2025-12-31');
  });

  it('keeps run time plus downtime equal to the 480 planned minutes', () => {
    for (const r of d.shiftHistory) {
      expect(r.plannedMin).toBe(480);
      expect(r.runMin).toBeGreaterThanOrEqual(0);
      expect(r.runMin + sum(r.downtime.map((x) => x.minutes))).toBe(480);
    }
  });

  it('keeps good + scrap at or below target', () => {
    for (const r of d.shiftHistory) {
      expect(r.goodUnits).toBeGreaterThanOrEqual(0);
      expect(r.scrapUnits).toBeGreaterThanOrEqual(0);
      expect(r.goodUnits + r.scrapUnits).toBeLessThanOrEqual(r.targetUnits + 1);
    }
  });
});

describe('downtime reasons', () => {
  const lineIdsOf = (reason: string) => new Set(d.shiftHistory.filter((r) => r.downtime.some((x) => x.reason === reason)).map((r) => r.lineId));

  it('uses all 8 reasons from the Performance Screen', () => {
    const all = new Set(d.shiftHistory.flatMap((r) => r.downtime.map((x) => x.reason)));
    expect(all).toEqual(new Set(['die-change', 'saw-jam', 'material-shortage', 'changeover', 'vacuum-loss', 'weld-fault', 'tool-change', 'minor-stops']));
  });

  it('keeps Line-type reasons on their own Lines', () => {
    for (const reason of ['die-change', 'saw-jam', 'vacuum-loss']) expect([...lineIdsOf(reason)].sort()).toEqual(['E1', 'E2']);
    expect([...lineIdsOf('weld-fault')].sort()).toEqual(['A1', 'A2']);
    expect([...lineIdsOf('tool-change')].sort()).toEqual(['C1', 'P1']);
  });
});

describe('history agrees with the Batches', () => {
  const finished = (line: string) => d.batches.filter((b) => b.lineId === line);
  const active = (line: string) => d.activeBatches.filter((b) => b.lineId === line);

  it('adds up to the units the Batches made', () => {
    for (const line of lineIds) {
      const fromShifts = sum(d.shiftHistory.filter((r) => r.lineId === line).map((r) => r.goodUnits + r.scrapUnits));
      const fromBatches = sum(finished(line).map((b) => b.producedUnits)) + sum(active(line).map((b) => b.producedUnits));
      expect(near(fromShifts, fromBatches)).toBe(true);
    }
  });

  it('adds up to the scrap the Batches made', () => {
    for (const line of lineIds) {
      const fromShifts = sum(d.shiftHistory.filter((r) => r.lineId === line).map((r) => r.scrapUnits));
      const fromBatches = sum(finished(line).map((b) => b.scrap)) + sum(active(line).map((b) => b.scrapUnits));
      expect(near(fromShifts, fromBatches, 0.02)).toBe(true);
    }
  });

  it('adds up to the minutes the Batches ran', () => {
    for (const line of lineIds) {
      const fromShifts = sum(d.shiftHistory.filter((r) => r.lineId === line).map((r) => r.runMin));
      const fromBatches = sum(finished(line).map((b) => (b.end - b.start) / MINUTE)) + sum(active(line).map((b) => (NOW - b.start) / MINUTE));
      expect(near(fromShifts, fromBatches)).toBe(true);
    }
  });
});

describe('hourly output', () => {
  it('covers the last 7 days for every Line', () => {
    expect(d.hourlyOutput).toHaveLength(7 * 24 * 7);
    expect(new Set(d.hourlyOutput.map((h) => `${h.hourStart}|${h.lineId}`)).size).toBe(1176);
    for (const h of d.hourlyOutput) {
      expect(h.hourStart % HOUR).toBe(0);
      expect(h.hourStart).toBeGreaterThanOrEqual(NOW - 7 * DAY);
      expect(h.hourStart).toBeLessThan(NOW);
      expect(h.runMin).toBeLessThanOrEqual(60);
    }
  });

  it('adds up to the same units as the Shift history over the same 7 days', () => {
    for (const line of lineIds) {
      const hourly = sum(d.hourlyOutput.filter((h) => h.lineId === line).map((h) => h.goodUnits + h.scrapUnits));
      const lastShifts = d.shiftHistory.filter((r) => r.lineId === line).slice(-21);
      const shifts = sum(lastShifts.map((r) => r.goodUnits + r.scrapUnits));
      expect(near(hourly, shifts, 0.01)).toBe(true);
    }
  });
});
