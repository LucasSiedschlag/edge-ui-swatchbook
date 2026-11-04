import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { HOUR, NOW } from './time';

const d = generateMockDataset();
const machine = new Map(d.machines.map((m) => [m.id, m]));
const tag = new Map(d.tags.map((t) => [t.id, t]));
const batch = new Map([...d.batches, ...d.activeBatches].map((b) => [b.id, { lineId: b.lineId, start: b.start, end: 'end' in b ? b.end : b.plannedEnd }]));
const user = new Set(d.users.map((u) => u.id));
const state = (s: string) => d.alarms.filter((a) => a.state === s);

describe('alarms', () => {
  it('has 150 to 250 Alarms with unique ids', () => {
    expect(d.alarms.length).toBeGreaterThanOrEqual(150);
    expect(d.alarms.length).toBeLessThanOrEqual(250);
    expect(new Set(d.alarms.map((a) => a.id)).size).toBe(d.alarms.length);
  });

  it('has all four states and all four priorities', () => {
    for (const s of ['active-unacknowledged', 'active-acknowledged', 'returned-unacknowledged', 'cleared']) {
      expect(state(s).length).toBeGreaterThan(0);
    }
    expect(new Set(d.alarms.map((a) => a.priority))).toEqual(new Set(['critical', 'high', 'medium', 'low']));
  });

  it('has an active unacknowledged Critical Alarm', () => {
    expect(state('active-unacknowledged').some((a) => a.priority === 'critical')).toBe(true);
  });

  it('links every Alarm to a real Machine, Line, Tag and Batch', () => {
    for (const a of d.alarms) {
      expect(machine.get(a.machineId)?.lineId).toBe(a.lineId);
      if (a.tagId) expect(tag.get(a.tagId)?.machineId).toBe(a.machineId);
      if (a.batchId) {
        const b = batch.get(a.batchId);
        expect(b?.lineId).toBe(a.lineId);
        expect(a.raisedAt).toBeGreaterThanOrEqual(b?.start ?? Infinity);
        expect(a.raisedAt).toBeLessThan(b?.end ?? 0);
      }
    }
    expect(d.alarms.some((a) => a.batchId !== null)).toBe(true);
  });

  it('keeps timestamps and acknowledgement fields consistent with the state', () => {
    for (const a of d.alarms) {
      expect(a.raisedAt).toBeLessThanOrEqual(NOW);
      const acked = a.acknowledgedAt !== null;
      expect(acked).toBe(a.acknowledgedBy !== null);
      if (a.acknowledgedBy) expect(user.has(a.acknowledgedBy)).toBe(true);
      if (a.acknowledgedAt) expect(a.acknowledgedAt).toBeGreaterThanOrEqual(a.raisedAt);
      if (a.returnedAt) expect(a.returnedAt).toBeGreaterThanOrEqual(a.raisedAt);
      switch (a.state) {
        case 'active-unacknowledged': expect([acked, a.returnedAt, a.clearedAt]).toEqual([false, null, null]); break;
        case 'active-acknowledged': expect([acked, a.returnedAt, a.clearedAt]).toEqual([true, null, null]); break;
        case 'returned-unacknowledged': expect(acked).toBe(false); expect(a.returnedAt).not.toBeNull(); expect(a.clearedAt).toBeNull(); break;
        case 'cleared':
          expect(a.returnedAt).not.toBeNull();
          expect(a.clearedAt).toBeGreaterThanOrEqual(Math.max(a.returnedAt ?? 0, a.acknowledgedAt ?? 0));
          break;
      }
    }
  });

  it('keeps open Alarms recent', () => {
    for (const a of d.alarms.filter((x) => x.state !== 'cleared')) expect(a.raisedAt).toBeGreaterThanOrEqual(NOW - 12 * HOUR);
  });

  it('has an active comms Alarm on the Offline Machine, raised just after its last heartbeat', () => {
    const off = d.machines.find((m) => m.comms.status === 'offline');
    const a = d.alarms.find((x) => x.machineId === off?.id && x.state !== 'cleared');
    expect(a).toBeDefined();
    expect(a?.message.key).toBe('alarm.comm-loss');
    const lag = (a?.raisedAt ?? 0) - (off?.comms.lastHeartbeatAt ?? 0);
    expect(lag).toBeGreaterThanOrEqual(0);
    expect(lag).toBeLessThanOrEqual(5 * 60_000);
  });

  it('links an open Alarm raised during a running Batch to that Batch', () => {
    const open = d.alarms.filter((a) => a.state !== 'cleared');
    expect(open.some((a) => d.activeBatches.some((b) => b.id === a.batchId))).toBe(true);
    for (const a of open) {
      const running = d.activeBatches.find((b) => b.lineId === a.lineId && b.start <= a.raisedAt);
      if (running) expect(a.batchId).toBe(running.id);
    }
  });

  it('pairs each message with a fitting Tag', () => {
    for (const a of d.alarms) {
      const t = a.tagId ? tag.get(a.tagId) : undefined;
      if (a.message.key === 'alarm.motor-overload') expect(t?.name).toBe('motor-current');
      if (a.message.key === 'alarm.high-value' || a.message.key === 'alarm.low-value') {
        expect(t).toBeDefined();
        expect(['pcs', 'h']).not.toContain(t?.unit);
      }
      if (a.message.key === 'alarm.fault' || a.message.key === 'alarm.comm-loss') expect(a.tagId).toBeNull();
    }
  });
});
