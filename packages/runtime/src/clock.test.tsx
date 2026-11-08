// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_TICK } from '@swatchbook/core';
import { clockTick, readTestTick, useSimClock } from './clock';
import { mount } from './testing';

afterEach(() => vi.useRealTimers());
it.each([['?tick=0', 0], ['?tick=42&x=y', 42], [`?tick=${MAX_TICK}`, MAX_TICK], ['?tick=004', 4]])('reads %s', (search, tick) => {
  expect(readTestTick(search)).toBe(tick);
});
it.each(['', '?tick=', '?tick=-1', '?tick=1.0', '?tick=1e2', '?tick=NaN', '?tick=Infinity', '?tick=+2', '?tick=%202', '?tick=1&tick=2', `?tick=${MAX_TICK + 1}`, '?ticks=2'])('ignores %s', search => {
  expect(readTestTick(search)).toBeNull();
});
it('clamps elapsed time to the supported session range', () => {
  expect(clockTick(-50)).toBe(0);
  expect(clockTick(1999)).toBe(1);
  expect(clockTick((MAX_TICK + 100) * 1000)).toBe(MAX_TICK);
});
it('advances only at tick boundaries, catches up after a delayed callback, and cleans up', async () => {
  vi.useFakeTimers();
  let now = 500, tick = -1, renders = 0;
  function Probe() { tick = useSimClock({ now: () => now }); renders++; return null; }
  const view = await mount(<Probe />, true);
  const initialRenders = renders;
  expect(tick).toBe(0);
  now = 1499;
  await act(() => vi.advanceTimersByTime(999));
  expect(renders).toBe(initialRenders);
  now = 1500;
  await act(() => vi.advanceTimersByTime(1));
  expect(tick).toBe(1);
  now = 3750;
  await act(() => vi.advanceTimersByTime(1000));
  expect(tick).toBe(3);
  now = 4499;
  await act(() => vi.advanceTimersByTime(749));
  expect(tick).toBe(3);
  now = 4500;
  await act(() => vi.advanceTimersByTime(1));
  expect(tick).toBe(4);
  await view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('uses no timers when frozen, including tick zero', async () => {
  vi.useFakeTimers();
  for (const fixedTick of [0, 37, MAX_TICK]) {
    let tick = -1;
    function Probe() { tick = useSimClock({ fixedTick }); return null; }
    const view = await mount(<Probe />, true);
    expect(tick).toBe(fixedTick);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTime(5000));
    expect(tick).toBe(fixedTick);
    await view.unmount();
  }
});
