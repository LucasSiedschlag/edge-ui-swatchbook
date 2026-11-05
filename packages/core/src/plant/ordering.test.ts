import { describe, expect, it } from 'vitest';
import * as core from '../index';
import { generateMockDataset } from '../mock/generate';
import { raises, returns } from '../sim/alarms';
import { simulatedTime } from '../sim/clock';
import { simulate } from '../sim/simulate';
import { firstTick, tagSeries } from '../sim/series';
import { reconcileAt } from './alarms';
import { createPlantState, lineStatus, reduce } from './index';
import type { PlantAction, PlantState } from './types';

const fresh = () => createPlantState(generateMockDataset());
const speed = 'E2-puller.puller-speed';
function act(state: PlantState, action: PlantAction, tick: number): PlantState {
  const result = reduce(state, action, { tick });
  expect(result.ok, `${action.type} at ${tick}: ${!result.ok && result.error.code}`).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}
const history = (s: PlantState) => ({ alarms: s.alarms, events: s.events });

describe('open action tick', () => {
  it('keeps tick 46 open until the next advance, including an advance before Pause', () => {
    const start = fresh();
    const direct = act(start, { type: 'pause', lineId: 'E1' }, 46);
    const split = act(act(start, { type: 'advance' }, 46), { type: 'pause', lineId: 'E1' }, 46);
    expect(direct.alarms).toHaveLength(160);
    expect(history(split)).toEqual(history(direct));
    expect(history(act(split, { type: 'advance' }, 47))).toEqual(history(act(direct, { type: 'advance' }, 47)));
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
    const finalized = act(resumed, { type: 'advance' }, 468);
    expect(finalized.alarms.find(a => a.id === 'AL-0160')?.returnedAt).toBe(simulatedTime(467));
    expect(lineStatus(finalized, 'E1').criticalAlarms).toBe(0);
  });

  it('uses identical dated admissions and identities for an inclusive Resume peek and its later finalization', () => {
    let state = act(fresh(), { type: 'pause', lineId: 'E2' }, 0);
    const tag = state.dataset.tags.find(t => t.id === speed)!;
    state = act(state, { type: 'setpoint-override', tagId: speed, value: tag.max, reason: 'trial' }, 0);
    state = act(state, { type: 'resume', lineId: 'E2' }, 101);
    const before = history(state), ids = state.ids;
    const peek = reconcileAt(state);
    expect(peek.alarms.some(a => a.tagId === speed && a.raisedAt === simulatedTime(101))).toBe(true);
    expect(history(act(state, { type: 'advance' }, 102))).toEqual(history(peek));
    expect(state.ids).toBe(ids);
    expect(history(state)).toEqual(before);
    expect(reconcileAt(state).alarms).toEqual(peek.alarms);
  });

  for (const tick of [46, 467, 1000]) for (const type of ['pause', 'resume', 'setpoint-override', 'reset-to-recipe', 'emergency-stop', 'reset'] as const) {
    it(`${type} at ${tick} has identical history with advance at the action tick`, () => {
      let start = fresh();
      const tag = start.dataset.tags.find(t => t.id === speed)!;
      if (type === 'resume') start = act(start, { type: 'pause', lineId: 'E2' }, 0);
      if (type === 'reset') start = act(start, { type: 'emergency-stop', lineId: 'E2', confirmed: true }, 0);
      if (type === 'reset-to-recipe') start = act(start, { type: 'setpoint-override', tagId: speed, value: tag.max, reason: 'trial' }, 0);
      const action: PlantAction = type === 'setpoint-override' ? { type, tagId: speed, value: tag.max, reason: 'trial' }
        : type === 'reset-to-recipe' ? { type, tagId: speed }
        : type === 'emergency-stop' ? { type, lineId: 'E1', confirmed: true } : { type, lineId: type === 'pause' ? 'E1' : 'E2' };
      const direct = act(start, action, tick);
      const split = act(act(start, { type: 'advance' }, tick), action, tick);
      expect(history(split)).toEqual(history(direct));
      expect(history(act(split, { type: 'advance' }, tick + 100))).toEqual(history(act(direct, { type: 'advance' }, tick + 100)));
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
        for (const t of partitions.filter(t => t >= state.syncedTick && t <= tick)) state = act(state, { type: 'advance' }, t);
        state = act(state, action, tick);
      }
      for (const t of partitions.filter(t => t > state.syncedTick)) state = act(state, { type: 'advance' }, t);
      return history(act(state, { type: 'advance' }, 3000));
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
      for (const action of [{ type: 'advance' }, { type: 'set-user', userId: state.currentUserId }] as const) {
        expect(reduce(state, action, { tick })).toMatchObject({ ok: false, error: { code: 'invalid-tick' } });
      }
      expect(() => simulate(state.dataset, tick)).toThrow();
      expect(() => tagSeries(state.dataset, tagId, 0, tick)).toThrow();
      expect(() => tagSeries(state.dataset, tagId, tick, tick)).toThrow();
      expect(() => raises(state.dataset, 0, tick)).toThrow();
      expect(() => raises(state.dataset, tick, tick)).toThrow();
      expect(() => returns(state.dataset, 0, tick)).toThrow();
    }
  });
  it('supports control and an inclusive peek at the exact horizon', () => {
    let state = act(fresh(), { type: 'advance' }, core.MAX_TICK);
    // Put a fresh condition on a Tag whose low limit is crossed at the horizon.
    const tag = state.dataset.tags.find(t => t.id === speed)!;
    state = act(state, { type: 'setpoint-override', tagId: speed, value: tag.min, reason: 'horizon' }, core.MAX_TICK);
    expect(tagSeries(state.dataset, speed, core.MAX_TICK, core.MAX_TICK, 1, state.overlay)[0]!.alarm).toBe('low');
    expect(() => reconcileAt(state)).not.toThrow();
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

  it('catches up across shifts within a generous 2500 ms bound', () => {
    for (const tick of [28800, 57600, 115200]) {
      const state = fresh(), start = performance.now();
      act(state, { type: 'advance' }, tick);
      const ms = performance.now() - start;
      console.info(`catch-up ${tick}: ${ms.toFixed(1)} ms`);
      expect(ms, `advance to ${tick}`).toBeLessThan(2500);
    }
  }, 120000);
});
