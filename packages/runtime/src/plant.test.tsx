// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import * as core from '@swatchbook/core';
import { deckView, generateMockDataset, simulate, type ActionResult, type PlantAction } from '@swatchbook/core';
import { RuntimeProvider, actionErrorLabel, useActions, useSimulation } from './plant';
import { mount } from './testing';

const dataset = generateMockDataset();
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); history.replaceState(null, '', '/'); });

it.each([false, true])('keeps every consumer and Line consistent through clock ticks and actions (frozen=%s)', async frozen => {
  vi.useFakeTimers();
  let now = 0;
  let session!: ReturnType<typeof useSimulation>;
  let other!: ReturnType<typeof useSimulation>;
  let dispatch!: ReturnType<typeof useActions>;
  const seen: ReturnType<typeof useSimulation>[] = [];
  function Probe() {
    session = useSimulation(); dispatch = useActions();
    for (const line of dataset.lines) expect(() => deckView(session.state, session.snapshot, line.id, session.tick)).not.toThrow();
    seen.push(session);
    return null;
  }
  function Other() { other = useSimulation(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity dataset={dataset} search={frozen ? '?tick=12' : ''} now={() => now}><Probe /><Other /></RuntimeProvider>, true);
  try {
    const initial = session.snapshot;
    expect(session).toBe(other);
    expect(session.dataset).toBe(dataset);
    const tag = dataset.tags.find(t => t.lineId === 'E2' && t.writable)!;
    const actions: PlantAction[] = [
      { type: 'pause', lineId: 'E2' },
      { type: 'emergency-stop', lineId: 'E2', confirmed: true },
      { type: 'reset', lineId: 'E2' },
      { type: 'resume', lineId: 'E2' },
      { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'Runtime test' },
    ];
    for (const action of actions) {
      now += 2000;
      let result!: ActionResult;
      await act(() => { result = dispatch(action); });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.state).toBe(session.state);
      expect(session.tick).toBe(frozen ? 12 : now / 1000);
      expect(session).toBe(other);
      await act(() => vi.advanceTimersByTime(1000));
    }
    expect(seen.length).toBeGreaterThan(5);
    expect(session.snapshot).not.toBe(initial);
    expect(session.snapshot).toEqual(simulate(dataset, session.tick, session.state.overlay));
    expect(session.state.controls.E2).toEqual({ paused: false, latched: false });
  } finally { await view.unmount(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('uses a fresh tick between renders and keeps a high water mark when the source moves back', async () => {
  vi.useFakeTimers();
  let now = 100;
  let session!: ReturnType<typeof useSimulation>, dispatch!: ReturnType<typeof useActions>;
  function Probe() { session = useSimulation(); dispatch = useActions(); return null; }
  const view = await mount(<RuntimeProvider libraryId="ant-design" supportsDensity dataset={dataset} search="" now={() => now}><Probe /></RuntimeProvider>);
  try {
    expect(session.tick).toBe(0);
    now = 7100;
    await act(() => { dispatch({ type: 'pause', lineId: 'E2' }); });
    expect(session.tick).toBe(7);
    expect(session.state.lastTick).toBe(7);
    expect(session.snapshot.tick).toBe(7);
    now = 1100;
    await act(() => vi.advanceTimersByTime(1000));
    expect(session.tick).toBe(7);
    const before = session.state;
    let result!: ActionResult;
    await act(() => { result = dispatch({ type: 'emergency-stop', lineId: 'E2', confirmed: false }); });
    expect(result).toEqual({ ok: false, error: { code: 'confirmation-required' } });
    expect(actionErrorLabel(result)).toBe('plant-error.confirmation-required');
    expect(session.state).toBe(before);
    expect(actionErrorLabel({ ok: true, state: before, events: [] })).toBeNull();
  } finally { await view.unmount(); }
});

it('shares one snapshot on unrelated re-renders and resets Plant State on each mount', async () => {
  let session!: ReturnType<typeof useSimulation>, dispatch!: ReturnType<typeof useActions>;
  function Probe() { session = useSimulation(); dispatch = useActions(); return null; }
  const tree = <RuntimeProvider libraryId="ant-design" supportsDensity dataset={dataset} search="?tick=0"><Probe /></RuntimeProvider>;
  const first = await mount(tree, true);
  const snapshot = session.snapshot;
  await first.render(<RuntimeProvider libraryId="ant-design" supportsDensity dataset={dataset} search="?tick=0"><Probe /></RuntimeProvider>);
  expect(session.snapshot).toBe(snapshot);
  await act(() => { dispatch({ type: 'pause', lineId: 'E2' }); });
  const old = session.state;
  expect(old.controls.E2.paused).toBe(true);
  await first.unmount();
  const second = await mount(tree, true);
  expect(session.state).not.toBe(old);
  expect(session.state.controls.E2.paused).toBe(false);
  expect(session.state.events).toHaveLength(dataset.events.length);
  await second.unmount();
});

it('constructs once per mount and computes a snapshot once per tick and Overlay in StrictMode', async () => {
  vi.useFakeTimers();
  const generate = vi.spyOn(core, 'generateMockDataset');
  const create = vi.spyOn(core, 'createPlantStore');
  const simulate = vi.spyOn(core, 'simulate');
  let now = 0, dispatch!: ReturnType<typeof useActions>;
  function Probe() { useSimulation(); dispatch = useActions(); return null; }
  const tree = <RuntimeProvider libraryId="ant-design" supportsDensity search="" now={() => now}><Probe /></RuntimeProvider>;
  const view = await mount(tree, true);
  try {
    expect(generate).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(simulate).toHaveBeenCalledTimes(1);
    now = 1000;
    await act(() => vi.advanceTimersByTime(1000));
    expect(simulate).toHaveBeenCalledTimes(2);
    await act(() => { dispatch({ type: 'pause', lineId: 'E2' }); });
    expect(simulate).toHaveBeenCalledTimes(3);
    await view.render(<RuntimeProvider libraryId="ant-design" supportsDensity search="" now={() => now}><Probe /></RuntimeProvider>);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(simulate).toHaveBeenCalledTimes(3);
  } finally { await view.unmount(); }
});
