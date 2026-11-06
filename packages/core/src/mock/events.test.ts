import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';
import { DAY, HOUR, NOW, shiftAt, spDate } from './time';

const d = generateMockDataset();
const tag = new Map(d.tags.map((t) => [t.id, t]));
const user = new Set(d.users.map((u) => u.id));
const lineIds = new Set<string>(d.lines.map((l) => l.id));
const versionIds = new Set(d.recipeVersions.map((v) => v.id));
const byAction = (x: string) => d.events.filter((e) => e.action === x);

describe('event log', () => {
  it('has a few hundred entries, ascending by time, inside the 90 days', () => {
    expect(d.events.length).toBeGreaterThanOrEqual(250);
    expect(d.events.length).toBeLessThanOrEqual(750);
    expect(new Set(d.events.map((e) => e.id)).size).toBe(d.events.length);
    for (let i = 1; i < d.events.length; i++) expect((d.events[i]?.at ?? 0) >= (d.events[i - 1]?.at ?? 0)).toBe(true);
    for (const e of d.events) {
      expect(e.at).toBeGreaterThanOrEqual(NOW - 90 * DAY);
      expect(e.at).toBeLessThanOrEqual(NOW);
      expect(user.has(e.userId)).toBe(true);
    }
  });

  it('covers every action a Screen can log, except reset-to-recipe', () => {
    for (const a of ['alarm-acknowledge', 'setpoint-override', 'pause', 'resume', 'emergency-stop', 'reset', 'shift-handover', 'recipe-new-draft', 'recipe-save', 'recipe-approve', 'recipe-discard']) {
      expect(byAction(a).length).toBeGreaterThan(0);
    }
  });

  it('has recent entries so short time ranges are not empty', () => {
    expect(d.events.filter((e) => e.at >= NOW - DAY).length).toBeGreaterThanOrEqual(5);
  });
});

describe('event targets', () => {
  it('names what each target is, and the target exists', () => {
    const alarmIds = new Set(d.alarms.map((a) => a.id));
    const shifts = new Set(d.shiftHistory.map((r) => `${r.date}/${r.shift}`));
    for (const e of d.events) {
      switch (e.targetKind) {
        case 'line': expect(lineIds.has(e.target)).toBe(true); break;
        case 'alarm': expect(alarmIds.has(e.target)).toBe(true); break;
        case 'tag': expect(tag.has(e.target)).toBe(true); break;
        case 'shift': expect(shifts.has(e.target)).toBe(true); break;
        case 'recipe-version': expect(e.target).toMatch(/^R\d+-[vd]\d+$/); break;
      }
    }
  });

  it('uses the kind that fits each action', () => {
    const kind: Record<string, string> = {
      'alarm-acknowledge': 'alarm', 'setpoint-override': 'tag', pause: 'line', resume: 'line', 'emergency-stop': 'line',
      reset: 'line', 'shift-handover': 'shift', 'recipe-new-draft': 'recipe-version', 'recipe-save': 'recipe-version',
      'recipe-approve': 'recipe-version', 'recipe-discard': 'recipe-version',
    };
    for (const e of d.events) expect(e.targetKind).toBe(kind[e.action]);
  });
});

describe('alarm acknowledgements', () => {
  it('logs one entry per acknowledged Alarm, at the same time and by the same User', () => {
    const acked = d.alarms.filter((a) => a.acknowledgedAt !== null);
    expect(byAction('alarm-acknowledge')).toHaveLength(acked.length);
    for (const a of acked) {
      const e = byAction('alarm-acknowledge').filter((x) => x.target === a.id);
      expect(e).toHaveLength(1);
      expect(e[0]?.at).toBe(a.acknowledgedAt);
      expect(e[0]?.userId).toBe(a.acknowledgedBy);
    }
  });

  it('records the real state change: active to acknowledged, or returned to cleared', () => {
    for (const a of d.alarms.filter((x) => x.acknowledgedAt !== null)) {
      const e = byAction('alarm-acknowledge').find((x) => x.target === a.id);
      const afterReturn = a.returnedAt !== null && a.returnedAt <= (a.acknowledgedAt ?? 0);
      expect(e?.oldValue).toBe(afterReturn ? 'returned-unacknowledged' : 'active-unacknowledged');
      expect(e?.newValue).toBe(afterReturn ? 'cleared' : 'active-acknowledged');
    }
  });
});

describe('line actions', () => {
  it('targets real Lines', () => {
    for (const a of ['pause', 'resume', 'emergency-stop', 'reset']) for (const e of byAction(a)) expect(lineIds.has(e.target)).toBe(true);
  });

  it('follows every Pause with a Resume, and every Emergency stop with a Reset then a Resume, on the same Line', () => {
    const after = (action: string, line: string, t: number) => byAction(action).find((e) => e.target === line && e.at > t);
    for (const p of byAction('pause')) expect(after('resume', p.target, p.at)).toBeDefined();
    for (const s of byAction('emergency-stop')) {
      const r = after('reset', s.target, s.at);
      expect(r).toBeDefined();
      expect(after('resume', s.target, r?.at ?? Infinity)).toBeDefined();
    }
  });
});

describe('pauses and stops happen between Batches', () => {
  const runs = [...d.batches.map((b) => ({ lineId: b.lineId, start: b.start, end: b.end })), ...d.activeBatches.map((b) => ({ lineId: b.lineId, start: b.start, end: NOW }))];
  const clear = (line: string, from: number, to: number) => runs.every((r) => r.lineId !== line || r.end <= from || r.start >= to);

  it('keeps every Pause to Resume window free of running Batches', () => {
    for (const p of byAction('pause')) {
      const r = byAction('resume').find((e) => e.target === p.target && e.at > p.at);
      expect(clear(p.target, p.at, r?.at ?? Infinity)).toBe(true);
    }
  });

  it('keeps every Emergency stop to Resume window free of running Batches', () => {
    for (const s of byAction('emergency-stop')) {
      const r = byAction('resume').find((e) => e.target === s.target && e.at > s.at);
      expect(clear(s.target, s.at, r?.at ?? Infinity)).toBe(true);
    }
  });
});

describe('setpoint overrides', () => {
  const overrides = byAction('setpoint-override');

  it('chains per Tag: each old value is the previous new value, and the last is the Tag setpoint', () => {
    expect(overrides.length).toBeGreaterThan(0);
    const byTag = new Map<string, typeof overrides>();
    for (const e of overrides) byTag.set(e.target, [...(byTag.get(e.target) ?? []), e]);
    for (const [id, list] of byTag) {
      for (let i = 1; i < list.length; i++) expect(list[i]?.oldValue).toBe(list[i - 1]?.newValue);
      expect(list[list.length - 1]?.newValue).toBe(tag.get(id)?.setpoint);
    }
  });

  it('never overrides a Tag of an Offline Machine', () => {
    const offline = new Set(d.machines.filter((m) => m.comms.status === 'offline').map((m) => m.id));
    for (const e of overrides) expect(offline.has(tag.get(e.target)?.machineId ?? '')).toBe(false);
  });

  it('stays inside Tag limits, on writable Tags, and leaves running-Line recipe Tags alone', () => {
    const running = new Set(d.activeBatches.map((b) => b.lineId));
    for (const e of overrides) {
      const t = tag.get(e.target);
      expect(t?.writable).toBe(true);
      expect(e.newValue as number).toBeGreaterThanOrEqual(t?.min ?? Infinity);
      expect(e.newValue as number).toBeLessThanOrEqual(t?.max ?? -Infinity);
      expect(e.newValue).not.toBe(e.oldValue);
      expect(t?.parameterKey !== null && running.has(t?.lineId as never)).toBe(false);
    }
  });
});

describe('notes', () => {
  it('gives every Setpoint Override a reason and every Shift handover a note, as translation keys', () => {
    for (const e of [...byAction('setpoint-override'), ...byAction('shift-handover')]) {
      expect(typeof e.note === 'object' && e.note !== null && typeof e.note.key === 'string').toBe(true);
    }
  });

  it('hands over at every Shift change, recorded on the Shift that ends, like a handover made in the session', () => {
    const h = byAction('shift-handover');
    expect(h.length).toBeGreaterThanOrEqual(250);
    expect(new Set(h.map((e) => `${e.oldValue}>${e.newValue}`))).toEqual(new Set(['S3>S1', 'S1>S2', 'S2>S3']));
    for (const e of h) {
      expect(e.target.endsWith(`/${e.oldValue}`)).toBe(true);
      expect(e.target).toBe(`${spDate(e.at - 8 * HOUR)}/${shiftAt(e.at - 8 * HOUR)}`);
    }
  });
});

describe('recipe actions', () => {
  const later = d.recipeVersions.filter((v) => v.number >= 2);
  const one = (action: string, target: string) => byAction(action).filter((e) => e.target === target);

  it('logs a new Draft and a save for every version after the first, at the version times', () => {
    expect(later.length).toBeGreaterThan(0);
    for (const v of later) {
      expect(one('recipe-new-draft', v.id)).toHaveLength(1);
      expect(one('recipe-new-draft', v.id)[0]?.at).toBe(v.createdAt);
      const save = one('recipe-save', v.id);
      expect(save).toHaveLength(1);
      expect(save[0]?.at).toBeGreaterThan(v.createdAt);
    }
  });

  it('logs the approval of every Approved version after the first, at its approval time', () => {
    for (const v of later.filter((x) => x.status === 'approved')) {
      const e = one('recipe-approve', v.id);
      expect(e).toHaveLength(1);
      expect(e[0]?.at).toBe(v.approvedAt);
      expect(e[0]?.oldValue).toBe('draft');
      expect(e[0]?.newValue).toBe('approved');
      expect(one('recipe-save', v.id)[0]?.at).toBeLessThan(v.approvedAt as number);
    }
    for (const v of later.filter((x) => x.status === 'draft')) expect(one('recipe-approve', v.id)).toHaveLength(0);
  });

  it('logs no recipe event for the first versions, which predate the window', () => {
    for (const v of d.recipeVersions.filter((x) => x.number === 1)) {
      for (const a of ['recipe-new-draft', 'recipe-save', 'recipe-approve']) expect(one(a, v.id)).toHaveLength(0);
    }
  });

  it('discards Drafts that no longer exist, each created first, under ids that never clash with real versions', () => {
    const discards = byAction('recipe-discard');
    expect(discards.length).toBeGreaterThan(0);
    expect(new Set(discards.map((e) => e.target)).size).toBe(discards.length);
    for (const e of discards) {
      expect(e.target).toMatch(/^R\d+-d\d+$/);
      expect(versionIds.has(e.target)).toBe(false);
      const made = one('recipe-new-draft', e.target);
      expect(made).toHaveLength(1);
      expect(made[0]?.at).toBeLessThan(e.at);
    }
  });
});
