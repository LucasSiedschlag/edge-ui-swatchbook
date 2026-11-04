import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { NOW } from './time';

/** The default seed is not special. These invariants hold for any seed. */
describe.each([1, 2, 3, 20260101])('invariants for seed %i', (seed) => {
  const d = generateMockDataset(seed);

  it('is deterministic', () => {
    expect(JSON.stringify(generateMockDataset(seed))).toBe(JSON.stringify(d));
  });

  it('never overlaps two Batches on a Line, and runs the active one after the last finished one', () => {
    const last = new Map<string, number>();
    for (const b of d.batches) {
      expect(b.start).toBeGreaterThanOrEqual(last.get(b.lineId) ?? 0);
      last.set(b.lineId, b.end);
    }
    for (const a of d.activeBatches) expect(a.start).toBeGreaterThanOrEqual(last.get(a.lineId) ?? 0);
  });

  it('only uses Recipe Versions approved before the Batch started', () => {
    const v = new Map(d.recipeVersions.map((x) => [x.id, x]));
    for (const b of [...d.batches, ...d.activeBatches]) expect(v.get(b.recipeVersionId)?.approvedAt as number).toBeLessThanOrEqual(b.start);
  });

  it('keeps the Event Log ascending and inside NOW', () => {
    for (let i = 1; i < d.events.length; i++) expect((d.events[i]?.at ?? 0) >= (d.events[i - 1]?.at ?? 0)).toBe(true);
    for (const e of d.events) expect(e.at).toBeLessThanOrEqual(NOW);
  });

  it('follows every Pause and Emergency stop with a Resume on the same Line, with no overlapping pairs', () => {
    const resumes = d.events.filter((e) => e.action === 'resume');
    const starts = d.events.filter((e) => e.action === 'pause' || e.action === 'emergency-stop');
    expect(resumes.length).toBe(starts.length);
    for (const s of starts) expect(resumes.some((r) => r.target === s.target && r.at > s.at)).toBe(true);
    for (const line of new Set(starts.map((s) => s.target))) {
      const seq = d.events.filter((e) => e.target === line && ['pause', 'emergency-stop', 'reset', 'resume'].includes(e.action)).map((e) => e.action);
      let open = false;
      for (const a of seq) {
        if (a === 'pause' || a === 'emergency-stop') { expect(open).toBe(false); open = true; }
        if (a === 'resume') { expect(open).toBe(true); open = false; }
      }
      expect(open).toBe(false);
    }
  });

  it('discards unique Drafts and never overrides a Tag of an Offline Machine', () => {
    const discards = d.events.filter((e) => e.action === 'recipe-discard').map((e) => e.target);
    expect(new Set(discards).size).toBe(discards.length);
    const offline = new Set(d.machines.filter((m) => m.comms.status === 'offline').map((m) => m.id));
    const tag = new Map(d.tags.map((t) => [t.id, t]));
    for (const e of d.events.filter((x) => x.action === 'setpoint-override')) expect(offline.has(tag.get(e.target)?.machineId ?? '')).toBe(false);
  });

  it('chains Setpoint Overrides to the final Tag setpoints', () => {
    const tag = new Map(d.tags.map((t) => [t.id, t]));
    const last = new Map<string, number>();
    for (const e of d.events.filter((x) => x.action === 'setpoint-override')) {
      if (last.has(e.target)) expect(e.oldValue).toBe(last.get(e.target));
      last.set(e.target, e.newValue as number);
    }
    for (const [id, v] of last) expect(tag.get(id)?.setpoint).toBe(v);
  });
});
