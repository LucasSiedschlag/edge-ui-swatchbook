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

  it('dates the return of a dataset raise at the first tick the Tag is out of alarm', () => {
    for (const r of raises(d, 0, 3600)) {
      expect(r.returnTick).not.toBeNull();
      const rt = r.returnTick as number;
      expect(rt).toBeGreaterThan(r.tick);
      expect(simulate(d, rt - 1).tags.find((x) => x.tagId === r.tagId)?.alarm).toBe(r.direction);
      expect(simulate(d, rt).tags.find((x) => x.tagId === r.tagId)?.alarm).toBeNull();
    }
  });

  it('gives no return tick for a raise caused by an override, because it is a forecast', () => {
    for (const r of raises(d, 0, 900, at(tag?.max ?? 0)).filter((x) => x.tagId === id)) expect(r.returnTick).toBeNull();
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
