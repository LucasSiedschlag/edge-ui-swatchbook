import { describe, expect, it } from 'vitest';
import * as core from '../index';
import { generateMockDataset } from '../mock/generate';
import { raises, returns } from '../sim/alarms';
import { simulatedTime } from '../sim/clock';
import { simulate } from '../sim/simulate';
import { firstTick, tagSeries } from '../sim/series';
import { alarmList, createPlantState, lineStatus, reduce } from './index';
import type { PlantAction, PlantState } from './types';

const fresh = () => createPlantState(generateMockDataset());
const speed = 'E2-puller.puller-speed';
function act(state: PlantState, action: PlantAction, tick: number): PlantState {
  const result = reduce(state, action, { tick });
  expect(result.ok, `${action.type} at ${tick}: ${!result.ok && result.error.code}`).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}
const history = (s: PlantState, tick = s.lastTick) => ({ alarms: alarmList(s, tick), events: s.events });

describe('queries and the action tick', () => {
  it('queries at tick 46 do not affect a Pause at 46 or the past', () => {
    const start = fresh();
    const direct = act(start, { type: 'pause', lineId: 'E1' }, 46);
    alarmList(start, 46);
    const split = act(start, { type: 'pause', lineId: 'E1' }, 46);
    expect(alarmList(direct, 46)).toHaveLength(160);
    expect(history(split)).toEqual(history(direct));
    expect(history(split, 47)).toEqual(history(direct, 47));
  });

  it('refuses Resume when its inclusive admission would introduce a Critical Alarm at 7010', () => {
    const paused = act(fresh(), { type: 'pause', lineId: 'A1' }, 0);
    expect(reduce(paused, { type: 'resume', lineId: 'A1' }, { tick: 7010 })).toMatchObject({ ok: false, error: { code: 'critical-alarm-active' } });
    expect(paused.controls.A1.paused).toBe(true);
  });

  it('allows Resume at the exact return tick of AL-0160, without keeping a Critical Alarm', () => {
    const paused = act(fresh(), { type: 'pause', lineId: 'E1' }, 0);
    const resumed = act(paused, { type: 'resume', lineId: 'E1' }, 467);
    expect(lineStatus(resumed, 'E1').criticalAlarms).toBe(0);
    expect(alarmList(resumed, 468).find(a => a.id === 'AL-0160')?.returnedAt).toBe(simulatedTime(467));
    expect(lineStatus(resumed, 'E1', 468).criticalAlarms).toBe(0);
  });

  it('uses identical dated admissions and identities across repeated queries after Resume', () => {
    let state = act(fresh(), { type: 'pause', lineId: 'E2' }, 0);
    const tag = state.dataset.tags.find(t => t.id === speed)!;
    state = act(state, { type: 'setpoint-override', tagId: speed, value: tag.max, reason: 'trial' }, 0);
    state = act(state, { type: 'resume', lineId: 'E2' }, 101);
    const before = history(state), ids = state.ids;
    const peek = alarmList(state, 101);
    expect(peek.some(a => a.tagId === speed && a.raisedAt === simulatedTime(101))).toBe(true);
    expect(alarmList(state, 102)).toEqual(peek);
    expect(state.ids).toBe(ids);
    expect(history(state)).toEqual(before);
    expect(alarmList(state, 101)).toEqual(peek);
  });

  for (const tick of [46, 467, 1000]) for (const type of ['pause', 'resume', 'setpoint-override', 'reset-to-recipe', 'emergency-stop', 'reset'] as const) {
    it(`${type} at ${tick} has identical history with a query at the action tick`, () => {
      let start = fresh();
      const tag = start.dataset.tags.find(t => t.id === speed)!;
      if (type === 'resume') start = act(start, { type: 'pause', lineId: 'E2' }, 0);
      if (type === 'reset') start = act(start, { type: 'emergency-stop', lineId: 'E2', confirmed: true }, 0);
      if (type === 'reset-to-recipe') start = act(start, { type: 'setpoint-override', tagId: speed, value: tag.max, reason: 'trial' }, 0);
      const action: PlantAction = type === 'setpoint-override' ? { type, tagId: speed, value: tag.max, reason: 'trial' }
        : type === 'reset-to-recipe' ? { type, tagId: speed }
        : type === 'emergency-stop' ? { type, lineId: 'E1', confirmed: true } : { type, lineId: type === 'pause' ? 'E1' : 'E2' };
      const direct = act(start, action, tick);
      alarmList(start, tick);
      const split = act(start, action, tick);
      expect(history(split)).toEqual(history(direct));
      expect(history(split, tick + 100)).toEqual(history(direct, tick + 100));
    });
  }

  it('preserves all Alarm fields and Event Log across arbitrary partitions including control ticks', () => {
    const schedule: [number, PlantAction][] = [
      [0, { type: 'pause', lineId: 'E2' }],
      [46, { type: 'pause', lineId: 'E1' }],
      [101, { type: 'resume', lineId: 'E2' }],
      [467, { type: 'resume', lineId: 'E1' }],
      [500, { type: 'setpoint-override', tagId: speed, value: fresh().dataset.tags.find(t => t.id === speed)!.max, reason: 'trial' }],
      [700, { type: 'emergency-stop', lineId: 'E2', confirmed: true }],
      [800, { type: 'reset', lineId: 'E2' }],
      [850, { type: 'resume', lineId: 'E2' }],
      [1000, { type: 'reset-to-recipe', tagId: speed }],
    ];
    const run = (partitions: number[]) => {
      let state = fresh();
      for (const [tick, action] of schedule) {
        for (const t of partitions.filter(t => t >= state.lastTick && t <= tick)) alarmList(state, t);
        state = act(state, action, tick);
      }
      for (const t of partitions.filter(t => t > state.lastTick)) alarmList(state, t);
      return history(state, 3000);
    };
    expect(run([0, 1, 45, 46, 47, 100, 101, 466, 467, 500, 600, 700, 800, 850, 999, 1000, 1001, 1500, 2999])).toEqual(run([]));
  });
});

describe('bounded session', () => {
  it('exports a seven day horizon and rejects unsupported and unsafe ticks at every public ingress', () => {
    const max = (core as unknown as { MAX_TICK: number }).MAX_TICK;
    expect(max).toBe(7 * 86400);
    const state = fresh(), tagId = state.dataset.tags[0]!.id;
    for (const tick of [max + 1, Number.MAX_SAFE_INTEGER + 1]) {
      for (const action of [{ type: 'pause', lineId: 'E2' }, { type: 'set-user', userId: state.currentUserId }] as const) {
        expect(reduce(state, action, { tick })).toMatchObject({ ok: false, error: { code: 'invalid-tick' } });
      }
      expect(() => simulate(state.dataset, tick)).toThrow();
      expect(() => tagSeries(state.dataset, tagId, 0, tick)).toThrow();
      expect(() => tagSeries(state.dataset, tagId, tick, tick)).toThrow();
      expect(() => raises(state.dataset, 0, tick)).toThrow();
      expect(() => raises(state.dataset, tick, tick)).toThrow();
      expect(() => returns(state.dataset, 0, tick)).toThrow();
      expect(() => returns(state.dataset, tick, 0)).toThrow();
      expect(() => core.alarmTransitions(state.dataset, undefined, tick, 0)).toThrow();
    }
  });
  it('supports control and an Alarm query at the exact horizon', () => {
    let state = fresh();
    // Put a fresh condition on a Tag whose low limit is crossed at the horizon.
    const tag = state.dataset.tags.find(t => t.id === speed)!;
    state = act(state, { type: 'setpoint-override', tagId: speed, value: tag.min, reason: 'horizon' }, core.MAX_TICK);
    expect(tagSeries(state.dataset, speed, core.MAX_TICK, core.MAX_TICK, 1, state.overlay)[0]!.alarm).toBe('low');
    expect(() => alarmList(state, core.MAX_TICK)).not.toThrow();
    expect(() => simulate(state.dataset, core.MAX_TICK, state.overlay)).not.toThrow();
    expect(tagSeries(state.dataset, speed, core.MAX_TICK, core.MAX_TICK, 1, state.overlay)).toHaveLength(1);
  });

  it('stops a lazy return scan at its first match', () => {
    const state = fresh();
    let visits = 0;
    expect(firstTick(state.dataset, speed, 0, 115200, undefined, () => ++visits === 3)).toBe(2);
    expect(visits).toBe(3);
    expect(firstTick(state.dataset, speed, 0, 2, undefined, () => false)).toBeUndefined();
    expect(() => firstTick(state.dataset, speed, 0, core.MAX_TICK + 1, undefined, () => true)).toThrow();
  });

  it('lists Alarms across shifts within a generous 2500 ms bound', () => {
    for (const tick of [28800, 57600, 115200]) {
      const state = fresh(), start = performance.now();
      alarmList(state, tick);
      const ms = performance.now() - start;
      console.info(`alarmList ${tick}: ${ms.toFixed(1)} ms`);
      expect(ms, `alarmList at ${tick}`).toBeLessThan(2500);
    }
  }, 120000);
});
