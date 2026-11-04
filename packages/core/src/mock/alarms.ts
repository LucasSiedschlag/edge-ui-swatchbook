import type { Rng } from './prng';
import { IDLE_LINE } from './batches';
import { DAY, HISTORY_DAYS, HOUR, MINUTE, NOW } from './time';
import type { ActiveBatch, Alarm, AlarmPriority, AlarmState, Batch, Machine, Tag, TextRef, User } from './types';

const CLEARED_COUNT = 150;
/** Counters and run-hours have no sensible high or low limit alarm. */
const COUNTER_UNITS = new Set(['pcs', 'h']);

function priority(rng: Rng): AlarmPriority {
  const r = rng.next();
  return r < 0.05 ? 'critical' : r < 0.25 ? 'high' : r < 0.65 ? 'medium' : 'low';
}

/** Open Alarms to place near NOW, so every state shows on Screens 1 and 6. */
const OPEN: { state: Exclude<AlarmState, 'cleared'>; priority: AlarmPriority; minutesAgo: number }[] = [
  { state: 'active-unacknowledged', priority: 'critical', minutesAgo: 6 },
  { state: 'active-unacknowledged', priority: 'high', minutesAgo: 22 },
  { state: 'active-unacknowledged', priority: 'medium', minutesAgo: 75 },
  { state: 'active-unacknowledged', priority: 'low', minutesAgo: 140 },
  { state: 'active-acknowledged', priority: 'high', minutesAgo: 95 },
  { state: 'active-acknowledged', priority: 'medium', minutesAgo: 210 },
  { state: 'active-acknowledged', priority: 'low', minutesAgo: 300 },
  { state: 'returned-unacknowledged', priority: 'high', minutesAgo: 120 },
  { state: 'returned-unacknowledged', priority: 'medium', minutesAgo: 180 },
  { state: 'returned-unacknowledged', priority: 'low', minutesAgo: 400 },
];

export function generateAlarms(rng: Rng, machines: Machine[], tags: Tag[], batches: Batch[], active: ActiveBatch[], users: User[]): Alarm[] {
  const batchesByLine = new Map<string, Batch[]>();
  for (const b of batches) batchesByLine.set(b.lineId, [...(batchesByLine.get(b.lineId) ?? []), b]);
  const batchAt = (lineId: string, t: number) => {
    const running = active.find((b) => b.lineId === lineId && b.start <= t && t < b.plannedEnd);
    return running?.id ?? (batchesByLine.get(lineId) ?? []).find((b) => b.start <= t && t < b.end)?.id ?? null;
  };
  const tagsByMachine = new Map<string, Tag[]>();
  for (const t of tags) tagsByMachine.set(t.machineId, [...(tagsByMachine.get(t.machineId) ?? []), t]);

  const build = (raisedAt: number, prio: AlarmPriority, machine: Machine, msgKey: string, tag: Tag | null): Alarm => {
    const message: TextRef = { key: msgKey, params: tag ? { tag: tag.name } : { machine: machine.id } };
    return {
      id: '',
      priority: prio,
      state: 'cleared',
      lineId: machine.lineId,
      machineId: machine.id,
      tagId: tag?.id ?? null,
      batchId: batchAt(machine.lineId, raisedAt),
      message,
      raisedAt,
      acknowledgedAt: null,
      acknowledgedBy: null,
      returnedAt: null,
      clearedAt: null,
    };
  };
  /** A message and Tag that belong together for this Machine. */
  const messageFor = (m: Machine): { key: string; tag: Tag | null } => {
    const own = tagsByMachine.get(m.id) ?? [];
    const measured = own.filter((t) => !COUNTER_UNITS.has(t.unit));
    const motor = own.find((t) => t.name === 'motor-current');
    const options: { key: string; tag: Tag | null }[] = [{ key: 'alarm.fault', tag: null }];
    if (measured.length > 0) options.push({ key: 'alarm.high-value', tag: rng.pick(measured) }, { key: 'alarm.low-value', tag: rng.pick(measured) });
    if (motor) options.push({ key: 'alarm.motor-overload', tag: motor });
    return rng.pick(options);
  };
  const alarms: Alarm[] = [];

  for (let i = 0; i < CLEARED_COUNT; i++) {
    const raisedAt = NOW - 12 * HOUR - rng.int(0, HISTORY_DAYS * DAY - 12 * HOUR - 1);
    const m = rng.pick(machines);
    const msg = messageFor(m);
    const a = build(raisedAt, priority(rng), m, msg.key, msg.tag);
    const returnedAt = raisedAt + rng.int(1, 60) * MINUTE;
    const acknowledgedAt = raisedAt + rng.int(1, 70) * MINUTE;
    a.returnedAt = returnedAt;
    a.acknowledgedAt = acknowledgedAt;
    a.acknowledgedBy = rng.pick(users).id;
    a.clearedAt = Math.max(returnedAt, acknowledgedAt);
    alarms.push(a);
  }

  const offline = machines.find((m) => m.comms.status === 'offline');
  const used = new Set<string>();
  // Open Alarms sit on running Lines, so the newest ones fall inside the running Batch.
  const runningMachines = machines.filter((m) => m.lineId !== IDLE_LINE);
  OPEN.forEach((spec, i) => {
    const commLoss = i === 1 && offline !== undefined;
    const m = commLoss ? (offline as Machine) : rng.pick(runningMachines.filter((x) => !used.has(x.id) && x.id !== offline?.id));
    used.add(m.id);
    // The comms loss is raised one minute after the Machine's last heartbeat.
    const raisedAt = commLoss ? m.comms.lastHeartbeatAt + MINUTE : NOW - spec.minutesAgo * MINUTE;
    const msg = commLoss ? { key: 'alarm.comm-loss', tag: null } : messageFor(m);
    const a = build(raisedAt, spec.priority, m, msg.key, msg.tag);
    a.state = spec.state;
    if (spec.state === 'active-acknowledged') {
      a.acknowledgedAt = raisedAt + rng.int(1, 10) * MINUTE;
      a.acknowledgedBy = rng.pick(users).id;
    }
    if (spec.state === 'returned-unacknowledged') a.returnedAt = raisedAt + rng.int(5, 30) * MINUTE;
    alarms.push(a);
  });

  alarms.sort((a, b) => a.raisedAt - b.raisedAt);
  alarms.forEach((a, i) => { a.id = `AL-${String(i + 1).padStart(4, '0')}`; });
  return alarms;
}
