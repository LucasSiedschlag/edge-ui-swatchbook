import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { raises } from './alarms';
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
    for (const tick of [0, 300, 599]) {
      const s = simulate(d, tick);
      for (const a of open) expect(s.tags.find((r) => r.tagId === a.tagId)?.status).toBe(direction(a.message.key));
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
    let prev = simulate(d, 600).tags;
    for (let tick = 601; tick < 3600; tick++) {
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
    expect(s.lines.find((l) => l.lineId === 'A1')?.cycle).toEqual({ value: reading('A1-corner-weld.cycle-time'), takt: 120 });
    expect(s.lines.find((l) => l.lineId === 'A1')?.lineSpeed).toBeNull();
    expect(s.lines.find((l) => l.lineId === 'E1')?.cycle).toBeNull();
    expect(s.lines.find((l) => l.lineId === 'E1')?.lineSpeed).toEqual({ value: reading('E1-puller.puller-speed'), unit: 'm/min' });
  });
});
