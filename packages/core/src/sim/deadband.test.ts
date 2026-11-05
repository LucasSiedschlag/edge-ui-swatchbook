import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises } from './alarms';
import type { Overlay } from './overlay';
import { tagSeries } from './series';
import { simulate } from './simulate';

const d = generateMockDataset();
const tag = d.tags.find((t) => t.id === 'E1-puller.puller-speed');
const id = tag?.id ?? '';
const at = (value: number): Overlay => ({ setpoints: new Map([[id, [{ fromTick: 100, value }]]]) });
const alarmAt = (tick: number, overlay?: Overlay) => simulate(d, tick, overlay).tags.find((r) => r.tagId === id)?.alarm;

describe('deadband: a Tag stays in alarm until it is clearly back inside', () => {
  it('raises once, not on every crossing, when an override sits exactly on a limit', () => {
    for (const value of [tag?.max ?? 0, tag?.min ?? 0]) {
      const mine = raises(d, 0, 900, at(value)).filter((r) => r.tagId === id);
      expect(mine).toHaveLength(1);
      expect(mine[0]?.direction).toBe(value === tag?.max ? 'high' : 'low');
    }
  });

  it('keeps the alarm state set for as long as the value hovers at the limit', () => {
    const overlay = at(tag?.max ?? 0);
    const first = raises(d, 0, 900, overlay).find((r) => r.tagId === id)?.tick ?? 0;
    for (let tick = first; tick < first + 400; tick += 7) expect(alarmAt(tick, overlay)).toBe('high');
  });

  it('leaves the alarm state empty for a Tag well inside its limits', () => {
    for (const tick of [0, 100, 5000]) expect(alarmAt(tick)).toBeNull();
  });

  it('clears the alarm state once the override is lifted and the value is clearly inside', () => {
    const lifted: Overlay = { setpoints: new Map([[id, [{ fromTick: 100, value: tag?.max ?? 0 }, { fromTick: 700, value: tag?.setpoint ?? 0 }]]]) };
    expect(alarmAt(650, lifted)).toBe('high');
    expect(alarmAt(1100, lifted)).toBeNull();
  });
});

describe('raises: identity and edges', () => {
  it('gives every raise a unique id made from its tick and Tag', () => {
    const list = raises(d, 0, 7200);
    expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
    for (const r of list) expect(r.id).toBe(`RZ-${r.tick}-${r.tagId}`);
  });

  it('has no return tick, because Plant State watches the alarm state of each Tag', () => {
    for (const r of raises(d, 0, 3600)) expect('returnTick' in r).toBe(false);
  });

  it('does not raise again for a Tag that an Alarm already holds out of limits', () => {
    const open = d.alarms.find((a) => a.state === 'active-unacknowledged' && a.tagId !== null);
    const held: Overlay = { setpoints: new Map([[open?.tagId as string, [{ fromTick: -500, value: d.tags.find((t) => t.id === open?.tagId)?.setpoint ?? 0 }]]]) };
    expect(raises(d, -400, 0, held).filter((r) => r.tagId === open?.tagId)).toHaveLength(0);
  });

  it('keeps the alarm state in step with tagSeries', () => {
    const s = tagSeries(d, id, 90, 120, 1, at(tag?.max ?? 0));
    expect(s.every((p) => p.alarm === simulate(d, p.tick, at(tag?.max ?? 0)).tags.find((r) => r.tagId === id)?.alarm)).toBe(true);
  });
});


describe('deadband: an exact latch on each side', () => {
  const overlays = new Map<string, Overlay>();
  const holdAt = (tagId: string, value: number, fromTick = 100): Overlay => {
    const key = `${tagId}|${value}|${fromTick}`;
    if (!overlays.has(key)) overlays.set(key, { setpoints: new Map([[tagId, [{ fromTick, value }]]]) });
    return overlays.get(key) as Overlay;
  };
  const tags = ['E1-puller.puller-speed', 'E2-extruder.barrel-zone-4-temp', 'RF1-roll-former.line-speed', 'A1-corner-weld.weld-time'];

  it.each(tags)('raises exactly once in two hours for %s held at max, and once held at min', (tagId) => {
    const t = d.tags.find((x) => x.id === tagId);
    expect(t).toBeDefined();
    for (const value of [t?.max ?? 0, t?.min ?? 0]) {
      expect(raises(d, 0, 7200, holdAt(tagId, value)).filter((r) => r.tagId === tagId)).toHaveLength(1);
    }
  });

  it('keeps the alarm state set through two hours at a limit, and does not clear by running out of history', () => {
    const o = holdAt(id, tag?.max ?? 0);
    for (let tick = 150; tick <= 7200; tick += 37) expect(simulate(d, tick, o).tags.find((r) => r.tagId === id)?.alarm).toBe('high');
  });

  it('swaps high for low when the override steps from one limit to the other', () => {
    const o: Overlay = { setpoints: new Map([[id, [{ fromTick: 100, value: tag?.max ?? 0 }, { fromTick: 400, value: tag?.min ?? 0 }]]]) };
    const mine = raises(d, 0, 1200, o).filter((r) => r.tagId === id);
    expect(mine.map((r) => r.direction)).toEqual(['high', 'low']);
    const read = (tick: number) => simulate(d, tick, o).tags.find((r) => r.tagId === id)?.alarm;
    expect(read(399)).toBe('high');
    expect(read(mine[1]?.tick ?? 0)).toBe('low');
    for (let tick = (mine[1]?.tick ?? 0) + 1; tick < 1200; tick += 11) expect(read(tick)).toBe('low');
  });

  it('only shows an alarm on a Tag that is out of limits or still inside the deadband', () => {
    for (let tick = 0; tick < 2000; tick += 13) {
      for (const r of simulate(d, tick).tags) {
        const t = d.tags.find((x) => x.id === r.tagId);
        const margin = ((t?.max ?? 0) - (t?.min ?? 0)) * 0.05;
        if (r.alarm === null) expect(r.status === 'normal' || r.status === 'stale').toBe(true);
        if (r.alarm === 'high' && r.status === 'normal') expect(r.value).toBeGreaterThan((t?.max ?? 0) - margin);
        if (r.alarm === 'low' && r.status === 'normal') expect(r.value).toBeLessThan((t?.min ?? 0) + margin);
      }
    }
  });
});
