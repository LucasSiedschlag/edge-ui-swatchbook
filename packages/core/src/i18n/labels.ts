import type { AlarmPriority, AlarmState, AreaId, BatchStatus, DowntimeReason, EventAction, EventTargetKind, LineType, LinkStatus, MachineKind, RecipeStatus, Role, ShiftId, StepKind } from '../mock/types';
import type { LineStatus, PlantErrorCode, StopReason } from '../plant/types';
import type { TagStatus } from '../sim/tags';
import type { Scope } from '../views/performance';
import type { RangeId } from '../views/ranges';
import type { TrendWindowId } from '../views/trend';
import type { MessageKey } from './messages';

// Screen ids are checked against the root SCREENS constant in the type tests.
type ScreenId = 'deck' | 'recipes' | 'ledger' | 'performance' | 'parameters' | 'control';

export const areaLabels: Record<AreaId, MessageKey> = {
  "extrusion": "area.extrusion",
  "metalworking": "area.metalworking",
  "assembly": "area.assembly",
};

export const machineLabels: Record<MachineKind, MessageKey> = {
  "extruder": "machine.extruder",
  "calibrator": "machine.calibrator",
  "cooling-tank": "machine.cooling-tank",
  "puller": "machine.puller",
  "saw": "machine.saw",
  "uncoiler": "machine.uncoiler",
  "roll-former": "machine.roll-former",
  "cut-off": "machine.cut-off",
  "stamping-press": "machine.stamping-press",
  "cnc": "machine.cnc",
  "cutting": "machine.cutting",
  "reinforcement-insert": "machine.reinforcement-insert",
  "corner-weld": "machine.corner-weld",
  "cleaning": "machine.cleaning",
  "hardware-fit": "machine.hardware-fit",
  "vision-check": "machine.vision-check",
};

export const downtimeLabels: Record<DowntimeReason, MessageKey> = {
  "die-change": "downtime.die-change",
  "saw-jam": "downtime.saw-jam",
  "material-shortage": "downtime.material-shortage",
  "changeover": "downtime.changeover",
  "vacuum-loss": "downtime.vacuum-loss",
  "weld-fault": "downtime.weld-fault",
  "tool-change": "downtime.tool-change",
  "minor-stops": "downtime.minor-stops",
};

export const roleLabels: Record<Role, MessageKey> = {
  "operator": "role.operator",
  "engineer": "role.engineer",
  "technician": "role.technician",
  "manager": "role.manager",
};

export const alarmPriorityLabels: Record<AlarmPriority, MessageKey> = {
  "critical": "alarm-priority.critical",
  "high": "alarm-priority.high",
  "medium": "alarm-priority.medium",
  "low": "alarm-priority.low",
};

export const alarmStateLabels: Record<AlarmState, MessageKey> = {
  "active-unacknowledged": "alarm-state.active-unacknowledged",
  "active-acknowledged": "alarm-state.active-acknowledged",
  "returned-unacknowledged": "alarm-state.returned-unacknowledged",
  "cleared": "alarm-state.cleared",
};

export const linkStatusLabels: Record<LinkStatus, MessageKey> = {
  "online": "link-status.online",
  "degraded": "link-status.degraded",
  "offline": "link-status.offline",
};

export const tagStatusLabels: Record<TagStatus, MessageKey> = {
  "normal": "tag-status.normal",
  "high": "tag-status.high",
  "low": "tag-status.low",
  "stale": "tag-status.stale",
};

export const lineStatusLabels: Record<LineStatus['status'], MessageKey> = {
  "running": "line-status.running",
  "stopped": "line-status.stopped",
  "alarm": "line-status.alarm",
};

export const stopReasonLabels: Record<StopReason, MessageKey> = {
  "paused": "stop-reason.paused",
  "emergency-stop": "stop-reason.emergency-stop",
  "fault": "stop-reason.fault",
};

export const eventActionLabels: Record<EventAction, MessageKey> = {
  "alarm-acknowledge": "event-action.alarm-acknowledge",
  "setpoint-override": "event-action.setpoint-override",
  "pause": "event-action.pause",
  "resume": "event-action.resume",
  "emergency-stop": "event-action.emergency-stop",
  "reset": "event-action.reset",
  "shift-handover": "event-action.shift-handover",
  "reset-to-recipe": "event-action.reset-to-recipe",
  "recipe-new-draft": "event-action.recipe-new-draft",
  "recipe-save": "event-action.recipe-save",
  "recipe-approve": "event-action.recipe-approve",
  "recipe-discard": "event-action.recipe-discard",
};

export const lineTypeLabels: Record<LineType, MessageKey> = {
  "extrusion": "line-type.extrusion",
  "roll-forming": "line-type.roll-forming",
  "stamping": "line-type.stamping",
  "cnc": "line-type.cnc",
  "assembly": "line-type.assembly",
};

export const recipeStatusLabels: Record<RecipeStatus, MessageKey> = {
  "draft": "recipe-status.draft",
  "approved": "recipe-status.approved",
};

export const stepKindLabels: Record<StepKind, MessageKey> = {
  "preheat": "step.preheat",
  "ramp": "step.ramp",
  "run": "step.run",
  "cooldown": "step.cooldown",
  "load": "step.load",
  "process": "step.process",
  "inspect": "step.inspect",
};

export const batchStatusLabels: Record<BatchStatus, MessageKey> = {
  "completed": "batch-status.completed",
  "aborted": "batch-status.aborted",
  "rework": "batch-status.rework",
};

export const shiftLabels: Record<ShiftId, MessageKey> = {
  "S1": "shift.first",
  "S2": "shift.second",
  "S3": "shift.third",
};

export const rangeLabels: Record<RangeId, MessageKey> = {
  "last-shift": "range.last-shift",
  "last-24h": "range.last-24h",
  "last-7d": "range.last-7d",
  "last-30d": "range.last-30d",
};

export const trendWindowLabels: Record<TrendWindowId, MessageKey> = {
  "5m": "trend-window.last-5m",
  "30m": "trend-window.last-30m",
  "2h": "trend-window.last-2h",
};

export const plantErrorLabels: Record<PlantErrorCode, MessageKey> = {
  "invalid-tick": "plant-error.invalid-tick",
  "invalid-version": "plant-error.invalid-version",
  "step-kind-exists": "plant-error.step-kind-exists",
  "no-step-template": "plant-error.no-step-template",
  "confirmation-required": "plant-error.confirmation-required",
  "critical-alarm-active": "plant-error.critical-alarm-active",
  "latched": "plant-error.latched",
  "unknown-user": "plant-error.unknown-user",
  "unknown-alarm": "plant-error.unknown-alarm",
  "unknown-line": "plant-error.unknown-line",
  "unknown-tag": "plant-error.unknown-tag",
  "tag-not-writable": "plant-error.tag-not-writable",
  "tag-stale": "plant-error.tag-stale",
  "invalid-value": "plant-error.invalid-value",
  "reason-required": "plant-error.reason-required",
  "value-out-of-range": "plant-error.value-out-of-range",
  "no-recipe-value": "plant-error.no-recipe-value",
  "note-required": "plant-error.note-required",
  "unknown-version": "plant-error.unknown-version",
  "unknown-step": "plant-error.unknown-step",
  "unknown-parameter": "plant-error.unknown-parameter",
  "not-approved": "plant-error.not-approved",
  "draft-exists": "plant-error.draft-exists",
  "read-only": "plant-error.read-only",
  "parameter-order": "plant-error.parameter-order",
  "rules-failing": "plant-error.rules-failing",
};

export const scopeLabels: Record<Scope['kind'], MessageKey> = {
  "site": "scope.site",
  "area": "scope.area",
  "line": "scope.line",
};

export const screenLabels: Record<ScreenId, MessageKey> = {
  "deck": "screen.deck",
  "recipes": "screen.recipes",
  "ledger": "screen.ledger",
  "performance": "screen.performance",
  "parameters": "screen.parameters",
  "control": "screen.control",
};

export const eventTargetLabels: Record<EventTargetKind, MessageKey> = {
  "line": "event-target.line",
  "alarm": "event-target.alarm",
  "tag": "event-target.tag",
  "recipe-version": "event-target.recipe-version",
  "shift": "event-target.shift",
};

