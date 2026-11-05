import type { Alarm, EventLogEntry, LineId, MockDataset, RecipeVersion, StepKind } from '../mock/types';
import type { Overlay, SetpointStep } from '../sim/overlay';

export type StopReason = 'paused' | 'emergency-stop' | 'fault';

export interface HandoverNote {
  at: number;
  userId: string;
  note: string;
}

export interface LineStatus {
  /** Alarm while the Line has an active Critical Alarm. Otherwise Running or Stopped. */
  status: 'running' | 'stopped' | 'alarm';
  /** Why the Line is stopped, also while the status shows Alarm. Null when it is not stopped. */
  reason: StopReason | null;
  /** Count at syncedTick, including when a historical stop reason is requested. */
  criticalAlarms: number;
}

/** What the operator has done to a Line. A Line with an Offline Machine is also stopped, for Fault, but that is not stored here. */
export interface LineControl {
  paused: boolean;
  /** Set by an Emergency stop, cleared by Reset. */
  latched: boolean;
}

/** A stretch of ticks in which a Line made no product. An open stretch ends at Infinity. */
export interface StopSpan {
  reason: StopReason;
  fromTick: number;
  toTick: number;
}

/**
 * Everything the actions change, in memory. It is never edited in place: `reduce` returns a new state.
 * The Mock Dataset it was built from is never changed either.
 */
export interface PlantState {
  readonly dataset: MockDataset;
  /** High water marks survive deletion. Allocated identities are never reclaimed. */
  readonly ids: {
    versions: Readonly<Record<string, number>>;
    steps: Readonly<Record<string, number>>;
    alarms: number;
    events: number;
  };
  readonly currentUserId: string;
  readonly controls: Readonly<Record<LineId, LineControl>>;
  /** Stretches in which the operator stopped each Line. */
  readonly manualStops: Readonly<Record<LineId, readonly StopSpan[]>>;
  /** Stretches in which a Line was stopped for Fault, from the last heartbeat of an Offline Machine. */
  readonly faultStops: Readonly<Record<LineId, readonly StopSpan[]>>;
  /** Setpoint Overrides and resets, per Tag. Steps only grow at the end. */
  readonly setpoints: ReadonlyMap<string, readonly SetpointStep[]>;
  /** Every Recipe Version: the Mock Dataset ones, plus Drafts made in this session and versions approved in it. */
  readonly recipeVersions: readonly RecipeVersion[];
  /** The last saved content of each Draft. */
  readonly savedDrafts: ReadonlyMap<string, RecipeVersion>;
  /** Shift handover notes, by Shift (`YYYY-MM-DD/S1`), in the order they were written. */
  readonly handovers: ReadonlyMap<string, readonly HandoverNote[]>;
  /** Ticks before this are final. This tick stays open for control changes. */
  readonly syncedTick: number;
  readonly alarms: readonly Alarm[];
  readonly events: readonly EventLogEntry[];
  /** What the Simulator needs. A new object whenever the state changes what it reads. */
  readonly overlay: Overlay;
}

export type PlantErrorCode =
  | 'invalid-tick'
  | 'invalid-version'
  | 'step-kind-exists'
  | 'no-step-template'
  | 'confirmation-required'
  | 'critical-alarm-active'
  | 'latched'
  | 'unknown-user'
  | 'unknown-alarm'
  | 'unknown-line'
  | 'unknown-tag'
  | 'tag-not-writable'
  | 'tag-stale'
  | 'invalid-value'
  | 'reason-required'
  | 'value-out-of-range'
  | 'no-recipe-value'
  | 'note-required'
  | 'unknown-version'
  | 'unknown-step'
  | 'unknown-parameter'
  | 'not-approved'
  | 'draft-exists'
  | 'read-only'
  | 'parameter-order'
  | 'rules-failing';

export interface PlantError {
  code: PlantErrorCode;
  /** For `rules-failing`: the Dependency Rules (1 to 4) that fail. */
  rules?: (1 | 2 | 3 | 4)[];
  /** For `parameter-order`: the Parameter whose minimum, setpoint and maximum are out of order. */
  parameterId?: string;
}

export type PlantAction =
  | { type: 'pause'; lineId: LineId }
  | { type: 'resume'; lineId: LineId }
  | { type: 'emergency-stop'; lineId: LineId; confirmed: boolean }
  | { type: 'reset'; lineId: LineId }
  | { type: 'acknowledge'; alarmIds: readonly string[] }
  /** Takes effect at the open action tick. The reason is required. */
  | { type: 'setpoint-override'; tagId: string; value: number; reason: string }
  | { type: 'reset-to-recipe'; tagId: string }
  /** Records a note on the current Shift. The note is required. */
  | { type: 'shift-handover'; note: string }
  /** Copies an Approved version into a new Draft. */
  | { type: 'new-draft'; versionId: string }
  | { type: 'add-step'; versionId: string; kind: StepKind }
  | { type: 'remove-step'; versionId: string; stepId: string }
  | { type: 'reorder-step'; versionId: string; stepId: string; toIndex: number }
  /** Draft only. Minimum must not exceed setpoint, and setpoint must not exceed maximum. */
  | { type: 'edit-parameter'; versionId: string; parameterId: string; field: 'setpoint' | 'min' | 'max'; value: number }
  /** Blocked while a Dependency Rule fails. */
  | { type: 'save-draft'; versionId: string }
  /** Allowed only for a Draft with no failing rule. The version becomes read-only. */
  | { type: 'approve'; versionId: string }
  | { type: 'discard-draft'; versionId: string }
  /** Finalizes ticks before this tick, keeping the current tick open. Writes no log entry. */
  | { type: 'advance' }
  | { type: 'set-user'; userId: string };

export interface ActionContext {
  /** The simulator tick the action happens at. The caller passes it, so the core stays deterministic. */
  tick: number;
}

export type ActionResult =
  | { ok: true; state: PlantState; events: EventLogEntry[] }
  | { ok: false; error: PlantError };
