import { expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { alarmTransitions, raises, returns } from './alarms';
import { contextOf } from './context';
import type { Overlay } from './overlay';
import { alarmedAt } from './tags';

for (const seed of [1, 436, 20260101]) it(`seed ${seed}: transitions replay every Tag level at every tick with and without overrides`, () => {
  const d = generateMockDataset(seed), ctx = contextOf(d);
  const tags = [...ctx.tagById.values()];
  const overlays: (Overlay | undefined)[] = [undefined, { setpoints: new Map(tags.filter(t => t.writable).map(t => [t.id, [
    { fromTick: 100, value: t.max }, { fromTick: 400, value: t.min }, { fromTick: 700, value: t.setpoint },
  ]])) }];
  for (const overlay of overlays) {
    const list = alarmTransitions(d, overlay, -1, 1200);
    expect(list).toEqual([...list].sort((a, b) => a.tick - b.tick || a.tagId.localeCompare(b.tagId)));
    expect([...alarmTransitions(d, overlay, -1, 400), ...alarmTransitions(d, overlay, 400, 1200)]).toEqual(list);
    const levels = new Map(tags.map(t => [t.id, alarmedAt(ctx, t, -1, overlay)]));
    let i = 0;
    for (let tick = 0; tick <= 1200; tick++) {
      while (list[i]?.tick === tick) {
        const change = list[i++]!;
        expect(change.previous).toBe(levels.get(change.tagId));
        expect(change.level).not.toBe(change.previous);
        levels.set(change.tagId, change.level);
      }
      // One assertion per tick keeps this exhaustive comparison inexpensive.
      const wrong = tags.find(t => levels.get(t.id) !== alarmedAt(ctx, t, tick, overlay));
      expect(wrong?.id, `seed ${seed}, tick ${tick}`).toBeUndefined();
    }
    expect(raises(d, -1, 1200, overlay).map(r => [r.tick, r.tagId, r.direction])).toEqual(list.filter(c => c.level !== null).map(c => [c.tick, c.tagId, c.level]));
    const back = returns(d, -1, 1200, overlay).filter(r => r.tagId !== null);
    expect(back.map(r => [r.tick, r.tagId])).toEqual(list.filter(c => c.previous !== null).map(c => [c.tick, c.tagId]));
  }
});

it('includes natural non-central crossings, overlapping holds, direction changes and Stale returns', () => {
  const d = generateMockDataset(436), ctx = contextOf(d);
  const transitions = alarmTransitions(d, undefined, -1, 28200);
  expect(transitions.some(t => t.tick >= 27950)).toBe(true);
  const tags = [...ctx.tagById.values()], levels = new Map(tags.map(tag => [tag.id, alarmedAt(ctx, tag, 27949)]));
  const changes = transitions.filter(t => t.tick >= 27950);
  let i = 0;
  for (let tick = 27950; tick <= 28200; tick++) {
    while (changes[i]?.tick === tick) {
      const change = changes[i++]!;
      levels.set(change.tagId, change.level);
    }
    const wrong = tags.find(tag => levels.get(tag.id) !== alarmedAt(ctx, tag, tick));
    expect(wrong?.id, `natural crossing at ${tick}`).toBeUndefined();
  }
});

it('unions overlapping hold and excursion intervals and returns a Stale Tag at its heartbeat', () => {
  const source = generateMockDataset(), base = source.alarms[0]!;
  const tag = contextOf(source).tagById.get('E1-calibrator.water-flow')!;
  const excursion = raises(source, 45, 46).find(r => r.tagId === tag.id)!;
  expect(excursion).toBeDefined();
  const held = { ...base, id: 'hold', tagId: tag.id, machineId: tag.machineId, lineId: tag.lineId,
    state: 'returned-unacknowledged' as const, raisedAt: source.now + 36_000, returnedAt: source.now + 60_000,
    message: { key: excursion.direction === 'high' ? 'alarm.high-value' : 'alarm.low-value' } };
  const d = { ...source, alarms: [held] };
  const mine = alarmTransitions(d, undefined, 0, 100).filter(c => c.tagId === tag.id);
  expect(mine.map(c => [c.tick, c.level])).toEqual([[36, excursion.direction], [76, null]]);
  const offline = { ...d, machines: d.machines.map(m => m.id === tag.machineId ? { ...m, comms: { ...m.comms, status: 'offline' as const, lastHeartbeatAt: d.now + 50_000 } } : m) };
  expect(alarmTransitions(offline, undefined, 0, 100).filter(c => c.tagId === tag.id).map(c => [c.tick, c.level])).toEqual([[36, excursion.direction], [50, null]]);
});

it('Tag returns identify the condition, since run spans can suppress or redate its Alarm', () => {
  const d = generateMockDataset(), tag = contextOf(d).tagById.get('E2-puller.puller-speed')!;
  const overlay: Overlay = {
    runTicks: (_line, _from, _to) => 0,
    setpoints: new Map([[tag.id, [{ fromTick: 101, value: tag.max }, { fromTick: 200, value: tag.setpoint }]]]),
  };
  const back = returns(d, 0, 300, overlay).find(r => r.tagId === tag.id)!;
  expect(back).toEqual({ tick: 200, tagId: tag.id, alarmId: null });
  expect([...returns(d, 0, 150, overlay), ...returns(d, 150, 300, overlay)]).toEqual(returns(d, 0, 300, overlay));
});
