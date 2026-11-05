import { activeRecipeParameter } from '../parameters';
import type { EventLogEntry, LineId } from '../mock/types';
import { simulatedTime } from '../sim/clock';
import { acknowledge, advanceTo, reconcileAt } from './alarms';
import { NEVER } from './lines';
import { contextOf, MAX_TICK } from '../sim/context';
import { type SetpointStep, setpointAt } from '../sim/overlay';
import { shiftInfo } from '../sim/clock';
import { spDate } from '../mock/time';
import { recipeAction } from './recipes';
import { buildOverlay } from './state';
import { commit, entry, nothing, refuse } from './util';
import type { ActionContext, ActionResult, LineControl, PlantAction, PlantState, StopReason, StopSpan } from './types';

function openStop(spans: readonly StopSpan[], tick: number, reason: StopReason): readonly StopSpan[] {
  const open = spans.find(s => s.toTick === NEVER);
  if (!open) return [...spans, { fromTick: tick, toTick: NEVER, reason }];
  if (open.reason === reason) return spans;
  return spans.flatMap(s => s !== open ? [s] : s.fromTick === tick ? [{ ...s, reason }] : [
    { ...s, toTick: tick }, { fromTick: tick, toTick: NEVER, reason },
  ]);
}

function closeStop(spans: readonly StopSpan[], tick: number): readonly StopSpan[] {
  return spans.map((s) => (s.toTick === NEVER ? { ...s, toTick: tick } : s));
}

/** Adds a step at the end. A second change in the same tick replaces the last step, so the list never repeats a tick. */
function withStep(setpoints: ReadonlyMap<string, readonly SetpointStep[]>, tagId: string, fromTick: number, value: number): ReadonlyMap<string, readonly SetpointStep[]> {
  const steps = setpoints.get(tagId) ?? [];
  const last = steps[steps.length - 1];
  const next = last && last.fromTick >= fromTick ? [...steps.slice(0, -1), { fromTick: last.fromTick, value }] : [...steps, { fromTick, value }];
  return new Map(setpoints).set(tagId, next);
}

function setLine(state: PlantState, lineId: LineId, control: LineControl, spans: readonly StopSpan[]): Partial<PlantState> {
  return { controls: { ...state.controls, [lineId]: control }, manualStops: { ...state.manualStops, [lineId]: spans } };
}

export function reduce(state: PlantState, action: PlantAction, ctx: ActionContext): ActionResult {
  if (!Number.isSafeInteger(ctx.tick) || ctx.tick < 0 || ctx.tick > MAX_TICK) return refuse('invalid-tick');
  const tick = Math.max(ctx.tick, state.syncedTick);
  const base = advanceTo(state, tick);
  if (action.type === 'set-user') {
    if (!state.dataset.users.some((u) => u.id === action.userId)) return refuse('unknown-user');
    return base.currentUserId === action.userId ? nothing(base) : { ok: true, state: { ...base, currentUserId: action.userId }, events: [] };
  }
  if (action.type === 'advance') return { ok: true, state: base, events: [] };
  return apply(base, action, { tick });
}

function apply(state: PlantState, action: Exclude<PlantAction, { type: 'advance' | 'set-user' }>, ctx: ActionContext): ActionResult {
  const { tick } = ctx;
  if (action.type === 'acknowledge') {
    if (action.alarmIds.some((id) => !state.alarms.some((a) => a.id === id))) return refuse('unknown-alarm');
    const events: EventLogEntry[] = [];
    const alarms = state.alarms.map((a) => {
      if (!action.alarmIds.includes(a.id)) return a;
      const next = acknowledge(a, tick, state.currentUserId);
      if (!next) return a;
      events.push({ ...entry({ ...state, ids: { ...state.ids, events: state.ids.events + events.length } }, tick, 'alarm-acknowledge', a.id, 'alarm', a.state, next.state) });
      return next;
    });
    return events.length === 0 ? nothing(state) : commit(state, { alarms }, events);
  }

  if (action.type === 'setpoint-override' || action.type === 'reset-to-recipe') return setpoint(state, action, tick);
  if (action.type === 'shift-handover') return handover(state, action.note, tick);
  if (isRecipeAction(action)) return recipeAction(state, action, tick);

  const control = state.controls[action.lineId];
  if (!control) return refuse('unknown-line');
  const spans = state.manualStops[action.lineId] ?? [];

  switch (action.type) {
    case 'pause': {
      if (control.paused || control.latched) return nothing(state);
      return commit(state, setLine(state, action.lineId, { ...control, paused: true }, openStop(spans, tick, 'paused')), [entry(state, tick, 'pause', action.lineId, 'line')]);
    }
    case 'emergency-stop': {
      if (control.latched) return nothing(state);
      if (!action.confirmed) return refuse('confirmation-required');
      return commit(state, setLine(state, action.lineId, { ...control, latched: true }, openStop(spans, tick, 'emergency-stop')), [entry(state, tick, 'emergency-stop', action.lineId, 'line')]);
    }
    case 'reset': {
      if (!control.latched) return nothing(state);
      // The latch is cleared, and the Line waits stopped until someone resumes it.
      return commit(state, setLine(state, action.lineId, { paused: true, latched: false }, openStop(spans, tick, 'paused')), [entry(state, tick, 'reset', action.lineId, 'line')]);
    }
    case 'resume': {
      if (!control.paused && !control.latched) return nothing(state);
      if (control.latched) return refuse('latched');
      const changes = setLine(state, action.lineId, { ...control, paused: false }, closeStop(spans, tick));
      const tentative = { ...state, ...changes };
      tentative.overlay = buildOverlay(tentative.manualStops, tentative.faultStops, tentative.setpoints);
      // Use the same reconciliation as advance, including returns and admissions at this tick.
      // Its identities and Alarms are thrown away until the open tick is finalized.
      const peek = reconcileAt(tentative);
      if (peek.alarms.some(a => a.lineId === action.lineId && a.priority === 'critical' && (a.state === 'active-unacknowledged' || a.state === 'active-acknowledged'))) return refuse('critical-alarm-active');
      return commit(state, changes, [entry(state, tick, 'resume', action.lineId, 'line')]);
    }
  }
}

function setpoint(state: PlantState, action: Extract<PlantAction, { type: 'setpoint-override' | 'reset-to-recipe' }>, tick: number): ActionResult {
  const d = state.dataset;
  const simulator = contextOf(d);
  const tag = simulator.tagById.get(action.tagId);
  if (!tag) return refuse('unknown-tag');
  const heartbeat = simulator.heartbeat.get(tag.machineId);
  if (heartbeat !== undefined && tick >= heartbeat) return refuse('tag-stale');
  // The action tick is still open, so changes take effect at that tick.
  const current = setpointAt(state.overlay, tag, tick);

  if (action.type === 'reset-to-recipe') {
    const param = activeRecipeParameter(d, tag);
    if (!tag.parameterKey || !param) return refuse('no-recipe-value');
    if (param.setpoint === current) return nothing(state);
    return commit(state, { setpoints: withStep(state.setpoints, tag.id, tick, param.setpoint) }, [entry(state, tick, 'reset-to-recipe', tag.id, 'tag', current, param.setpoint)]);
  }

  if (!tag.writable) return refuse('tag-not-writable');
  if (!Number.isFinite(action.value)) return refuse('invalid-value');
  if (action.reason.trim() === '') return refuse('reason-required');
  if (action.value < tag.min || action.value > tag.max) return refuse('value-out-of-range');
  if (action.value === current) return nothing(state);
  const logged: EventLogEntry = { ...entry(state, tick, 'setpoint-override', tag.id, 'tag', current, action.value), note: action.reason.trim() };
  return commit(state, { setpoints: withStep(state.setpoints, tag.id, tick, action.value) }, [logged]);
}

const NEXT_SHIFT = { S1: 'S2', S2: 'S3', S3: 'S1' } as const;

function handover(state: PlantState, note: string, tick: number): ActionResult {
  const text = note.trim();
  if (text === '') return refuse('note-required');
  const current = shiftInfo(tick);
  const key = `${spDate(current.startsAt)}/${current.shift}`;
  const at = simulatedTime(tick);
  const handovers = new Map(state.handovers).set(key, [...(state.handovers.get(key) ?? []), { at, userId: state.currentUserId, note: text }]);
  const logged: EventLogEntry = { ...entry(state, tick, 'shift-handover', key, 'shift', current.shift, NEXT_SHIFT[current.shift]), note: text };
  return commit(state, { handovers }, [logged]);
}

function isRecipeAction(a: PlantAction): a is Extract<PlantAction, { type: 'new-draft' | 'add-step' | 'remove-step' | 'reorder-step' | 'edit-parameter' | 'save-draft' | 'approve' | 'discard-draft' }> {
  return ['new-draft', 'add-step', 'remove-step', 'reorder-step', 'edit-parameter', 'save-draft', 'approve', 'discard-draft'].includes(a.type);
}
