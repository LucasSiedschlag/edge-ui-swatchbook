import { HOUR, NOW, shiftAt } from '../mock/time';
import type { ShiftId, Timestamp } from '../mock/types';

export const TICK_MS = 1000;

/** The tick for a real elapsed time since page load. Every load starts again at tick 0. */
export function tickAt(realElapsedMs: number): number {
  return Math.floor(realElapsedMs / TICK_MS);
}

/** Simulated time of a tick: a fixed start (2026-01-01 06:00 Sao Paulo) plus one second per tick. */
export function simulatedTime(tick: number): Timestamp {
  return NOW + tick * TICK_MS;
}

export interface ShiftInfo {
  shift: ShiftId;
  startsAt: Timestamp;
  endsAt: Timestamp;
  remainingMs: number;
}

/** The Shift running at a tick. Shifts start at 06:00, 14:00 and 22:00, and NOW is a Shift start. */
export function shiftInfo(tick: number): ShiftInfo {
  const t = simulatedTime(tick);
  const startsAt = NOW + Math.floor((t - NOW) / (8 * HOUR)) * 8 * HOUR;
  return { shift: shiftAt(t), startsAt, endsAt: startsAt + 8 * HOUR, remainingMs: startsAt + 8 * HOUR - t };
}
