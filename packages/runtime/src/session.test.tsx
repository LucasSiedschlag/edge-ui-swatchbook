// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { alarmList, generateMockDataset, PREFERENCES_KEY, TOUR_STEPS } from '@swatchbook/core';
import { RuntimeProvider, useActions, useI18n, usePreferences, useRoute, useShortcut, useSimulation, useTour } from './index';
import { mount } from './testing';

const dataset = generateMockDataset();
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); history.replaceState(null, '', '/'); });

function trackListeners(target: Window | Document) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
  function bucket(type: string, options?: boolean | EventListenerOptions) {
    const key = `${type}/${typeof options === 'boolean' ? options : options?.capture ?? false}`;
    let set = listeners.get(key);
    if (!set) { set = new Set(); listeners.set(key, set); }
    return set;
  }
  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener) bucket(type, options).add(listener);
    add(type, listener, options);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (listener) bucket(type, options).delete(listener);
    remove(type, listener, options);
  });
  return { count: () => [...listeners.values()].reduce((count, set) => count + set.size, 0), countType: (type: string) => bucket(type).size };
}

it.each([false, true])('runs a full session with no timers or listeners left after unmount (StrictMode=%s)', async strict => {
  // React installs one shared document listener once, outside the runtime lifecycle.
  const warmup = await mount(<div />);
  await warmup.unmount();
  vi.useFakeTimers();
  let now = 0;
  const windowListeners = trackListeners(window), documentListeners = trackListeners(document);
  const before = { timers: vi.getTimerCount(), window: windowListeners.count(), document: documentListeners.count() };
  let session!: ReturnType<typeof useSimulation>, prefs!: ReturnType<typeof usePreferences>, tour!: ReturnType<typeof useTour>;
  let dispatch!: ReturnType<typeof useActions>, route!: ReturnType<typeof useRoute>, i18n!: ReturnType<typeof useI18n>;
  function Probe() {
    session = useSimulation(); prefs = usePreferences(); tour = useTour(); dispatch = useActions(); route = useRoute(); i18n = useI18n();
    useShortcut('acknowledge', () => {
      const alarm = alarmList(session.state, session.tick).find(a => a.state === 'active-unacknowledged' || a.state === 'returned-unacknowledged')!;
      expect(dispatch({ type: 'acknowledge', alarmIds: [alarm.id] }).ok).toBe(true);
    });
    return null;
  }
  const view = await mount(<RuntimeProvider libraryId="ant-design" dataset={dataset} languages={['en']} search="" now={() => now}><Probe /></RuntimeProvider>, strict);
  try {
    expect(documentListeners.countType('keydown')).toBe(1);
    expect(windowListeners.countType('storage')).toBe(1);
    expect(vi.getTimerCount()).toBe(before.timers + 1);
    await act(() => prefs.setLanguage('pt-BR'));
    expect(i18n.locale).toBe('pt-BR');
    now = 2300;
    await act(() => { expect(dispatch({ type: 'pause', lineId: 'E2' }).ok).toBe(true); });
    expect(session.tick).toBe(2);
    await act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })); });
    expect(session.state.acks.size).toBe(1);
    expect(session.state.events.at(-1)?.action).toBe('alarm-acknowledge');
    await act(() => tour.start());
    for (const [index, step] of TOUR_STEPS.entries()) {
      expect(route.screen).toBe(step.screen);
      if (index < TOUR_STEPS.length - 1) await act(() => tour.next());
    }
    await act(() => tour.finish());
    expect(tour.active).toBe(false);
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY)!);
    expect(stored).toEqual({ language: 'pt-BR', theme: 'light', density: 'comfortable' });
    expect(session.state.controls.E2.paused).toBe(true);
  } finally { await view.unmount(); }
  expect({ timers: vi.getTimerCount(), window: windowListeners.count(), document: documentListeners.count() }).toEqual(before);
});

it('has Parity across Library providers at the same tick and after the same action', async () => {
  const sessions: ReturnType<typeof useSimulation>[] = [], actions: ReturnType<typeof useActions>[] = [];
  function Probe({ index }: { index: number }) { sessions[index] = useSimulation(); actions[index] = useActions(); return null; }
  const view = await mount(<>{(['ant-design', 'ui5', 'ix'] as const).map((libraryId, index) => <RuntimeProvider key={libraryId} libraryId={libraryId} dataset={dataset} search="?tick=7"><Probe index={index} /></RuntimeProvider>)}</>);
  try {
    for (const session of sessions.slice(1)) {
      expect(session.snapshot.tags).toEqual(sessions[0]!.snapshot.tags);
      expect(session.snapshot.lines).toEqual(sessions[0]!.snapshot.lines);
      expect(session.snapshot.hours).toEqual(sessions[0]!.snapshot.hours);
    }
    await act(() => { for (const dispatch of actions) expect(dispatch({ type: 'pause', lineId: 'E2' }).ok).toBe(true); });
    for (const session of sessions.slice(1)) {
      expect(session.snapshot.tags).toEqual(sessions[0]!.snapshot.tags);
      expect(session.snapshot.lines).toEqual(sessions[0]!.snapshot.lines);
      expect(session.snapshot.hours).toEqual(sessions[0]!.snapshot.hours);
    }
    expect(sessions.every(s => s.tick === 7 && s.state.lastTick === 7)).toBe(true);
  } finally { await view.unmount(); }
});

it('uses browser defaults for live time, frozen ticks, languages and preference persistence across mounts', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr', 'pt-PT']);
  history.replaceState(null, '', '/ant-design/#/deck');
  let simulation!: ReturnType<typeof useSimulation>, prefs!: ReturnType<typeof usePreferences>;
  function Probe() { simulation = useSimulation(); prefs = usePreferences(); return null; }
  // No search, now, storage or languages props: exercise the production entry path.
  const tree = <RuntimeProvider libraryId="ant-design" dataset={dataset}><Probe /></RuntimeProvider>;
  const first = await mount(tree, true);
  try {
    expect(prefs.language).toBe('pt-BR');
    expect(simulation.tick).toBe(0);
    await act(() => vi.advanceTimersByTime(2500));
    expect(simulation.tick).toBe(2);
    vi.setSystemTime(new Date('1990-01-01'));
    await act(() => vi.advanceTimersByTime(1000));
    expect(simulation.tick).toBe(3);
    await act(() => { prefs.setLanguage('en'); prefs.applyPreset('control-room'); });
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toEqual({ language: 'en', theme: 'dark', density: 'compact' });
  } finally { await first.unmount(); }
  expect(vi.getTimerCount()).toBe(0);
  history.replaceState(null, '', '/ant-design/?tick=7#/deck?tick=4');
  const second = await mount(tree, true);
  try {
    expect(prefs).toMatchObject({ language: 'en', theme: 'dark', density: 'compact', preset: 'control-room' });
    expect(simulation.tick).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTime(5000));
    expect(simulation.tick).toBe(7);
  } finally { await second.unmount(); }
});
