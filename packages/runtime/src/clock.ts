import { MAX_TICK, TICK_MS, tickAt } from '@swatchbook/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SimClockOptions { now?: () => number; fixedTick?: number | null }
const defaultNow = () => Date.now();

export function readTestTick(search: string): number | null {
  const values = new URLSearchParams(search).getAll('tick');
  const value = values[0];
  if (values.length !== 1 || value === undefined || !/^\d+$/.test(value)) return null;
  const tick = Number(value);
  return Number.isSafeInteger(tick) && tick <= MAX_TICK ? tick : null;
}

export function clockTick(elapsedMs: number): number {
  return Math.min(MAX_TICK, Math.max(0, tickAt(elapsedMs)));
}

/** The provider and action dispatcher share the same origin and source. */
export function useSessionClock({ now = defaultNow, fixedTick = null }: SimClockOptions = {}) {
  if (fixedTick !== null && (!Number.isSafeInteger(fixedTick) || fixedTick < 0 || fixedTick > MAX_TICK)) {
    throw new RangeError(`fixedTick must be an integer from 0 to ${MAX_TICK}`);
  }
  const source = useRef<{ now: () => number; origin: number } | null>(null);
  if (!source.current) source.current = { now, origin: now() };
  const clock = source.current;
  const readTick = useCallback(() => fixedTick ?? clockTick(clock.now() - clock.origin), [clock, fixedTick]);
  const [liveTick, setTick] = useState(readTick);
  useEffect(() => {
    if (fixedTick !== null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      const tick = readTick();
      setTick(tick);
      if (tick === MAX_TICK) return;
      const elapsed = Math.max(0, clock.now() - clock.origin);
      timer = setTimeout(update, TICK_MS - elapsed % TICK_MS);
    }
    update();
    return () => clearTimeout(timer);
  }, [clock, fixedTick, readTick]);
  return { tick: fixedTick ?? liveTick, readTick };
}

export function useSimClock(options: SimClockOptions = {}): number {
  return useSessionClock(options).tick;
}
