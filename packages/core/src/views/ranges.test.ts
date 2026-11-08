import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { HOUR, NOW } from '../mock/time';
import { readHours } from '../sim/kpis';
import { simulatedTime } from '../sim/clock';
import { alarmList, createPlantState, reduce } from '../plant';
import { eventLogView } from './events';
import { performanceView } from './performance';
import { performanceWindow, rangeWindow, type RangeId } from './ranges';

const d = generateMockDataset();
const RANGES: RangeId[] = ['last-shift', 'last-24h', 'last-7d', 'last-30d'];

describe('rangeWindow', () => {
  it('pins the windows at the start of the session', () => {
    // Tick 0 is 2026-01-01 06:00, the start of a Shift and of an hour.
    expect(rangeWindow('last-shift', 0)).toEqual({ start: NOW - 8 * HOUR, end: NOW, hours: 8 });
    expect(rangeWindow('last-24h', 0)).toEqual({ start: NOW - 23 * HOUR, end: NOW + HOUR, hours: 24 });
    expect(rangeWindow('last-7d', 0)).toEqual({ start: NOW - 167 * HOUR, end: NOW + HOUR, hours: 168 });
    expect(rangeWindow('last-30d', 0)).toEqual({ start: NOW - 719 * HOUR, end: NOW + HOUR, hours: 720 });
  });

  it('moves the rolling windows by whole hours and the Shift window by whole Shifts', () => {
    expect(rangeWindow('last-24h', 3599).start).toBe(NOW - 23 * HOUR);
    expect(rangeWindow('last-24h', 3600).start).toBe(NOW - 22 * HOUR);
    expect(rangeWindow('last-shift', 28799)).toEqual(rangeWindow('last-shift', 0));
    expect(rangeWindow('last-shift', 28800)).toEqual({ start: NOW, end: NOW + 8 * HOUR, hours: 8 });
  });
});

describe('short ranges share hours across Screens', () => {
  // One event per hour edge around the window, written by real actions so the Event Log is the real one.
  const ticks = [0, 100, 3599, 3600, 28799, 28800, 40000];

  it.each(['last-shift', 'last-24h'] as const)('the Event Log and Screen 4 agree on %s', (range) => {
    for (const tick of ticks) {
      const w = rangeWindow(range, tick);
      const now = simulatedTime(tick);
      const state = createPlantState(d);
      const shown = eventLogView(state, tick, { range }).rows;
      // Every dataset event inside [start, end) and not after now is shown, and nothing else.
      const expected = state.events.filter((e) => e.at >= w.start && e.at < w.end && e.at <= now);
      expect(shown.map((r) => r.id).sort()).toEqual(expected.map((e) => e.id).sort());
      // Screen 4 starts its first output slot on the same instant.
      const view = performanceView(d, readHours(d, tick), tick, { kind: 'site' }, range);
      expect(view.output[0]?.start).toBe(performanceWindow(range, tick).start);
    }
  });

  it('includes an action made at the first instant of the window and excludes the instant before', () => {
    const tick = 3600;
    const w = rangeWindow('last-24h', tick);
    let s = createPlantState(d);
    const r = reduce(s, { type: 'pause', lineId: 'E2' }, { tick });
    if (!r.ok) throw new Error(r.error.code);
    s = r.state;
    expect(alarmList(s, tick).length).toBeGreaterThan(0);
    const last = eventLogView(s, tick, { range: 'last-24h' }).rows[0];
    expect(last?.action).toBe('pause');
    expect(w.start).toBeLessThan(simulatedTime(tick));
  });
});

describe('Screen 4 fixed history windows', () => {
  it.each([['last-7d', 168], ['last-30d', 720]] as const)('%s ends at load at every tick', (range, hours) => {
    for (const tick of [0, 100, 3600, 30000]) {
      expect(performanceWindow(range, tick)).toEqual({ start: NOW - hours * HOUR, end: NOW, hours });
    }
  });

  it.each(RANGES)('keeps the Event Log rolling for %s', (range) => {
    const result = reduce(createPlantState(d), { type: 'shift-handover', note: 'New action' }, { tick: 30000 });
    if (!result.ok) throw new Error(result.error.code);
    if (range !== 'last-shift') expect(eventLogView(result.state, 30000, { range }).rows[0]?.note).toBe('New action');
    if (range === 'last-shift') expect(performanceWindow(range, 30000)).toEqual(rangeWindow(range, 0));
    if (range === 'last-24h') {
      expect(performanceWindow(range, 30000)).toEqual(rangeWindow(range, 30000));
    }
  });
});
