import { describe, expect, it } from 'vitest';
import { NOW } from '../mock/time';
import { shiftInfo, simulatedTime, tickAt } from './clock';

describe('clock', () => {
  it('moves one tick per real second, rounding down', () => {
    expect(tickAt(0)).toBe(0);
    expect(tickAt(999)).toBe(0);
    expect(tickAt(1000)).toBe(1);
    expect(tickAt(2500)).toBe(2);
  });

  it('starts at the fixed instant, 2026-01-01 06:00 in Sao Paulo, and adds one second per tick', () => {
    expect(simulatedTime(0)).toBe(Date.UTC(2026, 0, 1, 9, 0, 0));
    expect(simulatedTime(0)).toBe(NOW);
    expect(simulatedTime(90)).toBe(NOW + 90_000);
  });

  it('starts in Shift S1 with 8 hours left, and hands over to S2 after 8 hours', () => {
    expect(shiftInfo(0)).toMatchObject({ shift: 'S1', remainingMs: 8 * 3_600_000 });
    expect(shiftInfo(3600).remainingMs).toBe(7 * 3_600_000);
    expect(shiftInfo(8 * 3600).shift).toBe('S2');
    expect(shiftInfo(8 * 3600).remainingMs).toBe(8 * 3_600_000);
    expect(shiftInfo(16 * 3600).shift).toBe('S3');
  });
});
