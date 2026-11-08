// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_TICK } from '@swatchbook/core';
import { clockTick, readTestTick, useSimClock } from './clock';
import { mount } from './testing';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it.each([['?tick=0', 0], ['?tick=42&x=y', 42], [`?tick=${MAX_TICK}`, MAX_TICK], ['?tick=004', 4]])('reads %s', (search, tick) => {
  expect(readTestTick(search)).toBe(tick);
});
it.each(['', '?tick=', '?tick=-1', '?tick=1.0', '?tick=1e2', '?tick=NaN', '?tick=Infinity', '?tick=+2', '?tick=%202', '?tick=1&tick=2', `?tick=${MAX_TICK + 1}`, '?ticks=2'])('ignores %s', search => {
  expect(readTestTick(search)).toBeNull();
});
it.each([
  ['', '#/deck?tick=4', 4], ['?x=y', '#/deck?tick=0', 0],
  ['?tick=8', '#/deck?tick=4', 8], ['?tick=bad', '#/deck?tick=4', null],
  ['?tick=1&tick=2', '#/deck?tick=4', null], ['', '#/deck?tick=1&tick=2', null],
  ['', '#/deck?tick=-1', null], ['', '#/deck?tick=1.5', null], ['', '#/deck', null],
])('reads search %s before hash %s', (search, hash, tick) => {
  expect(readTestTick(search, hash)).toBe(tick);
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

it('never lowers the tick when the injected source moves backwards, without any Plant action', async () => {
  vi.useFakeTimers();
  let now = 100, tick = -1;
  function Probe() { tick = useSimClock({ now: () => now }); return null; }
  const view = await mount(<Probe />, true);
  try {
    now = 5100;
    await act(() => vi.advanceTimersByTime(1000));
    expect(tick).toBe(5);
    now = 1100;
    await act(() => vi.advanceTimersByTime(1000));
    expect(tick).toBe(5);
    now = -100;
    await act(() => vi.advanceTimersByTime(1000));
    expect(tick).toBe(5);
    now = 6100;
    await act(() => vi.advanceTimersByTime(1000));
    expect(tick).toBe(6);
  } finally { await view.unmount(); }
});

it('uses performance time rather than the system wall clock by default', async () => {
  vi.useFakeTimers();
  let elapsed = 0, tick = -1;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  function Probe() { tick = useSimClock(); return null; }
  const view = await mount(<Probe />);
  try {
    vi.setSystemTime(new Date('2000-01-01'));
    elapsed = 3000;
    await act(() => vi.advanceTimersByTime(1000));
    expect(tick).toBe(3);
  } finally { await view.unmount(); }
});
