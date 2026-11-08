// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it } from 'vitest';
import { TOUR_STEPS } from '@swatchbook/core';
import { RuntimeProvider } from './plant';
import { tourTransition, useTour } from './tour';
import { useRoute } from './route';
import { mount } from './testing';

afterEach(() => history.replaceState(null, '', '/'));
it('keeps Tour transitions in bounds and ignores movement while inactive', () => {
  const inactive = { active: false, index: 0 };
  expect(tourTransition(inactive, 'next')).toBe(inactive);
  expect(tourTransition(inactive, 'previous')).toBe(inactive);
  const first = tourTransition(inactive, 'start');
  expect(first).toEqual({ active: true, index: 0 });
  expect(tourTransition(first, 'previous')).toBe(first);
  const last = { active: true, index: TOUR_STEPS.length - 1 };
  expect(tourTransition(last, 'next')).toBe(last);
  expect(tourTransition(last, 'previous').index).toBe(TOUR_STEPS.length - 2);
  expect(tourTransition(last, 'finish')).toEqual(inactive);
});

it('shares Tour state, navigates every step, restarts at zero and resets on mount', async () => {
  let tour!: ReturnType<typeof useTour>, other!: ReturnType<typeof useTour>, route!: ReturnType<typeof useRoute>;
  function Probe() { tour = useTour(); route = useRoute(); return null; }
  function Other() { other = useTour(); return null; }
  const tree = <RuntimeProvider libraryId="ant-design" supportsDensity search="?tick=0"><Probe /><Other /></RuntimeProvider>;
  const view = await mount(tree, true);
  try {
    expect(tour).toMatchObject({ active: false, index: 0, step: undefined, total: TOUR_STEPS.length, isFirst: false, isLast: false });
    await act(() => route.go('control'));
    await act(() => tour.start());
    expect(tour).toBe(other);
    expect(tour.isFirst).toBe(true);
    for (const [index, step] of TOUR_STEPS.entries()) {
      expect(tour.index).toBe(index);
      expect(tour.step).toBe(step);
      expect(route.screen).toBe(step.screen);
      if (index < TOUR_STEPS.length - 1) await act(() => tour.next());
    }
    expect(tour.isLast).toBe(true);
    await act(() => tour.next());
    expect(tour.index).toBe(TOUR_STEPS.length - 1);
    await act(() => tour.previous());
    expect(route.screen).toBe(TOUR_STEPS.at(-2)!.screen);
    await act(() => tour.finish());
    expect(tour.active).toBe(false);
    expect(tour.step).toBeUndefined();
    expect(route.screen).toBe(TOUR_STEPS.at(-2)!.screen);
    await act(() => tour.start());
    expect(tour.index).toBe(0);
    expect(route.screen).toBe('deck');
    await act(() => route.go('control'));
    await act(() => tour.start());
    expect(route.screen).toBe('deck');
  } finally { await view.unmount(); }
  const fresh = await mount(tree, true);
  expect(tour.active).toBe(false);
  expect(tour.index).toBe(0);
  await fresh.unmount();
});
