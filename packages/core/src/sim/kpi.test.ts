import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import type { Overlay } from './overlay';
import { simulate } from './simulate';

const d = generateMockDataset();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const line = (tick: number, id: string, overlay?: Overlay) => simulate(d, tick, overlay).lines.find((l) => l.lineId === id);
const pausedBetween = (from: number, to: number, who = 'E1'): Overlay => ({
  runTicks: (l, a, b) => (l === who ? Math.max(0, b - a - Math.max(0, Math.min(b, to) - Math.max(a, from))) : b - a),
});

describe('a Line that is not making product', () => {
  it('reads zero line speed while paused, and normal speed before and after', () => {
    const o = pausedBetween(300, 500);
    expect(line(200, 'E1', o)?.lineSpeed?.value).toBeGreaterThan(0);
    expect(line(400, 'E1', o)?.lineSpeed?.value).toBe(0);
    expect(line(600, 'E1', o)?.lineSpeed?.value).toBeGreaterThan(0);
  });

  it('has no cycle time, no output and zero OEE once its Batch is finished', () => {
    const l = line(30_000, 'A1');
    expect(l?.cycle).toBeNull();
    expect(l?.outputThisShift).toBe(0);
    expect([l?.availability, l?.performance, l?.oee]).toEqual([0, 0, 0]);
    expect(l?.batch?.complete).toBe(true);
  });

  it('marks a Batch complete only when it reaches target', () => {
    expect(line(0, 'E1')?.batch?.complete).toBe(false);
    expect(line(20 * 3600, 'E1')?.batch?.complete).toBe(true);
  });
});

describe('a Pause early in a Shift', () => {
  it('does not lift OEE, and brings it down while the Line is paused', () => {
    const o = pausedBetween(600, 660);
    const oee = (tick: number) => line(tick, 'E1', o)?.oee ?? 0;
    expect(oee(600)).toBeLessThanOrEqual(oee(599) + 0.02);
    expect(oee(659)).toBeLessThan(oee(599));
  });

  it('shows zero quality once a Line has made nothing this Shift, not the history baseline', () => {
    const l = line(31_000, 'E1');
    expect(l?.outputThisShift).toBe(0);
    expect(l?.quality).toBe(0);
  });
});

describe('OEE while a Line waits for its first unit', () => {
  const jumps = (id: string, from: number, to: number, o?: Overlay) => {
    let worst = 0;
    let prev = line(from, id, o)?.oee ?? 0;
    for (let tick = from + 1; tick <= to; tick++) {
      const cur = line(tick, id, o)?.oee ?? 0;
      worst = Math.max(worst, cur - prev);
      prev = cur;
    }
    return worst;
  };

  it.each(['A1', 'A2', 'P1', 'E1'])('does not jump up on %s when the first unit lands', (id) => {
    expect(jumps(id, 0, 400)).toBeLessThanOrEqual(0.03);
  });

  it.each(['A1', 'P1'])('does not jump up on %s when output restarts after an early Pause', (id) => {
    expect(jumps(id, 500, 1500, pausedBetween(600, 1200, id))).toBeLessThanOrEqual(0.03);
  });
});

describe('a Line that stays stopped across the Shift change', () => {
  it.each(['P1', 'A1', 'E1'])('does not jump from zero to the baseline on %s', (id) => {
    const o = pausedBetween(100, 1e9, id);
    let worst = 0;
    let prev = line(28_700, id, o)?.oee ?? 0;
    for (let tick = 28_701; tick <= 28_900; tick++) {
      const cur = line(tick, id, o)?.oee ?? 0;
      worst = Math.max(worst, cur - prev);
      prev = cur;
    }
    expect(worst).toBeLessThanOrEqual(0.05);
  });
});

describe('live KPIs agree with the hourly records', () => {
  it.each(['E1', 'RF1', 'A1', 'P1'])('on %s, once there is half an hour of data', (id) => {
    const tick = 5000;
    const s = simulate(d, tick);
    const l = s.lines.find((x) => x.lineId === id);
    const hours = s.hours.filter((h) => h.lineId === id);
    const hourlyAvailability = sum(hours.map((h) => h.runMin)) / (tick / 60);
    expect(Math.abs((l?.availability ?? 0) - hourlyAvailability)).toBeLessThanOrEqual(0.03);
    const made = sum(hours.map((h) => h.goodUnits + h.scrapUnits));
    const target = sum(hours.map((h) => h.targetUnits));
    if (made > 0) {
      expect(Math.abs((l?.performance ?? 0) - made / target)).toBeLessThanOrEqual(0.02);
      expect(Math.abs((l?.quality ?? 0) - sum(hours.map((h) => h.goodUnits)) / made)).toBeLessThanOrEqual(0.02);
    }
  });

  it('starts from the history baseline and moves to the live numbers over the first half hour', () => {
    const base = line(0, 'E1');
    expect(base?.availability).toBeGreaterThan(0.5);
    expect(Math.abs((line(1, 'E1')?.availability ?? 0) - (base?.availability ?? 0))).toBeLessThan(0.05);
  });
});

describe('time lost this Shift', () => {
  const lost = (tick: number, id: string, o?: Overlay) => line(tick, id, o)?.shiftDowntime ?? [];
  const minutes = (xs: { minutes: number }[]) => sum(xs.map((x) => x.minutes));

  it('adds up with run time to the minutes of the Shift so far', () => {
    for (const id of ['E1', 'A1', 'C1']) {
      for (const tick of [600, 5000, 20_000]) {
        const l = line(tick, id);
        expect(Math.abs((l?.shiftRunMin ?? 0) + minutes(lost(tick, id)) - Math.round(tick / 60))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('counts a Pause as minor stops, and time after the Batch finished as changeover', () => {
    const paused = lost(1200, 'E1', pausedBetween(300, 900));
    expect(paused.find((x) => x.reason === 'minor-stops')?.minutes).toBe(10);
    expect(lost(20_000, 'A1').find((x) => x.reason === 'changeover')?.minutes).toBeGreaterThan(200);
  });

  it('shows an idle Line as changeover only, and nothing at the start of a Shift', () => {
    expect(lost(3600, 'C1')).toEqual([{ reason: 'changeover', minutes: 60 }]);
    expect(lost(0, 'E1')).toEqual([]);
  });
});
