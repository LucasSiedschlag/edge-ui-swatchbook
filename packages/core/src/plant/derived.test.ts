import { expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { MAX_TICK, contextOf } from '../sim/context';
import { alarmedAt } from '../sim/tags';
import { raises } from '../sim/alarms';
import { alarmList, criticalAlarms, createPlantState, createPlantStore, lineStatus, reduce } from './index';
import type { PlantAction, PlantState } from './types';

const active = (a: { state: string }) => a.state.startsWith('active-');
function levelsAgree(state: PlantState, tick: number) {
  const list = alarmList(state, tick), ctx = contextOf(state.dataset);
  expect(new Set(list.map(a => a.id)).size).toBe(list.length);
  const open = new Map<string, typeof list[number][]>();
  for (const a of list) if (a.tagId !== null && active(a)) open.set(a.tagId, [...(open.get(a.tagId) ?? []), a]);
  const wrong = [...ctx.tagById.values()].find(tag => {
    const level = alarmedAt(ctx, tag, tick, state.overlay), alarms = open.get(tag.id) ?? [];
    return alarms.some(a => (a.message.key === 'alarm.low-value' ? 'low' : 'high') !== level) ||
      (state.overlay.runTicks!(tag.lineId, tick, tick + 1) > 0 && level !== null && alarms.length !== 1);
  });
  expect(wrong?.id, `level agreement at ${tick}`).toBeUndefined();
}
function act(s: PlantState, action: PlantAction, tick: number): PlantState {
  const result = reduce(s, action, { tick });
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}

it('seed 436: every query at 27950 through 28200 is independent of single, five, coarse and reverse queries', () => {
  const d = generateMockDataset(436), baseline = createPlantState(d);
  const ticks = Array.from({ length: 251 }, (_, i) => 27950 + i);
  const expected = ticks.map(t => { levelsAgree(baseline, t); return JSON.stringify(alarmList(baseline, t)); });
  for (const order of [ticks, ticks.filter(t => t % 5 === 0), [28200], [...ticks].reverse()]) {
    const state = createPlantState(d);
    for (const t of order) alarmList(state, t);
    for (let i = 0; i < ticks.length; i++) expect(JSON.stringify(alarmList(state, ticks[i]!))).toBe(expected[i]);
  }
});

for (const seed of [undefined, 436]) it(`seed ${seed ?? 'default'}: Line status and banner use exactly the active Critical Alarm list`, () => {
  const state = createPlantState(generateMockDataset(seed));
  for (const tick of [0, 46, 467, 7009, 7010, 28000, 28200, 28800, 57600, 115200]) {
    const list = alarmList(state, tick);
    levelsAgree(state, tick);
    for (const line of state.dataset.lines) {
      const expected = list.filter(a => a.lineId === line.id && a.priority === 'critical' && active(a));
      expect(lineStatus(state, line.id, tick).criticalAlarms).toBe(expected.length);
      const banner = criticalAlarms(state, line.id, tick);
      expect(banner.map(a => a.id)).toEqual(expected.map(a => a.id));
      for (const row of banner) {
        expect(row.machine.id).toBe(expected.find(a => a.id === row.id)!.machineId);
        expect(row.age).toBe((simulatedTime(tick) - expected.find(a => a.id === row.id)!.raisedAt) / 1000);
        expect(row.message).toEqual(expected.find(a => a.id === row.id)!.message);
      }
    }
  }
});

it('Pause E1 at 46 preserves every Alarm field before 46, even after querying the future', () => {
  const state = createPlantState(generateMockDataset()), paused = act(state, { type: 'pause', lineId: 'E1' }, 46);
  alarmList(paused, 115200);
  for (let tick = 0; tick < 46; tick++) expect(alarmList(paused, tick)).toEqual(alarmList(state, tick));
  expect(alarmList(paused, 46).some(a => a.id === raises(state.dataset, 45, 46)[0]!.id)).toBe(false);
});

it('Resume gates the tentative list at the exact tick, including dataset returns', () => {
  const state = createPlantState(generateMockDataset());
  const a1 = act(state, { type: 'pause', lineId: 'A1' }, 0);
  expect(reduce(a1, { type: 'resume', lineId: 'A1' }, { tick: 7010 })).toMatchObject({ ok: false, error: { code: 'critical-alarm-active' } });
  const e1 = act(state, { type: 'pause', lineId: 'E1' }, 0);
  const resumed = act(e1, { type: 'resume', lineId: 'E1' }, 467);
  expect(lineStatus(resumed, 'E1', 467).criticalAlarms).toBe(0);
  expect(alarmList(resumed, 467).find(a => a.id === 'AL-0160')!.returnedAt).toBe(simulatedTime(467));
});

it('Resume followed immediately by an override derives the current condition without a preview', () => {
  let s = createPlantState(generateMockDataset());
  s = act(s, { type: 'pause', lineId: 'E2' }, 0);
  s = act(s, { type: 'resume', lineId: 'E2' }, 101);
  const ctx = contextOf(s.dataset), tag = ctx.tagById.get('E2-puller.puller-speed')!;
  const before = alarmList(s, 100);
  s = act(s, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 101);
  expect(alarmedAt(ctx, tag, 101, s.overlay)).toBe('high');
  expect(alarmList(s, 101).filter(a => a.tagId === tag.id && active(a))).toMatchObject([{ id: `RZ-101-${tag.id}-high`, raisedAt: simulatedTime(101) }]);
  expect(alarmList(s, 100)).toEqual(before);
});

it('acknowledges an Alarm born at this tick exactly once, without mutating earlier query results', () => {
  const s = createPlantState(generateMockDataset()), raise = raises(s.dataset, 0, 3600).find(r => r.lineId !== 'A2')!;
  const old = alarmList(s, raise.tick);
  const acked = act(s, { type: 'acknowledge', alarmIds: [raise.id, raise.id] }, raise.tick);
  expect(acked.acks.get(raise.id)).toEqual({ tick: raise.tick, userId: s.currentUserId });
  expect(alarmList(acked, raise.tick).find(a => a.id === raise.id)!.state).toBe('active-acknowledged');
  const again = act(acked, { type: 'acknowledge', alarmIds: [raise.id] }, raise.tick);
  expect(again).toBe(acked);
  expect(again.events).toHaveLength(s.events.length + 1);
  expect(old.find(a => a.id === raise.id)!.state).toBe('active-unacknowledged');
  expect(alarmList(acked, raise.tick - 1)).toEqual(alarmList(s, raise.tick - 1));
});

it('uses last accepted action tick for ingress and notifies on every accepted state change', () => {
  const store = createPlantStore(generateMockDataset());
  let calls = 0;
  store.subscribe(() => calls++);
  const userId = store.getState().currentUserId;
  store.dispatch({ type: 'set-user', userId }, 100);
  expect(store.getState().lastTick).toBe(100);
  expect(calls).toBe(1);
  const paused = store.dispatch({ type: 'pause', lineId: 'E2' }, 10);
  expect(paused.ok).toBe(true);
  expect(store.getState().manualStops.E2[0]!.fromTick).toBe(100);
  for (const tick of [MAX_TICK + 1, NaN, Infinity, -1, 0.1]) {
    expect(store.dispatch({ type: 'set-user', userId }, tick)).toMatchObject({ ok: false, error: { code: 'invalid-tick' } });
    expect(() => alarmList(store.getState(), tick)).toThrow();
  }
});

it('same-tick Pause, Emergency stop, Reset, Resume and replacement overrides have one final condition history', () => {
  const d = generateMockDataset(), tag = contextOf(d).tagById.get('E2-puller.puller-speed')!;
  const run = (queries: boolean) => {
    let s = createPlantState(d);
    for (const action of [
      { type: 'pause', lineId: 'E2' },
      { type: 'emergency-stop', lineId: 'E2', confirmed: true },
      { type: 'reset', lineId: 'E2' },
      { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' },
      { type: 'resume', lineId: 'E2' },
      { type: 'setpoint-override', tagId: tag.id, value: tag.min, reason: 'trial' },
      { type: 'reset-to-recipe', tagId: tag.id },
    ] as PlantAction[]) {
      if (queries) for (const tick of [101, 150, 100, 115200]) alarmList(s, tick);
      s = act(s, action, 101);
      levelsAgree(s, 101);
    }
    return s;
  };
  const plain = run(false), queried = run(true);
  for (const tick of [0, 100, 101, 150, 115200]) expect(alarmList(queried, tick)).toEqual(alarmList(plain, tick));
  expect(plain.setpoints.get(tag.id)).toEqual([{ fromTick: 101, value: tag.setpoint }]);
  expect(alarmList(plain, 101).some(a => a.id.startsWith(`RZ-101-${tag.id}`))).toBe(false);
});

it('a direction change returns the acknowledged Alarm and opens exactly one new Alarm at the exact tick', () => {
  let s = createPlantState(generateMockDataset());
  const tag = contextOf(s.dataset).tagById.get('E1-extruder.barrel-zone-1-temp')!;
  s = act(s, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 100);
  const first = alarmList(s, 399).find(a => a.tagId === tag.id && active(a))!;
  s = act(s, { type: 'acknowledge', alarmIds: [first.id] }, 399);
  s = act(s, { type: 'setpoint-override', tagId: tag.id, value: tag.min, reason: 'trial' }, 400);
  const list = alarmList(s, 500), next = list.find(a => a.tagId === tag.id && active(a))!;
  expect(next.message.key).toBe('alarm.low-value');
  expect(list.find(a => a.id === first.id)).toMatchObject({ state: 'cleared', returnedAt: next.raisedAt, clearedAt: next.raisedAt });
  levelsAgree(s, 500);
});

it('acknowledging after a return clears at the acknowledgement tick and preserves the earlier returned state', () => {
  const s = createPlantState(generateMockDataset()), r = raises(s.dataset, 0, 1000).find(r => r.lineId !== 'A2')!;
  const before = alarmList(s, r.tick + 1000).find(a => a.id === r.id)!;
  expect(before.state).toBe('returned-unacknowledged');
  const tick = r.tick + 1000, acked = act(s, { type: 'acknowledge', alarmIds: [r.id] }, tick);
  expect(alarmList(acked, tick).find(a => a.id === r.id)).toMatchObject({ state: 'cleared', returnedAt: before.returnedAt, clearedAt: simulatedTime(tick) });
  expect(alarmList(acked, tick - 1)).toEqual(alarmList(s, tick - 1));
  expect(act(acked, { type: 'acknowledge', alarmIds: [r.id] }, tick)).toBe(acked);
});

it('ISA invariants compare finalized history when a return is replaced within the same tick', async () => {
  const { assertPlantInvariants } = await import('./invariants');
  let s = createPlantState(generateMockDataset());
  const tag = contextOf(s.dataset).tagById.get('E2-puller.puller-speed')!;
  s = act(s, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 101);
  const raised = alarmList(s, 199).find(a => a.tagId === tag.id && active(a))!;
  s = act(s, { type: 'reset-to-recipe', tagId: tag.id }, 200);
  expect(alarmList(s, 200).find(a => a.id === raised.id)!.state).toBe('returned-unacknowledged');
  const action = { type: 'setpoint-override' as const, tagId: tag.id, value: tag.max, reason: 'replacement' };
  const result = reduce(s, action, { tick: 200 });
  assertPlantInvariants(s, action, 200, result, new Set());
});

it('same-tick replacement can remove an acknowledged condition while retaining the action record', () => {
  let s = createPlantState(generateMockDataset());
  const tag = contextOf(s.dataset).tagById.get('E2-puller.puller-speed')!;
  s = act(s, { type: 'setpoint-override', tagId: tag.id, value: tag.max, reason: 'trial' }, 101);
  const id = `RZ-101-${tag.id}-high`;
  s = act(s, { type: 'acknowledge', alarmIds: [id] }, 101);
  s = act(s, { type: 'reset-to-recipe', tagId: tag.id }, 101);
  expect(alarmList(s, 101).some(a => a.id === id)).toBe(false);
  expect(s.events.some(e => e.action === 'alarm-acknowledge' && e.target === id)).toBe(true);
  expect(s.acks.has(id)).toBe(true);
  levelsAgree(s, 101);
});

it('an acknowledgement does not carry over to the opposite condition when a same-tick change replaces it (seed 436)', () => {
    const d = generateMockDataset(436);
    const tag = 'A2-corner-weld.weld-time';
    const run = (s: PlantState, a: PlantAction, tick: number) => {
      const r = reduce(s, a, { tick });
      if (!r.ok) throw new Error(r.error.code);
      return r;
    };
    let s = createPlantState(d);
    s = run(s, { type: 'setpoint-override', tagId: tag, value: 30, reason: 'x' }, 10).state;
    s = run(s, { type: 'reset-to-recipe', tagId: tag }, 78).state;
    const low = alarmList(s, 78).find((a) => a.tagId === tag && a.id.startsWith('RZ-78-'));
    expect(low?.message.key).toBe('alarm.low-value');
    s = run(s, { type: 'acknowledge', alarmIds: [low?.id ?? ''] }, 78).state;
    s = run(s, { type: 'setpoint-override', tagId: tag, value: 40, reason: 'y' }, 78).state;

    const high = alarmList(s, 79).find((a) => a.tagId === tag && a.message.key === 'alarm.high-value' && a.id.startsWith('RZ-78-'));
    expect(high).toBeDefined();
    expect(high?.id).not.toBe(low?.id);
    expect(high?.state).toBe('active-unacknowledged');
    const again = run(s, { type: 'acknowledge', alarmIds: [high?.id ?? ''] }, 79);
    expect(again.events).toHaveLength(1);
  });
