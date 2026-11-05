import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { raises, returns } from '../sim/alarms';
import { tagSeries } from '../sim/series';
import { alarmList, createPlantState, lineStatus, reduce } from './index';
import type { PlantAction, PlantState } from './index';

const d = generateMockDataset();
const start = () => createPlantState(d);

function ok(state: PlantState, action: PlantAction, tick: number) {
  const r = reduce(state, action, { tick });
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r;
}
const alarm = (s: PlantState, id: string) => alarmList(s, s.lastTick).find((a) => a.id === id);
const open = (s: PlantState) => alarmList(s, s.lastTick).filter((a) => a.state === 'active-unacknowledged' || a.state === 'active-acknowledged');

describe('Acknowledge', () => {
  const unack = d.alarms.find((a) => a.state === 'active-unacknowledged');
  const returned = d.alarms.find((a) => a.state === 'returned-unacknowledged');
  const acked = d.alarms.find((a) => a.state === 'active-acknowledged');
  const cleared = d.alarms.find((a) => a.state === 'cleared');

  it('starts with the Alarms of the Mock Dataset', () => {
    expect(alarmList(start(), 0)).toEqual(d.alarms);
  });

  it('turns an active unacknowledged Alarm into active acknowledged, by the current User, and logs it', () => {
    const r = ok(start(), { type: 'acknowledge', alarmIds: [unack?.id ?? ''] }, 20);
    const a = alarm(r.state, unack?.id ?? '');
    expect(a).toMatchObject({ state: 'active-acknowledged', acknowledgedAt: simulatedTime(20), acknowledgedBy: start().currentUserId });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ action: 'alarm-acknowledge', targetKind: 'alarm', target: unack?.id, oldValue: 'active-unacknowledged', newValue: 'active-acknowledged' });
    expect(r.state.events).toHaveLength(d.events.length + 1);
  });

  it('clears a returned to normal unacknowledged Alarm', () => {
    const r = ok(start(), { type: 'acknowledge', alarmIds: [returned?.id ?? ''] }, 30);
    expect(alarm(r.state, returned?.id ?? '')).toMatchObject({ state: 'cleared', clearedAt: simulatedTime(30), acknowledgedAt: simulatedTime(30) });
    expect(r.events[0]).toMatchObject({ oldValue: 'returned-unacknowledged', newValue: 'cleared' });
  });

  it('changes nothing, and logs nothing, for an Alarm that is already acknowledged or cleared', () => {
    for (const a of [acked, cleared]) {
      const r = ok(start(), { type: 'acknowledge', alarmIds: [a?.id ?? ''] }, 40);
      expect(r.events).toEqual([]);
      expect(alarm(r.state, a?.id ?? '')).toEqual(a);
    }
  });

  it('writes one entry for each Alarm that really changed when several are selected', () => {
    const ids = [unack?.id ?? '', returned?.id ?? '', acked?.id ?? '', cleared?.id ?? ''];
    const r = ok(start(), { type: 'acknowledge', alarmIds: ids }, 50);
    expect(r.events.map((e) => e.target).sort()).toEqual([unack?.id, returned?.id].sort());
  });

  it('refuses an Alarm that does not exist, and changes nothing', () => {
    const r = reduce(start(), { type: 'acknowledge', alarmIds: [unack?.id ?? '', 'AL-9999'] }, { tick: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown-alarm');
  });

  it('keeps a Line in Alarm while its Critical Alarm is only acknowledged', () => {
    const critical = d.alarms.find((a) => a.priority === 'critical' && a.state === 'active-unacknowledged');
    const r = ok(start(), { type: 'acknowledge', alarmIds: [critical?.id ?? ''] }, 10);
    expect(lineStatus(r.state, critical?.lineId ?? 'E1', 10).status).toBe('alarm');
  });
});

describe('Alarms follow the Simulator', () => {
  it('returns each open Alarm on a Tag when the Tag is back inside, and dates it at that tick', () => {
    const s = start();
    for (const a of d.alarms.filter((x) => (x.state === 'active-unacknowledged' || x.state === 'active-acknowledged') && x.tagId !== null)) {
      const now = alarmList(s, 1000).find(x => x.id === a.id);
      expect(now?.state).toBe(a.state === 'active-unacknowledged' ? 'returned-unacknowledged' : 'cleared');
      const dir = a.message.key === 'alarm.low-value' ? 'low' : 'high';
      const back = tagSeries(d, a.tagId as string, 1, 1000).find((p) => p.alarm !== dir)?.tick;
      expect(now?.returnedAt).toBe(simulatedTime(back ?? -1));
    }
  });

  it('returns open faults at their tick, and keeps a comms loss while its Machine is Offline', () => {
    const s = start();
    for (const r of returns(d, 0, 1000).filter(r => r.tagId === null)) expect(['returned-unacknowledged', 'cleared']).toContain(alarmList(s, 1000).find(a => a.id === r.alarmId)?.state);
    const comms = d.alarms.find((a) => a.message.key === 'alarm.comm-loss' && a.state !== 'cleared');
    expect(alarmList(s, 1000).find(a => a.id === comms?.id)?.state).toBe(comms?.state);
  });

  it('takes a Line out of Alarm when its Critical Alarm returns', () => {
    expect(lineStatus(start(), 'E1', 0).status).toBe('alarm');
    expect(lineStatus(start(), 'E1', 1000).status).toBe('running');
  });

  it('turns each raise of the Simulator into a new active unacknowledged Alarm, with stable transition ids', () => {
    const s = start();
    const fresh = alarmList(s, 3600).filter((a) => !d.alarms.some((x) => x.id === a.id));
    const list = raises(d, 0, 3600, start().overlay).filter((r) => r.lineId !== 'A2');
    expect(fresh.length).toBe(list.length);
    expect(fresh.length).toBeGreaterThan(0);
    fresh.forEach((a, i) => {
      expect(a.id).toBe(list[i]?.id);
      expect(['active-unacknowledged', 'returned-unacknowledged']).toContain(a.state);
      expect(a).toMatchObject({ raisedAt: list[i]?.time, tagId: list[i]?.tagId, priority: list[i]?.priority, lineId: list[i]?.lineId, message: list[i]?.message });
    });
  });

  it('gives the same Alarms for one query or many, including queries back in time', () => {
    const once = start(), many = start();
    const expected = alarmList(once, 3000);
    for (let tick = 250; tick <= 3000; tick += 250) alarmList(many, tick);
    expect(alarmList(many, 3000)).toEqual(expected);
    const before = alarmList(many, 500);
    alarmList(many, 2000);
    expect(alarmList(many, 500)).toEqual(before);
  });

  it('does not let an earlier action rewrite history', () => {
    const later = ok(start(), { type: 'set-user', userId: start().currentUserId }, 2000).state;
    const r = ok(later, { type: 'pause', lineId: 'E2' }, 500);
    expect(r.state.lastTick).toBe(2000);
    expect(alarmList(r.state, 1999)).toEqual(alarmList(later, 1999));
  });

  it('ignores raises on a Line that is stopped', () => {
    const list = raises(d, 0, 3600, start().overlay).filter((r) => r.lineId !== 'A2');
    const line = list[0]?.lineId ?? 'E2';
    const stopped = ok(start(), { type: 'pause', lineId: line }, 0).state;
    const s = stopped;
    expect(alarmList(s, 3600).filter((a) => !d.alarms.some((x) => x.id === a.id) && a.lineId === line)).toHaveLength(0);
    expect(alarmList(s, 3600).some((a) => !d.alarms.some((x) => x.id === a.id) && a.lineId !== line)).toBe(true);
  });

  it('lets a new Alarm be acknowledged and then cleared by its return', () => {
    const raise = raises(d, 0, 3600, start().overlay).find(r => r.lineId !== 'A2')!;
    expect(raise).toBeDefined();
    const s = start();
    const fresh = alarmList(s, raise.tick).find(a => a.tagId === raise.tagId && a.raisedAt === raise.time)!;
    expect(fresh).toBeDefined();
    expect(fresh.state).toBe('active-unacknowledged');
    const acked = ok(s, { type: 'acknowledge', alarmIds: [fresh.id] }, raise.tick + 1).state;
    expect(alarm(acked, fresh.id)?.state).toBe('active-acknowledged');
    expect(alarmList(acked, raise.tick + 1000).find(a => a.id === fresh.id)?.state).toBe('cleared');
  });

  it('writes no Event Log entry for what the Simulator does', () => {
    const state = start();
    alarmList(state, 3600);
    expect(state.events).toHaveLength(d.events.length);
  });

  it('lists Alarms at the action tick without an advance', () => {
    const viaPause = ok(start(), { type: 'pause', lineId: 'E2' }, 1000).state;
    expect(open(viaPause).filter((a) => a.tagId !== null && d.alarms.some((x) => x.id === a.id))).toHaveLength(0);
  });
});
