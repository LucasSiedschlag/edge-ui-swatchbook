import type { Rng } from './prng';
import type { Area, Line, LineId, Machine, MachineKind } from './types';
import { MINUTE, NOW } from './time';

export const AREAS: Area[] = [
  { id: 'extrusion', name: { key: 'area.extrusion' } },
  { id: 'metalworking', name: { key: 'area.metalworking' } },
  { id: 'assembly', name: { key: 'area.assembly' } },
];

export const LINES: Line[] = [
  { id: 'E1', areaId: 'extrusion', type: 'extrusion', name: { key: 'line.extrusion', params: { n: 1 } } },
  { id: 'E2', areaId: 'extrusion', type: 'extrusion', name: { key: 'line.extrusion', params: { n: 2 } } },
  { id: 'RF1', areaId: 'metalworking', type: 'roll-forming', name: { key: 'line.roll-forming', params: { n: 1 } } },
  { id: 'P1', areaId: 'metalworking', type: 'stamping', name: { key: 'line.stamping', params: { n: 1 } } },
  { id: 'C1', areaId: 'metalworking', type: 'cnc', name: { key: 'line.cnc', params: { n: 1 } } },
  { id: 'A1', areaId: 'assembly', type: 'assembly', name: { key: 'line.assembly', params: { n: 1 } } },
  { id: 'A2', areaId: 'assembly', type: 'assembly', name: { key: 'line.assembly', params: { n: 2 } } },
];

const EXTRUSION_KINDS: MachineKind[] = ['extruder', 'calibrator', 'cooling-tank', 'puller', 'saw'];
const ASSEMBLY_KINDS: MachineKind[] = ['cutting', 'reinforcement-insert', 'corner-weld', 'cleaning', 'hardware-fit', 'vision-check'];

export const MACHINE_KINDS_BY_LINE: Record<LineId, MachineKind[]> = {
  E1: EXTRUSION_KINDS,
  E2: EXTRUSION_KINDS,
  RF1: ['uncoiler', 'roll-former', 'cut-off'],
  P1: ['stamping-press'],
  C1: ['cnc'],
  A1: ASSEMBLY_KINDS,
  A2: ASSEMBLY_KINDS,
};

export function generateMachines(rng: Rng): Machine[] {
  const machines: Machine[] = [];
  for (const line of LINES) {
    for (const kind of MACHINE_KINDS_BY_LINE[line.id]) {
      machines.push({
        id: `${line.id}-${kind}`,
        lineId: line.id,
        kind,
        name: { key: `machine.${kind}` },
        comms: {
          status: 'online',
          latencyMs: rng.int(4, 18),
          packetLossPct: Math.round(rng.float(0, 0.4) * 100) / 100,
          lastHeartbeatAt: NOW - rng.int(0, 3) * 1000,
          errorCount: rng.int(0, 3),
        },
      });
    }
  }
  // One Offline and two Degraded links so the diagnostics states exist.
  const offline = machines[rng.int(0, machines.length - 1)] as Machine;
  offline.comms = { status: 'offline', latencyMs: 0, packetLossPct: 100, lastHeartbeatAt: NOW - rng.int(20, 90) * MINUTE, errorCount: rng.int(40, 120) };
  const rest = machines.filter((m) => m !== offline);
  for (let i = 0; i < 2; i++) {
    const m = rest.splice(rng.int(0, rest.length - 1), 1)[0] as Machine;
    m.comms = { status: 'degraded', latencyMs: rng.int(120, 400), packetLossPct: Math.round(rng.float(2, 9) * 100) / 100, lastHeartbeatAt: NOW - rng.int(5, 20) * 1000, errorCount: rng.int(10, 30) };
  }
  return machines;
}
