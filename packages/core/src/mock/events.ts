import type { MessageKey } from '../i18n/messages';
import type { Rng } from './prng';
import { DAY, HISTORY_DAYS, HOUR, MINUTE, NOW, shiftAt, spDate } from './time';
import type {
  ActiveBatch, Alarm, Batch, EventAction, EventLogEntry, EventTargetKind, LineId, Machine, Recipe, RecipeVersion, Tag, TextRef, User,
} from './types';

const WINDOW_START = NOW - HISTORY_DAYS * DAY;
/** A gap between two Batches must be at least this long to hold a Pause or an Emergency stop. */
const MIN_GAP = 30 * MINUTE;

type Draft = Omit<EventLogEntry, 'id'>;
interface Gap { lineId: LineId; start: number; end: number }

export interface EventSection {
  events: EventLogEntry[];
  /** Tags with their setpoint after every seeded Setpoint Override. */
  tags: Tag[];
}

const OVERRIDE_REASONS = ['note.override-reason.quality-adjust', 'note.override-reason.material-change', 'note.override-reason.trial', 'note.override-reason.compensation'] as const satisfies readonly MessageKey[];
const HANDOVER_NOTES = ['note.handover.all-normal', 'note.handover.watch-alarm', 'note.handover.material-low', 'note.handover.maintenance-planned'] as const satisfies readonly MessageKey[];

/** Idle stretches between two finished Batches on the same Line. */
function gapsOf(batches: Batch[]): Gap[] {
  const byLine = new Map<LineId, Batch[]>();
  for (const b of batches) byLine.set(b.lineId, [...(byLine.get(b.lineId) ?? []), b]);
  const gaps: Gap[] = [];
  for (const [lineId, list] of byLine) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const start = (sorted[i - 1] as Batch).end;
      const end = (sorted[i] as Batch).start;
      if (end - start >= MIN_GAP) gaps.push({ lineId, start, end });
    }
  }
  return gaps;
}

export function generateEvents(
  rng: Rng,
  users: User[],
  alarms: Alarm[],
  tags: Tag[],
  recipes: Recipe[],
  versions: RecipeVersion[],
  active: ActiveBatch[],
  batches: Batch[],
  machines: Machine[],
): EventSection {
  const out: Draft[] = [];
  const ofRole = (role: User['role']) => users.filter((u) => u.role === role);
  const operators = ofRole('operator');
  const engineers = ofRole('engineer');
  const technicians = ofRole('technician');
  const between = (from: number, to: number) => rng.int(from, to);
  const add = (
    action: EventAction, targetKind: EventTargetKind, userId: string, target: string, at: number,
    oldValue: Draft['oldValue'] = null, newValue: Draft['newValue'] = null, note: TextRef | null = null,
  ) => out.push({ at, userId, action, targetKind, target, oldValue, newValue, note });

  // Acknowledgements, taken from the Alarms so both always agree.
  for (const a of alarms) {
    if (a.acknowledgedAt === null || a.acknowledgedBy === null) continue;
    const afterReturn = a.returnedAt !== null && a.returnedAt <= a.acknowledgedAt;
    add('alarm-acknowledge', 'alarm', a.acknowledgedBy, a.id, a.acknowledgedAt, afterReturn ? 'returned-unacknowledged' : 'active-unacknowledged', afterReturn ? 'cleared' : 'active-acknowledged');
  }

  // A handover at every Shift change inside the window, recorded on the Shift that ends, as a handover made in the session is.
  for (let k = 1; k < HISTORY_DAYS * 3; k++) {
    const at = WINDOW_START + k * 8 * HOUR;
    add('shift-handover', 'shift', rng.pick(operators).id, `${spDate(at - 8 * HOUR)}/${shiftAt(at - 8 * HOUR)}`, at, shiftAt(at - 1), shiftAt(at), { key: rng.pick(HANDOVER_NOTES) });
  }

  // Pauses and Emergency stops sit inside gaps between Batches, never on top of a run, and always end with the Line running again.
  const allGaps = gapsOf(batches);
  const takeGap = (pool: Gap[]): Gap | undefined => {
    if (pool.length === 0) return undefined;
    const g = pool.splice(rng.int(0, pool.length - 1), 1)[0] as Gap;
    allGaps.splice(allGaps.indexOf(g), 1);
    return g;
  };
  const recentPool = allGaps.filter((g) => g.start >= NOW - 20 * HOUR);
  const pauseResume = (g: Gap | undefined) => {
    if (!g) return;
    const user = rng.pick(operators).id;
    const len = Math.floor((g.end - g.start) / MINUTE);
    const at = g.start + between(0, len - 20) * MINUTE;
    add('pause', 'line', user, g.lineId, at);
    add('resume', 'line', user, g.lineId, at + between(5, 15) * MINUTE);
  };
  for (let i = 0; i < 6; i++) pauseResume(takeGap(recentPool));
  for (let i = 0; i < 12; i++) pauseResume(takeGap(allGaps));
  for (let i = 0; i < 3; i++) {
    const g = takeGap(allGaps);
    if (!g) break;
    const user = rng.pick(operators).id;
    const len = Math.floor((g.end - g.start) / MINUTE);
    const at = g.start + between(0, len - 25) * MINUTE;
    const resetAt = at + between(5, 10) * MINUTE;
    add('emergency-stop', 'line', user, g.lineId, at);
    add('reset', 'line', user, g.lineId, resetAt);
    add('resume', 'line', user, g.lineId, resetAt + between(1, 5) * MINUTE);
  }

  // Setpoint Overrides, chained per Tag. Recipe-linked Tags on running Lines are left alone so they still match their Recipe
  // Version, and Tags of an Offline Machine are Stale, so they cannot be overridden.
  const running = new Set(active.map((b) => b.lineId));
  const offline = new Set(machines.filter((m) => m.comms.status === 'offline').map((m) => m.id));
  const candidates = tags.filter((t) => t.writable && !offline.has(t.machineId) && !(t.parameterKey !== null && running.has(t.lineId)));
  const current = new Map<string, number>();
  const times = Array.from({ length: 40 }, () => between(WINDOW_START, NOW - 1)).sort((a, b) => a - b);
  for (const at of times) {
    const t = rng.pick(candidates);
    const old = current.get(t.id) ?? t.setpoint;
    // Stay 3 percent of the range away from both limits, more than the 2 percent the Simulator drifts a Tag by.
    const range = t.max - t.min;
    const low = Math.ceil((t.min + range * 0.03) * 100) / 100;
    const high = Math.floor((t.max - range * 0.03) * 100) / 100;
    let next = Math.round((old + range * rng.float(0.02, 0.1) * (rng.chance(0.5) ? 1 : -1)) * 100) / 100;
    next = Math.min(high, Math.max(low, next));
    if (next === old) next = old === low ? high : low;
    current.set(t.id, next);
    add('setpoint-override', 'tag', rng.pick(technicians).id, t.id, at, old, next, { key: rng.pick(OVERRIDE_REASONS) });
  }

  // Recipe work, taken from the version times so Batches and the Event Log agree. Version 1 predates the window.
  const recipeUser = () => rng.pick(engineers).id;
  for (const v of versions.filter((x) => x.number >= 2)) {
    const end = v.approvedAt ?? v.createdAt + 6 * HOUR + 1;
    add('recipe-new-draft', 'recipe-version', recipeUser(), v.id, v.createdAt);
    add('recipe-save', 'recipe-version', recipeUser(), v.id, v.createdAt + Math.floor((end - v.createdAt) / 2));
    if (v.approvedAt !== null) add('recipe-approve', 'recipe-version', recipeUser(), v.id, v.approvedAt, 'draft', 'approved');
  }
  // Discarded Drafts are gone, so they live under their own ids (`-d1`) and never clash with a real version.
  const withDraft = new Set(versions.filter((v) => v.status === 'draft').map((v) => v.recipeId));
  const free = recipes.filter((r) => !withDraft.has(r.id));
  for (let i = 0; i < 5 && free.length > 0; i++) {
    const r = free.splice(rng.int(0, free.length - 1), 1)[0] as Recipe;
    const lastApproved = Math.max(...versions.filter((v) => v.recipeId === r.id).map((v) => v.approvedAt ?? 0));
    const at = Math.max(lastApproved, WINDOW_START) + between(HOUR, 3 * DAY);
    const id = `${r.id}-d1`;
    add('recipe-new-draft', 'recipe-version', recipeUser(), id, at);
    add('recipe-discard', 'recipe-version', recipeUser(), id, at + between(HOUR, 24 * HOUR));
  }

  out.sort((a, b) => a.at - b.at);
  const finalTags = tags.map((t) => (current.has(t.id) ? { ...t, setpoint: current.get(t.id) as number } : t));
  return { events: out.map((e, i) => ({ id: `EV-${String(i + 1).padStart(4, '0')}`, ...e })), tags: finalTags };
}
