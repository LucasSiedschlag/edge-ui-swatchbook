import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { shiftsFromHours } from './history';
import type { DowntimeReason, HourlyRecord } from './types';
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
    for (const [i, row] of d.shiftHistory.entries()) {
      const shiftIndex = Math.floor(i / d.lines.length);
      const start = NOW - 90 * DAY + shiftIndex * 8 * HOUR;
      expect(row.lineId).toBe(d.lines[i % d.lines.length]?.id);
      expect(row.shift).toBe(['S1', 'S2', 'S3'][shiftIndex % 3]);
      expect(row.date).toBe(new Date(start - 3 * HOUR).toISOString().slice(0, 10));
    }
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

describe.each(['hourlyOutput', 'shiftHistory'] as const)('%s downtime reasons', (section) => {
  const lineIdsOf = (reason: string) => new Set(d[section].filter((r) => r.downtime.some((x) => x.reason === reason)).map((r) => r.lineId));

  it('uses all 8 reasons from the Performance Screen', () => {
    const all = new Set(d[section].flatMap((r) => r.downtime.map((x) => x.reason)));
    expect(all).toEqual(new Set(['die-change', 'saw-jam', 'material-shortage', 'changeover', 'vacuum-loss', 'weld-fault', 'tool-change', 'minor-stops']));
  });

  it('keeps Line-type reasons on their own Lines', () => {
    for (const reason of ['die-change', 'saw-jam', 'vacuum-loss']) expect([...lineIdsOf(reason)].sort()).toEqual(['E1', 'E2']);
    expect([...lineIdsOf('weld-fault')].sort()).toEqual(['A1', 'A2']);
    expect([...lineIdsOf('tool-change')].sort()).toEqual(['C1', 'P1']);
    const allowed = {
      extrusion: ['die-change', 'saw-jam', 'vacuum-loss', 'material-shortage', 'changeover', 'minor-stops'],
      'roll-forming': ['material-shortage', 'changeover', 'minor-stops'],
      stamping: ['tool-change', 'changeover', 'minor-stops', 'material-shortage'],
      cnc: ['tool-change', 'changeover', 'minor-stops'],
      assembly: ['weld-fault', 'changeover', 'material-shortage', 'minor-stops'],
    };
    for (const line of d.lines) {
      for (const row of d[section].filter((r) => r.lineId === line.id)) {
        for (const x of row.downtime) expect(allowed[line.type]).toContain(x.reason);
      }
    }
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
  it('covers all 90 days in hour then Line order', () => {
    expect(d.hourlyOutput).toHaveLength(90 * 24 * 7);
    expect(new Set(d.hourlyOutput.map((h) => `${h.hourStart}|${h.lineId}`)).size).toBe(15120);
    for (const [i, h] of d.hourlyOutput.entries()) {
      expect(h.hourStart).toBe(NOW - 90 * DAY + Math.floor(i / d.lines.length) * HOUR);
      expect(h.lineId).toBe(d.lines[i % d.lines.length]?.id);
      expect(h.hourStart % HOUR).toBe(0);
      expect(h.hourStart).toBeGreaterThanOrEqual(NOW - 90 * DAY);
      expect(h.hourStart).toBeLessThan(NOW);
      expect(h.runMin).toBeLessThanOrEqual(60);
    }
  });

  it('adds up to the same units as the Shift history over the same 7 days', () => {
    for (const line of lineIds) {
      const hourly = sum(d.hourlyOutput.filter((h) => h.lineId === line && h.hourStart >= NOW - 7 * DAY).map((h) => h.goodUnits + h.scrapUnits));
      const lastShifts = d.shiftHistory.filter((r) => r.lineId === line).slice(-21);
      const shifts = sum(lastShifts.map((r) => r.goodUnits + r.scrapUnits));
      expect(near(hourly, shifts, 0.01)).toBe(true);
    }
  });
});

const downtimeTotals = (rows: { downtime: { reason: DowntimeReason; minutes: number }[] }[]) => {
  const totals: Partial<Record<DowntimeReason, number>> = {};
  for (const row of rows) for (const x of row.downtime) totals[x.reason] = (totals[x.reason] ?? 0) + x.minutes;
  return totals;
};

const expectShiftSum = (hours: HourlyRecord[], shifts = d.shiftHistory) => {
  for (const shift of shifts) {
    const start = Date.parse(`${shift.date}T${shift.shift === 'S1' ? '06' : shift.shift === 'S2' ? '14' : '22'}:00:00-03:00`);
    const rows = hours.filter((h) => h.lineId === shift.lineId && h.hourStart >= start && h.hourStart < start + 8 * HOUR);
    expect(rows).toHaveLength(8);
    for (const field of ['plannedMin', 'runMin', 'targetUnits', 'goodUnits', 'scrapUnits'] as const) {
      expect(shift[field], `${shift.date}/${shift.shift}/${shift.lineId}/${field}`).toBe(sum(rows.map((h) => h[field])));
    }
    expect(downtimeTotals([shift])).toEqual(downtimeTotals(rows));
    expect(new Set(shift.downtime.map((x) => x.reason)).size).toBe(shift.downtime.length);
  }
};

describe('hourly records are the history base', () => {
  it('balances all 60 planned minutes and allocates positive minutes to up to three distinct reasons', () => {
    for (const h of d.hourlyOutput) {
      expect(h.plannedMin).toBe(60);
      expect(h.runMin).toBeGreaterThanOrEqual(0);
      expect(h.runMin + sum(h.downtime.map((x) => x.minutes))).toBe(h.plannedMin);
      expect(h.downtime.length).toBeLessThanOrEqual(3);
      expect(new Set(h.downtime.map((x) => x.reason)).size).toBe(h.downtime.length);
      for (const x of h.downtime) expect(x.minutes).toBeGreaterThan(0);
    }
  });

  it('sums every Shift exactly from its eight hours, including S3 across midnight', () => {
    expectShiftSum(d.hourlyOutput);
  });

  it('sums the last 21 Shifts exactly from the last 168 hours per Line', () => {
    expectShiftSum(d.hourlyOutput.filter((h) => h.hourStart >= NOW - 7 * DAY), d.shiftHistory.slice(-21 * d.lines.length));
  });

  it('derives Shifts purely without sharing downtime objects with hours', () => {
    const hours = structuredClone(d.hourlyOutput);
    expect(shiftsFromHours(hours)).toEqual(d.shiftHistory);
    expect(hours).toEqual(d.hourlyOutput);
    const shift = shiftsFromHours(hours)[0];
    if (shift?.downtime[0]) shift.downtime[0].minutes += 1;
    expect(hours).toEqual(d.hourlyOutput);
  });

  it('adds up to Batch units, scrap, targets and run minutes over all 90 days', () => {
    for (const lineId of lineIds) {
      const hours = d.hourlyOutput.filter((h) => h.lineId === lineId);
      const finished = d.batches.filter((b) => b.lineId === lineId);
      const active = d.activeBatches.filter((b) => b.lineId === lineId);
      const produced = sum(finished.map((b) => b.producedUnits)) + sum(active.map((b) => b.producedUnits));
      const scrap = sum(finished.map((b) => b.scrap)) + sum(active.map((b) => b.scrapUnits));
      const target = sum(finished.map((b) => b.targetUnits)) + sum(active.map((b) => b.targetUnits * (NOW - b.start) / (b.plannedEnd - b.start)));
      const run = sum(finished.map((b) => (b.end - b.start) / MINUTE)) + sum(active.map((b) => (NOW - b.start) / MINUTE));
      expect(near(sum(hours.map((h) => h.goodUnits + h.scrapUnits)), produced)).toBe(true);
      expect(near(sum(hours.map((h) => h.scrapUnits)), scrap, 0.02)).toBe(true);
      expect(near(sum(hours.map((h) => h.targetUnits)), target)).toBe(true);
      expect(near(sum(hours.map((h) => h.runMin)), run)).toBe(true);
      expect(sum(hours.map((h) => h.goodUnits))).toBe(produced - scrap);
      expect(sum(hours.map((h) => h.scrapUnits))).toBe(scrap);
      expect(sum(hours.map((h) => h.targetUnits))).toBe(Math.round(target));
    }
  });
});
