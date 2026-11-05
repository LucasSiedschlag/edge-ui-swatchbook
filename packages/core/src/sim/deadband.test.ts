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


describe('deadband: a switch of side is a new raise', () => {
  const swap = (tagId: string, hi: number, lo: number): Overlay => ({ setpoints: new Map([[tagId, [{ fromTick: 100, value: hi }, { fromTick: 400, value: lo }]]]) });

  it('raises high, then low, when an override steps from max to min, for Tags that never pass through null', () => {
    const t = d.tags.find((x) => x.id === 'E1-extruder.barrel-zone-1-temp');
    const o = swap(t?.id ?? '', t?.max ?? 0, t?.min ?? 0);
    const mine = raises(d, 0, 1200, o).filter((r) => r.tagId === t?.id);
    expect(mine.map((r) => r.direction)).toEqual(['high', 'low']);
    expect(simulate(d, mine[1]?.tick ?? 0, o).tags.find((r) => r.tagId === t?.id)?.alarm).toBe('low');
  });

  it('has a raise for every change of alarm direction on every writable Tag', () => {
    const writable = d.tags.filter((x) => x.writable && x.unit !== 'pcs' && x.unit !== 'h');
    const o: Overlay = {
      setpoints: new Map(writable.map((x) => [x.id, [{ fromTick: 100, value: x.max }, { fromTick: 400, value: x.min }]])),
    };
    const list = raises(d, 0, 900, o);
    let prev = simulate(d, 0, o).tags;
    for (let tick = 1; tick <= 900; tick++) {
      const cur = simulate(d, tick, o).tags;
      cur.forEach((r, i) => {
        const was = prev[i]?.alarm ?? null;
        if (r.alarm !== null && r.alarm !== was && r.status !== 'stale') {
          expect(list.some((x) => x.tick === tick && x.tagId === r.tagId && x.direction === r.alarm)).toBe(true);
        }
      });
      prev = cur;
    }
  });
});

describe('deadband: the latch follows the override timeline', () => {
  const max = tag?.max ?? 0;
  const first: Overlay = { setpoints: new Map([[id, [{ fromTick: 100, value: max }]]]) };
  const alarms = (o: Overlay, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => simulate(d, from + k, o).tags.find((r) => r.tagId === id)?.alarm);

  it('gives the same answers from a new Overlay object with the same steps', () => {
    const copy: Overlay = { setpoints: new Map([[id, [{ fromTick: 100, value: max }]]]) };
    expect(alarms(copy, 90, 700)).toEqual(alarms(first, 90, 700));
  });

  it('leaves the past alone when a step is appended, and changes only what follows', () => {
    const next: Overlay = { setpoints: new Map([[id, [{ fromTick: 100, value: max }, { fromTick: 500, value: tag?.setpoint ?? 0 }]]]) };
    expect(alarms(next, 90, 499)).toEqual(alarms(first, 90, 499));
    expect(alarms(next, 800, 810).every((a) => a === null)).toBe(true);
    expect(alarms(first, 800, 810).every((a) => a === 'high')).toBe(true);
  });

  it('follows a step list edited in place', () => {
    const steps = [{ fromTick: 100, value: max }];
    const o: Overlay = { setpoints: new Map([[id, steps]]) };
    expect(alarms(o, 300, 300)[0]).toBe('high');
    steps[0] = { fromTick: 100, value: tag?.setpoint ?? 0 };
    expect(alarms(o, 300, 300)[0]).toBeNull();
  });

  it('does not rewrite the alarm history before the latch starts when an override is added', () => {
    const open = d.alarms.find((a) => a.state === 'active-unacknowledged' && a.tagId !== null);
    const t = d.tags.find((x) => x.id === open?.tagId);
    const o: Overlay = { setpoints: new Map([[t?.id ?? '', [{ fromTick: 100, value: t?.setpoint ?? 0 }]]]) };
    const at = (tick: number, ov?: Overlay) => tagSeries(d, t?.id ?? '', tick, tick, 1, ov)[0]?.alarm;
    for (const tick of [-20_000, -10_000, -7600]) expect(at(tick, o)).toBe(at(tick));
  });
});


describe('deadband: every writable Tag, held at a limit for half a day', () => {
  const writable = d.tags.filter((x) => x.writable && x.unit !== 'pcs' && x.unit !== 'h' && !d.machines.some((m) => m.id === x.machineId && m.comms.status === 'offline'));
  const hasAlarm = new Set(d.alarms.filter((a) => a.tagId !== null && (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged' || a.state === 'returned-unacknowledged')).map((a) => a.tagId));
  const hold = (pick: (t: (typeof writable)[number]) => number): Overlay => ({ setpoints: new Map(writable.map((x) => [x.id, [{ fromTick: 100, value: pick(x) }]])) });
  const atMax = hold((x) => x.max);
  const atMin = hold((x) => x.min);

  it.each([['max', atMax], ['min', atMin]] as const)('raises once per Tag held at %s, even when a dataset excursion would hit the other side', (_name, overlay) => {
    const list = raises(d, 0, 43_200, overlay);
    for (const x of writable) {
      const n = list.filter((r) => r.tagId === x.id).length;
      if (hasAlarm.has(x.id)) expect(n).toBeLessThanOrEqual(2);
      else expect(n).toBe(1);
    }
  }, 120_000);
});

describe('overlay: steps must be sorted', () => {
  const o = (steps: { fromTick: number; value: number }[]): Overlay => ({ setpoints: new Map([[id, steps]]) });

  it('refuses steps that are out of order or repeat a tick', () => {
    expect(() => simulate(d, 10, o([{ fromTick: 50, value: 1 }, { fromTick: 20, value: 2 }]))).toThrow();
    expect(() => simulate(d, 10, o([{ fromTick: 20, value: 1 }, { fromTick: 20, value: 2 }]))).toThrow();
    expect(() => raises(d, 0, 10, o([{ fromTick: 50, value: 1 }, { fromTick: 20, value: 2 }]))).toThrow();
    expect(() => tagSeries(d, id, 0, 10, 1, o([{ fromTick: 50, value: 1 }, { fromTick: 20, value: 2 }]))).toThrow();
  });

  it('accepts sorted steps', () => {
    expect(() => simulate(d, 10, o([{ fromTick: 20, value: 1 }, { fromTick: 50, value: 2 }]))).not.toThrow();
  });
});


describe('overlay: an override ends the hold of an open Alarm', () => {
  const open = d.alarms.find((a) => a.state === 'active-unacknowledged' && a.tagId !== null);
  const held = d.tags.find((x) => x.id === open?.tagId);
  const mid = ((held?.min ?? 0) + (held?.max ?? 0)) / 2;
  const reading = (tick: number, o?: Overlay) => simulate(d, tick, o).tags.find((r) => r.tagId === held?.id);

  it('keeps the Tag out of limits until the Alarm window ends when nothing is overridden', () => {
    expect(reading(150)?.status).not.toBe('normal');
    expect(reading(150)?.alarm).not.toBeNull();
  });

  it('brings the Tag back inside limits from the tick an override that differs from the recipe value starts', () => {
    expect(mid).not.toBe(held?.setpoint);
    const o: Overlay = { setpoints: new Map([[held?.id ?? '', [{ fromTick: 100, value: mid }]]]) };
    expect(reading(99, o)?.status).not.toBe('normal');
    expect(reading(100, o)?.status).toBe('normal');
    expect(reading(110, o)?.alarm).toBeNull();
    expect(tagSeries(d, held?.id ?? '', 100, 140, 1, o).every((p) => p.status === 'normal')).toBe(true);
  });

  it('does not end the hold when the step only puts the recipe value back', () => {
    const o: Overlay = { setpoints: new Map([[held?.id ?? '', [{ fromTick: 100, value: held?.setpoint ?? 0 }]]]) };
    expect(reading(150, o)?.status).toBe(reading(150)?.status);
  });
});

describe('simulate: ticks before load', () => {
  it('refuses a negative tick for the full snapshot, and still allows it for Tag history', () => {
    expect(() => simulate(d, -1)).toThrow();
    expect(tagSeries(d, id, -5, 0)).toHaveLength(6);
  });
});
