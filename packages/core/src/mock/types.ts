/** Free text is stored as a translation key plus params. Identifiers stay untranslated. */
export interface TextRef {
  key: string;
  params?: Record<string, string | number>;
}

/** Epoch milliseconds (UTC). Screens format them in America/Sao_Paulo. */
export type Timestamp = number;

export type AreaId = 'extrusion' | 'metalworking' | 'assembly';
export type LineType = 'extrusion' | 'roll-forming' | 'stamping' | 'cnc' | 'assembly';
export type LineId = 'E1' | 'E2' | 'RF1' | 'P1' | 'C1' | 'A1' | 'A2';
export type MachineKind =
  | 'extruder' | 'calibrator' | 'cooling-tank' | 'puller' | 'saw'
  | 'uncoiler' | 'roll-former' | 'cut-off' | 'stamping-press' | 'cnc'
  | 'cutting' | 'reinforcement-insert' | 'corner-weld' | 'cleaning' | 'hardware-fit' | 'vision-check';

export interface Area { id: AreaId; name: TextRef }
export interface Line { id: LineId; areaId: AreaId; type: LineType; name: TextRef }
export type LinkStatus = 'online' | 'degraded' | 'offline';
export interface MachineComms {
  status: LinkStatus;
  latencyMs: number;
  packetLossPct: number;
  lastHeartbeatAt: Timestamp;
  errorCount: number;
}
export interface Machine {
  id: string;
  lineId: LineId;
  kind: MachineKind;
  name: TextRef;
  comms: MachineComms;
}

export type Role = 'operator' | 'engineer' | 'technician' | 'manager';
export interface User { id: string; name: string; role: Role }

export interface Product { id: string; code: string; name: TextRef }

export const STEP_KINDS = ['preheat', 'ramp', 'run', 'cooldown', 'load', 'process', 'inspect'] as const;
export type StepKind = typeof STEP_KINDS[number];
export interface Parameter {
  id: string;
  /** Stable parameter key, for example `barrel-zone-1`. Dependency Rules match on it. */
  key: string;
  name: TextRef;
  setpoint: number;
  min: number;
  max: number;
  unit: string;
}
export interface Step { id: string; order: number; kind: StepKind; name: TextRef; parameters: Parameter[] }
export type RecipeStatus = 'draft' | 'approved';
export interface RecipeVersion {
  id: string;
  recipeId: string;
  number: number;
  status: RecipeStatus;
  createdAt: Timestamp;
  /** When it became read-only. Null for a Draft. */
  approvedAt: Timestamp | null;
  steps: Step[];
}
export interface Recipe { id: string; productId: string; lineType: LineType; name: TextRef }

export const SHIFT_IDS = ['S1', 'S2', 'S3'] as const;
export type ShiftId = typeof SHIFT_IDS[number];
export const BATCH_STATUSES = ['completed', 'aborted', 'rework'] as const;
export type BatchStatus = typeof BATCH_STATUSES[number];
export interface Lot { id: string; batchId: string; upstreamLotId: string | null }
export interface GenealogyNode { lotId: string; batchId: string | null }
export interface Genealogy {
  lotId: string;
  materialLot: GenealogyNode | null;
  extrusion: GenealogyNode | null;
  metalwork: GenealogyNode | null;
  assembly: (GenealogyNode & { serial: string }) | null;
}
export interface Batch {
  id: string;
  lineId: LineId;
  productId: string;
  recipeVersionId: string;
  lotId: string;
  shift: ShiftId;
  start: Timestamp;
  end: Timestamp;
  status: BatchStatus;
  targetUnits: number;
  /** Units made, good and scrap together. */
  producedUnits: number;
  yieldPct: number;
  scrap: number;
  /** Actual value of each Parameter of the run Step, by Parameter key. */
  actuals: Record<string, number>;
}

/** A Batch running at NOW. It has not ended yet, so it has no status, yield or end. */
export interface ActiveBatch {
  id: string;
  lineId: LineId;
  productId: string;
  recipeVersionId: string;
  lotId: string;
  shift: ShiftId;
  start: Timestamp;
  plannedEnd: Timestamp;
  targetUnits: number;
  /** Units made so far, at NOW, good and scrap together. */
  producedUnits: number;
  scrapUnits: number;
}

export interface Tag {
  id: string;
  machineId: string;
  lineId: LineId;
  /** Tag name, an identifier, never translated. */
  name: string;
  unit: string;
  setpoint: number;
  min: number;
  max: number;
  writable: boolean;
  /** Recipe Parameter key this Tag's setpoint comes from, if any. */
  parameterKey: string | null;
}

export type AlarmPriority = 'critical' | 'high' | 'medium' | 'low';
export type AlarmState =
  | 'active-unacknowledged'
  | 'active-acknowledged'
  | 'returned-unacknowledged'
  | 'cleared';
export interface Alarm {
  id: string;
  priority: AlarmPriority;
  state: AlarmState;
  lineId: LineId;
  machineId: string;
  tagId: string | null;
  batchId: string | null;
  message: TextRef;
  raisedAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  acknowledgedBy: string | null;
  returnedAt: Timestamp | null;
  clearedAt: Timestamp | null;
}

export type EventAction =
  | 'alarm-acknowledge' | 'setpoint-override' | 'pause' | 'resume' | 'emergency-stop' | 'reset'
  | 'shift-handover' | 'reset-to-recipe'
  | 'recipe-new-draft' | 'recipe-save' | 'recipe-approve' | 'recipe-discard';
export type EventTargetKind = 'line' | 'alarm' | 'tag' | 'recipe-version' | 'shift';
export interface EventLogEntry {
  id: string;
  at: Timestamp;
  userId: string;
  action: EventAction;
  /** What `target` is. A Shift target is `YYYY-MM-DD/S1`. */
  targetKind: EventTargetKind;
  target: string;
  oldValue: string | number | null;
  newValue: string | number | null;
  /** Reason for an override, or the note of a Shift handover. Typed text is a plain string. */
  note: string | TextRef | null;
}

export type DowntimeReason =
  | 'die-change' | 'saw-jam' | 'material-shortage' | 'changeover'
  | 'vacuum-loss' | 'weld-fault' | 'tool-change' | 'minor-stops';

export interface HourlyRecord {
  /** Start of the hour, epoch ms. */
  hourStart: Timestamp;
  lineId: LineId;
  /** History is 60 minutes; live partial hours use elapsed minutes rounded to the nearest minute. */
  plannedMin: number;
  runMin: number;
  downtime: { reason: DowntimeReason; minutes: number }[];
  targetUnits: number;
  goodUnits: number;
  scrapUnits: number;
}

export interface ShiftRecord {
  /** Local date (America/Sao_Paulo) on which the Shift starts, YYYY-MM-DD. */
  date: string;
  shift: ShiftId;
  lineId: LineId;
  plannedMin: number;
  runMin: number;
  downtime: { reason: DowntimeReason; minutes: number }[];
  targetUnits: number;
  goodUnits: number;
  scrapUnits: number;
}

export interface MockDataset {
  seed: number;
  now: Timestamp;
  areas: Area[];
  lines: Line[];
  machines: Machine[];
  users: User[];
  products: Product[];
  recipes: Recipe[];
  recipeVersions: RecipeVersion[];
  lots: Lot[];
  genealogies: Genealogy[];
  batches: Batch[];
  activeBatches: ActiveBatch[];
  tags: Tag[];
  alarms: Alarm[];
  events: EventLogEntry[];
  shiftHistory: ShiftRecord[];
  /** All 90 days, ordered by hour then Line order. Shift history sums these records. */
  hourlyOutput: HourlyRecord[];
}
