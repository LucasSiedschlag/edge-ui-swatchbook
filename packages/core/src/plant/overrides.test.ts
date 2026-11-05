import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { tagSeries } from '../sim/series';
import { simulate } from '../sim/simulate';
import { createPlantState, reduce } from './index';
import type { PlantAction, PlantState } from './index';

const d = generateMockDataset();
const start = () => createPlantState(d);
const tag = (id: string) => d.tags.find((t) => t.id === id);
const speed = tag('E2-puller.puller-speed');
const SPEED = speed?.id ?? '';
const mid = ((speed?.min ?? 0) + (speed?.max ?? 0)) / 2;

function ok(state: PlantState, action: PlantAction, tick: number) {
  const r = reduce(state, action, { tick });
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r;
}
const code = (state: PlantState, action: PlantAction, tick = 10) => {
  const r = reduce(state, action, { tick });
  return r.ok ? 'ok' : r.error.code;
};
const reading = (s: PlantState, tick: number, id = SPEED) => simulate(d, tick, s.overlay).tags.find((r) => r.tagId === id);

describe('Setpoint Override', () => {
  it('applies the new setpoint from the next tick, and logs the old and new values with the reason', () => {
    expect(speed?.setpoint).not.toBe(mid);
    const r = ok(start(), { type: 'setpoint-override', tagId: SPEED, value: mid, reason: 'trial run' }, 100);
    expect(reading(r.state, 100)?.setpoint).toBe(speed?.setpoint);
    expect(reading(r.state, 101)?.setpoint).toBe(mid);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      action: 'setpoint-override', targetKind: 'tag', target: SPEED, oldValue: speed?.setpoint, newValue: mid, note: 'trial run', at: simulatedTime(100),
    });
  });

  it('does not redraw the past', () => {
    const r = ok(start(), { type: 'setpoint-override', tagId: SPEED, value: mid, reason: 'x' }, 100);
    const before = tagSeries(d, SPEED, -200, 100, 1);
    expect(JSON.stringify(tagSeries(d, SPEED, -200, 100, 1, r.state.overlay))).toBe(JSON.stringify(before));
  });

  it('requires a reason', () => {
    for (const reason of ['', '   ']) expect(code(start(), { type: 'setpoint-override', tagId: SPEED, value: mid, reason })).toBe('reason-required');
  });

  it('rejects a value outside the Tag limits, and accepts the limits themselves', () => {
    const min = speed?.min ?? 0;
    const max = speed?.max ?? 0;
    expect(code(start(), { type: 'setpoint-override', tagId: SPEED, value: max + 0.01, reason: 'x' })).toBe('value-out-of-range');
    expect(code(start(), { type: 'setpoint-override', tagId: SPEED, value: min - 0.01, reason: 'x' })).toBe('value-out-of-range');
    expect(code(start(), { type: 'setpoint-override', tagId: SPEED, value: max, reason: 'x' })).toBe('ok');
    expect(code(start(), { type: 'setpoint-override', tagId: SPEED, value: min, reason: 'x' })).toBe('ok');
    expect(code(start(), { type: 'setpoint-override', tagId: SPEED, value: Number.NaN, reason: 'x' })).toBe('invalid-value');
  });

  it('rejects a Tag that is not writable, does not exist, or is Stale on an Offline Machine', () => {
    expect(code(start(), { type: 'setpoint-override', tagId: 'E2-extruder.melt-temperature', value: 180, reason: 'x' })).toBe('tag-not-writable');
    expect(code(start(), { type: 'setpoint-override', tagId: 'E2-nothing.none', value: 1, reason: 'x' })).toBe('unknown-tag');
    const offline = d.machines.find((m) => m.comms.status === 'offline');
    const stale = d.tags.find((t) => t.machineId === offline?.id && t.writable);
    expect(stale).toBeDefined();
    expect(code(start(), { type: 'setpoint-override', tagId: stale?.id ?? '', value: stale?.setpoint ?? 0, reason: 'x' })).toBe('tag-stale');
  });

  it('does nothing, and logs nothing, when the value is already the setpoint', () => {
    const r = ok(start(), { type: 'setpoint-override', tagId: SPEED, value: speed?.setpoint ?? 0, reason: 'x' }, 10);
    expect(r.events).toEqual([]);
  });

  it('chains: the old value of the next override is the new value of the last', () => {
    const a = ok(start(), { type: 'setpoint-override', tagId: SPEED, value: mid, reason: 'one' }, 100);
    const b = ok(a.state, { type: 'setpoint-override', tagId: SPEED, value: speed?.max ?? 0, reason: 'two' }, 200);
    expect(b.events[0]).toMatchObject({ oldValue: mid, newValue: speed?.max });
    expect(reading(b.state, 150)?.setpoint).toBe(mid);
    expect(reading(b.state, 201)?.setpoint).toBe(speed?.max);
  });

  it('keeps one step when the same Tag is changed twice in the same tick, and logs both', () => {
    const a = ok(start(), { type: 'setpoint-override', tagId: SPEED, value: mid, reason: 'one' }, 100);
    const b = ok(a.state, { type: 'setpoint-override', tagId: SPEED, value: speed?.max ?? 0, reason: 'two' }, 100);
    expect(b.state.overlay.setpoints?.get(SPEED)).toEqual([{ fromTick: 101, value: speed?.max }]);
    expect(() => simulate(d, 150, b.state.overlay)).not.toThrow();
    expect(b.state.events.length).toBe(d.events.length + 2);
  });

  it('gives the Simulator a new Overlay and leaves the old state alone', () => {
    const before = start();
    const r = ok(before, { type: 'setpoint-override', tagId: SPEED, value: mid, reason: 'x' }, 100);
    expect(r.state.overlay).not.toBe(before.overlay);
    expect(before.overlay.setpoints?.size ?? 0).toBe(0);
  });

  it('raises one Alarm when an override puts a Tag on its limit', () => {
    const r = ok(start(), { type: 'setpoint-override', tagId: SPEED, value: speed?.max ?? 0, reason: 'x' }, 100);
    const s = ok(r.state, { type: 'advance' }, 1500).state;
    expect(s.alarms.filter((a) => a.tagId === SPEED && !d.alarms.some((x) => x.id === a.id))).toHaveLength(1);
  });
});

describe('Reset to recipe value', () => {
  const overridden = () => ok(start(), { type: 'setpoint-override', tagId: SPEED, value: mid, reason: 'x' }, 100).state;

  it('puts the setpoint of the active Recipe Version back from the next tick, and logs it', () => {
    const r = ok(overridden(), { type: 'reset-to-recipe', tagId: SPEED }, 300);
    expect(reading(r.state, 300)?.setpoint).toBe(mid);
    expect(reading(r.state, 301)?.setpoint).toBe(speed?.setpoint);
    expect(r.events[0]).toMatchObject({ action: 'reset-to-recipe', targetKind: 'tag', target: SPEED, oldValue: mid, newValue: speed?.setpoint, at: simulatedTime(300) });
  });

  it('keeps the past, because it adds a step and removes none', () => {
    const r = ok(overridden(), { type: 'reset-to-recipe', tagId: SPEED }, 300);
    expect(reading(r.state, 200)?.setpoint).toBe(mid);
    expect(r.state.overlay.setpoints?.get(SPEED)).toHaveLength(2);
  });

  it('does nothing when the setpoint is already the recipe value', () => {
    expect(ok(start(), { type: 'reset-to-recipe', tagId: SPEED }, 10).events).toEqual([]);
  });

  it('refuses a Tag that has no Recipe value: not linked to a Parameter, or on a Line with no Batch', () => {
    expect(code(start(), { type: 'reset-to-recipe', tagId: 'E2-calibrator.vacuum' })).toBe('no-recipe-value');
    expect(code(start(), { type: 'reset-to-recipe', tagId: 'C1-cnc.feed-rate' })).toBe('no-recipe-value');
    expect(code(start(), { type: 'reset-to-recipe', tagId: 'E2-nothing.none' })).toBe('unknown-tag');
  });
});
