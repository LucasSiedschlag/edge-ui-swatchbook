import type { MockDataset } from '../mock/types';

/** Reject broken references before Plant State or the Simulator caches the Mock Dataset. */
export function validateDataset(d: MockDataset): void {
  for (const section of ['events', 'alarms', 'recipeVersions'] as const) {
    const seen = new Set<string>();
    for (const row of d[section]) {
      if (seen.has(row.id)) throw new Error(`duplicate id ${row.id} in ${section}`);
      seen.add(row.id);
    }
  }
  const users = new Set(d.users.map((u) => u.id));
  const lines = new Set<string>(d.lines.map((l) => l.id));
  const machines = new Set(d.machines.map((m) => m.id));
  const batches = new Set([...d.batches, ...d.activeBatches].map((b) => b.id));
  const requireId = (known: Set<string>, id: string, owner: string, kind: string) => {
    if (!known.has(id)) throw new Error(`${owner} names unknown ${kind} ${id}`);
  };
  for (const event of d.events) requireId(users, event.userId, `Event ${event.id}`, 'User');
  for (const alarm of d.alarms) {
    requireId(lines, alarm.lineId, `Alarm ${alarm.id}`, 'Line');
    requireId(machines, alarm.machineId, `Alarm ${alarm.id}`, 'Machine');
  }
  for (const machine of d.machines) requireId(lines, machine.lineId, `Machine ${machine.id}`, 'Line');
  for (const batch of [...d.batches, ...d.activeBatches]) requireId(lines, batch.lineId, `Batch ${batch.id}`, 'Line');
  // A Lot names its Line through its Batch, whose Line was checked above.
  for (const lot of d.lots) requireId(batches, lot.batchId, `Lot ${lot.id}`, 'Batch');
  for (const tag of d.tags) {
    requireId(lines, tag.lineId, `Tag ${tag.id}`, 'Line');
    requireId(machines, tag.machineId, `Tag ${tag.id}`, 'Machine');
  }
}
