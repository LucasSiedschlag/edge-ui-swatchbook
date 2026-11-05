import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises, returns } from './alarms';
import { tagSeries } from './series';
import { snapshotDigest } from './digest';
import { simulate } from './simulate';

const d = generateMockDataset();
const tagOf = new Map(d.tags.map((t) => [t.id, t]));

describe('simulate: determinism', () => {
  it('gives the same values for the same tick, whatever was simulated before', () => {
    const fresh = JSON.stringify(simulate(d, 5));
    simulate(d, 100);
    simulate(d, 3);
    expect(JSON.stringify(simulate(d, 5))).toBe(fresh);
  });

  it('gives the same values for the same tick on a regenerated dataset', () => {
    expect(JSON.stringify(simulate(generateMockDataset(), 42))).toBe(JSON.stringify(simulate(d, 42)));
  });
});

describe('simulate: tag readings', () => {
  const s = simulate(d, 10);

  it('reads every Tag once, in dataset order', () => {
    expect(s.tags.map((r) => r.tagId)).toEqual(d.tags.map((t) => t.id));
  });

  it('keeps values finite and close to the setpoint when nothing is wrong', () => {
    for (const r of s.tags.filter((x) => x.status === 'normal')) {
      const t = tagOf.get(r.tagId);
      expect(Number.isFinite(r.value)).toBe(true);
      expect(Math.abs(r.value - (t?.setpoint ?? 0))).toBeLessThanOrEqual(((t?.max ?? 0) - (t?.min ?? 0)) * 0.03);
    }
  });

  it('sets the status from the limits: High above max, Low below min, otherwise Normal', () => {
    for (let tick = 0; tick < 300; tick += 7) {
      for (const r of simulate(d, tick).tags.filter((x) => x.status !== 'stale')) {
        const t = tagOf.get(r.tagId);
        const expected = r.value > (t?.max ?? 0) ? 'high' : r.value < (t?.min ?? 0) ? 'low' : 'normal';
        expect(r.status).toBe(expected);
      }
    }
  });

  it('moves values from tick to tick', () => {
    const a = simulate(d, 0).tags;
    const b = simulate(d, 60).tags;
    expect(a.filter((r, i) => r.value !== b[i]?.value).length).toBeGreaterThan(100);
  });
});

describe('simulate: machine links and Stale Tags', () => {
  const offline = d.machines.find((m) => m.comms.status === 'offline');
  const degraded = d.machines.filter((m) => m.comms.status === 'degraded');

  it('reports every Machine once, with its link status from the dataset', () => {
    const s = simulate(d, 30);
    expect(s.machines.map((m) => m.machineId)).toEqual(d.machines.map((m) => m.id));
    for (const m of s.machines) expect(m.status).toBe(d.machines.find((x) => x.id === m.machineId)?.comms.status);
  });

  it('keeps the Offline Machine offline at its last heartbeat, whatever the tick', () => {
    for (const tick of [0, 100, 5000]) {
      const m = simulate(d, tick).machines.find((x) => x.machineId === offline?.id);
      expect(m?.status).toBe('offline');
      expect(m?.lastSeenAt).toBe(offline?.comms.lastHeartbeatAt);
    }
  });

  it('keeps online Machines heartbeating with low latency, and degraded ones slow and lossy', () => {
    const s = simulate(d, 200);
    for (const m of s.machines.filter((x) => x.status === 'online')) {
      expect(m.latencyMs).toBeGreaterThanOrEqual(1);
      expect(m.latencyMs).toBeLessThanOrEqual(30);
      expect(m.packetLossPct).toBeLessThan(1);
      expect(s.time - m.lastSeenAt).toBeLessThanOrEqual(2000);
    }
    for (const m of s.machines.filter((x) => degraded.some((g) => g.id === x.machineId))) {
      expect(m.latencyMs).toBeGreaterThanOrEqual(100);
      expect(m.packetLossPct).toBeGreaterThanOrEqual(1);
      expect(s.time - m.lastSeenAt).toBeLessThanOrEqual(30_000);
    }
  });

  it('varies link numbers over time', () => {
    const a = simulate(d, 0).machines;
    const b = simulate(d, 90).machines;
    expect(a.filter((m, i) => m.latencyMs !== b[i]?.latencyMs).length).toBeGreaterThan(5);
  });

  it('shows Tags of the Offline Machine as Stale, frozen at one value', () => {
    const own = d.tags.filter((t) => t.machineId === offline?.id).map((t) => t.id);
    expect(own.length).toBeGreaterThan(0);
    const a = simulate(d, 0).tags.filter((r) => own.includes(r.tagId));
    const b = simulate(d, 777).tags.filter((r) => own.includes(r.tagId));
    for (const r of a) expect(r.status).toBe('stale');
    expect(b.map((r) => [r.status, r.value])).toEqual(a.map((r) => [r.status, r.value]));
  });

  it('never marks Tags of other Machines Stale', () => {
    const others = simulate(d, 50).tags.filter((r) => tagOf.get(r.tagId)?.machineId !== offline?.id);
    expect(others.some((r) => r.status === 'stale')).toBe(false);
  });
});

describe('simulate: Alarms follow the Tags', () => {
  const direction = (key: string) => (key === 'alarm.low-value' ? 'low' : 'high');
  const open = d.alarms.filter((a) => (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged') && a.tagId !== null);

  it('starts every active Alarm with its Tag out of limits in the matching direction', () => {
    expect(open.length).toBeGreaterThan(0);
    for (const tick of [0, 150, 299]) {
      const s = simulate(d, tick);
      for (const a of open) expect(s.tags.find((r) => r.tagId === a.tagId)?.status).toBe(direction(a.message.key));
    }
  });

  it('reports only the faults without a Tag as returning, each at its own tick, and never a comms loss', () => {
    const list = returns(d, -1, 2000);
    const faults = d.alarms.filter((a) => (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged') && a.tagId === null && a.message.key !== 'alarm.comm-loss');
    expect(faults.length).toBeGreaterThan(0);
    expect(list.map((r) => r.alarmId).sort()).toEqual(faults.map((a) => a.id).sort());
    for (const r of list) {
      expect(r.tagId).toBeNull();
      expect(r.tick).toBeGreaterThanOrEqual(300);
      expect(r.tick).toBeLessThan(900);
    }
  });

  it('returns the Tag of each open Alarm to normal at its own tick, which shows in its alarm state', () => {
    const ticks = open.map((a) => Math.min(...[...Array(900).keys()].filter((t) => simulate(d, t).tags.find((r) => r.tagId === a.tagId)?.alarm === null)));
    expect(new Set(ticks).size).toBeGreaterThan(1);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(300);
      expect(t).toBeLessThan(900);
    }
  });

  it('starts Tags of returned and cleared Alarms within limits', () => {
    const s = simulate(d, 0);
    for (const a of d.alarms.filter((x) => x.state === 'returned-unacknowledged' && x.tagId !== null)) {
      expect(s.tags.find((r) => r.tagId === a.tagId)?.status).toBe('normal');
    }
  });

  it('lets other Tags drift out of limits now and then, then come back', () => {
    const seen = new Map<string, number>();
    let prev = simulate(d, 900).tags;
    for (let tick = 901; tick < 3600; tick++) {
      const cur = simulate(d, tick).tags;
      cur.forEach((r, i) => {
        if ((r.status === 'high' || r.status === 'low') && prev[i]?.status === 'normal') seen.set(r.tagId, (seen.get(r.tagId) ?? 0) + 1);
      });
      prev = cur;
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(seen.size).toBeLessThanOrEqual(60);
    const last = simulate(d, 3599).tags;
    expect(last.filter((r) => r.status === 'high' || r.status === 'low').length).toBeLessThan(10);
  });
});

describe('raises', () => {
  it('lists each Tag that crosses out of limits, at the tick it crosses', () => {
    const list = raises(d, 0, 3600);
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.length).toBeLessThanOrEqual(60);
    for (const r of list) {
      expect(simulate(d, r.tick).tags.find((x) => x.tagId === r.tagId)?.status).toBe(r.direction);
      expect(simulate(d, r.tick - 1).tags.find((x) => x.tagId === r.tagId)?.status).toBe('normal');
      expect(['critical', 'high', 'medium', 'low']).toContain(r.priority);
      expect(r.message.key).toMatch(/^alarm\./);
      expect(tagOf.get(r.tagId)?.machineId).toBe(r.machineId);
    }
  });

  it('gives the same list for the same range, and splits cleanly across ranges', () => {
    expect(JSON.stringify(raises(d, 0, 1800))).toBe(JSON.stringify(raises(d, 0, 1800)));
    expect(JSON.stringify([...raises(d, 0, 900), ...raises(d, 900, 1800)])).toBe(JSON.stringify(raises(d, 0, 1800)));
  });

  it('names the Batch running on the Line when it raises', () => {
    for (const r of raises(d, 0, 3600)) expect(r.batchId).toBe(d.activeBatches.find((b) => b.lineId === r.lineId)?.id ?? null);
  });

  it('does not raise for Tags of the Offline Machine, or counters', () => {
    const offline = d.machines.find((m) => m.comms.status === 'offline')?.id;
    for (const r of raises(d, 0, 7200)) {
      expect(r.machineId).not.toBe(offline);
      expect(['pcs', 'h']).not.toContain(tagOf.get(r.tagId)?.unit);
    }
  });
});

describe('simulate: Lines, Batch progress and KPIs', () => {
  const idle = 'C1';
  const live = (tick: number, line: string) => simulate(d, tick).lines.find((l) => l.lineId === line);
  const running = d.activeBatches;

  it('reports every Line once, in dataset order, and the current Shift', () => {
    const s = simulate(d, 0);
    expect(s.lines.map((l) => l.lineId)).toEqual(d.lines.map((l) => l.id));
    expect(s.shift).toMatchObject({ shift: 'S1', remainingMs: 8 * 3_600_000 });
    expect(simulate(d, 8 * 3600).shift.shift).toBe('S2');
  });

  it('shows no Batch and zero output on the idle Line', () => {
    const l = live(100, idle);
    expect(l?.batch).toBeNull();
    expect(l?.outputThisShift).toBe(0);
    expect(l?.scrapThisShift).toBe(0);
    expect(l?.oee).toBe(0);
  });

  it('starts each running Batch where the dataset left it, and never passes its target', () => {
    for (const b of running) {
      expect(live(0, b.lineId)?.batch).toMatchObject({ batchId: b.id, producedUnits: b.producedUnits, targetUnits: b.targetUnits });
      let last = b.producedUnits;
      for (const tick of [60, 600, 1800, 7200, 20000]) {
        const produced = live(tick, b.lineId)?.batch?.producedUnits ?? -1;
        expect(produced).toBeGreaterThanOrEqual(last);
        expect(produced).toBeLessThanOrEqual(b.targetUnits);
        last = produced;
      }
    }
  });

  it('stays at 100 percent after the planned end, with the Batch still reported', () => {
    for (const b of running) {
      const l = live(20 * 3600, b.lineId);
      expect(l?.batch?.producedUnits).toBe(b.targetUnits);
      expect(l?.batch?.percent).toBe(100);
    }
  });

  it('gives the percentage as produced over target', () => {
    for (const b of running) {
      const x = live(900, b.lineId)?.batch;
      expect(x?.percent).toBe(Math.round(((x?.producedUnits ?? 0) / (x?.targetUnits ?? 1)) * 1000) / 10);
    }
  });

  it('counts output this Shift from zero at the Shift start, growing then resetting at the next Shift', () => {
    const e1 = (tick: number) => live(tick, 'E1')?.outputThisShift ?? -1;
    expect(e1(0)).toBe(0);
    expect(e1(1800)).toBeGreaterThan(0);
    expect(e1(1800)).toBeGreaterThanOrEqual(e1(900));
    expect(e1(8 * 3600 - 1)).toBeGreaterThan(0);
    expect(e1(8 * 3600)).toBe(0);
  });

  it('keeps scrap within output', () => {
    for (const tick of [0, 900, 3600]) for (const l of simulate(d, tick).lines) expect(l.scrapThisShift).toBeLessThanOrEqual(l.outputThisShift);
  });

  it('makes OEE the product of Availability, Performance and Quality', () => {
    for (const l of simulate(d, 1200).lines.filter((x) => x.lineId !== idle)) {
      for (const p of [l.availability, l.performance, l.quality]) {
        expect(p).toBeGreaterThan(0.3);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(l.oee - l.availability * l.performance * l.quality)).toBeLessThanOrEqual(0.002);
    }
  });

  it('moves OEE a little from tick to tick', () => {
    const a = simulate(d, 0).lines.map((l) => l.oee);
    const b = simulate(d, 400).lines.map((l) => l.oee);
    expect(a.filter((v, i) => v !== b[i]).length).toBeGreaterThan(3);
  });

  it('reads cycle time against the 120 s takt on Assembly Lines, and line speed on the others', () => {
    const s = simulate(d, 77);
    const reading = (id: string) => s.tags.find((t) => t.tagId === id)?.value;
    expect(s.lines.find((l) => l.lineId === 'A1')?.cycle).toEqual({ value: reading('A1-corner-weld.cycle-time'), takt: 120, stale: false });
    expect(s.lines.find((l) => l.lineId === 'A1')?.lineSpeed).toBeNull();
    expect(s.lines.find((l) => l.lineId === 'E1')?.cycle).toBeNull();
    expect(s.lines.find((l) => l.lineId === 'E1')?.lineSpeed).toEqual({ value: reading('E1-puller.puller-speed'), unit: 'm/min', stale: false });
  });
});


describe('tagSeries: history before load', () => {
  const NOW_TICK = 0;
  const raisedTick = (a: { raisedAt: number }) => Math.ceil((a.raisedAt - d.now) / 1000);
  const statusOfAt = (tagId: string, tick: number) => tagSeries(d, tagId, tick, tick)[0]?.status;
  const open = d.alarms.filter((a) => (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged') && a.tagId !== null);
  const returned = d.alarms.filter((a) => a.state === 'returned-unacknowledged' && a.tagId !== null);

  it('returns one point per step, and matches simulate from tick 0 on', () => {
    const tag = d.tags[40]?.id ?? '';
    const s = tagSeries(d, tag, -10, 10, 5);
    expect(s.map((p) => p.tick)).toEqual([-10, -5, 0, 5, 10]);
    for (const p of s.filter((x) => x.tick >= 0)) {
      expect(p).toMatchObject(simulate(d, p.tick).tags.find((r) => r.tagId === tag) ?? {});
    }
  });

  it('holds the Tag of an open Alarm in limits until the Alarm was raised, then out of limits', () => {
    for (const a of open) {
      const r = raisedTick(a);
      const want = a.message.key === 'alarm.low-value' ? 'low' : 'high';
      if (r > -7200) expect(statusOfAt(a.tagId as string, r - 1)).toBe('normal');
      expect(statusOfAt(a.tagId as string, r)).toBe(want);
      expect(statusOfAt(a.tagId as string, NOW_TICK - 1)).toBe(want);
    }
  });

  it('shows a returned Alarm out of limits only between raised and returned', () => {
    expect(returned.length).toBeGreaterThan(0);
    for (const a of returned) {
      const r = raisedTick(a);
      const back = Math.ceil(((a.returnedAt as number) - d.now) / 1000);
      const want = a.message.key === 'alarm.low-value' ? 'low' : 'high';
      expect(statusOfAt(a.tagId as string, r)).toBe(want);
      expect(statusOfAt(a.tagId as string, back - 1)).toBe(want);
      expect(statusOfAt(a.tagId as string, back)).toBe('normal');
    }
  });

  it('keeps every other Tag within limits in the 2 hours before load', () => {
    const withAlarm = new Set([...open, ...returned].map((a) => a.tagId));
    const offline = new Set(d.machines.filter((m) => m.comms.status === 'offline').map((m) => m.id));
    for (const t of d.tags.filter((x) => !withAlarm.has(x.id) && !offline.has(x.machineId))) {
      for (const p of tagSeries(d, t.id, -7200, -1, 30)) expect(p.status).toBe('normal');
    }
  });

  it('turns Tags of the Offline Machine Stale at the last heartbeat, frozen at the value they had then', () => {
    const off = d.machines.find((m) => m.comms.status === 'offline');
    const hb = Math.ceil(((off?.comms.lastHeartbeatAt ?? 0) - d.now) / 1000);
    const tag = d.tags.find((t) => t.machineId === off?.id)?.id ?? '';
    const s = tagSeries(d, tag, hb - 3, hb + 600, 1);
    for (const p of s.filter((x) => x.tick < hb)) expect(p.status).not.toBe('stale');
    const stale = s.filter((x) => x.tick >= hb);
    expect(stale.every((p) => p.status === 'stale')).toBe(true);
    expect(new Set(stale.map((p) => p.value)).size).toBe(1);
  });

  it('is deterministic and cheap for a 2 hour window', () => {
    const tag = d.tags[10]?.id ?? '';
    expect(JSON.stringify(tagSeries(d, tag, -7200, 0, 1))).toBe(JSON.stringify(tagSeries(d, tag, -7200, 0, 1)));
    expect(tagSeries(d, tag, -7200, 0, 1)).toHaveLength(7201);
  });

  it('rejects non-integer ticks', () => {
    expect(() => simulate(d, 1.5)).toThrow();
    expect(() => tagSeries(d, d.tags[0]?.id ?? '', 0.5, 3)).toThrow();
  });
});


describe('simulate: starts where the dataset left off', () => {
  it('begins each link at the latency and packet loss in the Mock Dataset', () => {
    const s = simulate(d, 0);
    for (const m of s.machines.filter((x) => x.status !== 'offline')) {
      const c = d.machines.find((x) => x.id === m.machineId)?.comms;
      expect(m.latencyMs).toBe(c?.latencyMs);
      expect(m.packetLossPct).toBe(c?.packetLossPct);
    }
  });

  it('marks a frozen cycle time or line speed as stale', () => {
    for (const tick of [0, 500]) {
      const s = simulate(d, tick);
      const stale = (id: string) => s.tags.find((r) => r.tagId === id)?.status === 'stale';
      for (const l of s.lines) {
        if (l.cycle) expect(l.cycle.stale).toBe(stale(`${l.lineId}-corner-weld.cycle-time`));
      }
      expect(s.lines.some((l) => l.cycle !== null)).toBe(true);
    }
  });

  it('shows the idle Line at zero speed', () => {
    expect(simulate(d, 300).lines.find((l) => l.lineId === 'C1')?.lineSpeed).toMatchObject({ value: 0, unit: 'mm/min' });
  });
});

describe('snapshotDigest', () => {
  it('is the same for separate datasets, and changes with the ticks asked for', () => {
    const ticks = [0, 1, 600, 3600];
    expect(snapshotDigest(d, ticks)).toBe(snapshotDigest(generateMockDataset(), ticks));
    expect(snapshotDigest(d, ticks)).not.toBe(snapshotDigest(d, [0, 1, 600, 3601]));
  });

  // Playwright (Issue 8) compares this value across Chromium, Firefox and WebKit. Update it only when the Simulator changes on purpose.
  it('is stable for the default dataset', () => {
    expect(snapshotDigest(d, [-7200, -1, 0, 1, 59, 600, 3600, 28_800, 86_400])).toBe('affe77b0');
  });
});


describe('simulate: smaller edges', () => {
  it('never moves a last-seen time backward', () => {
    let prev = simulate(d, 0).machines;
    for (let tick = 1; tick <= 400; tick++) {
      const cur = simulate(d, tick).machines;
      cur.forEach((m, i) => expect(m.lastSeenAt).toBeGreaterThanOrEqual(prev[i]?.lastSeenAt ?? 0));
      prev = cur;
    }
  });

  it('never reports a last-seen time earlier than the dataset heartbeat, or later than now', () => {
    for (const tick of [0, 1, 2, 30]) {
      const s = simulate(d, tick);
      for (const m of s.machines.filter((x) => x.status !== 'offline')) {
        expect(m.lastSeenAt).toBeGreaterThanOrEqual(d.machines.find((x) => x.id === m.machineId)?.comms.lastHeartbeatAt ?? 0);
        expect(m.lastSeenAt).toBeLessThanOrEqual(s.time);
      }
    }
  });

  it('exports what Plant State and the Screens need from the package entry', async () => {
    const core = await import('../index');
    for (const name of ['simulate', 'raises', 'returns', 'tagSeries', 'setpointAt', 'snapshotDigest', 'tickAt', 'simulatedTime', 'shiftInfo']) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
