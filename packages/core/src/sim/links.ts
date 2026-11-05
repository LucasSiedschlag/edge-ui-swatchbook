import type { LinkStatus, Machine, Timestamp } from '../mock/types';
import { hash, smooth } from './noise';
import { simulatedTime } from './clock';

export interface MachineLink {
  machineId: string;
  status: LinkStatus;
  latencyMs: number;
  packetLossPct: number;
  lastSeenAt: Timestamp;
  errorCount: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Link health of every Machine at a tick. A link keeps the status it has in the Mock Dataset,
 * so an Offline Machine stays Offline and its last heartbeat never moves.
 */
export function readLinks(machines: Machine[], tick: number): MachineLink[] {
  const now = simulatedTime(tick);
  return machines.map((m) => {
    const key = hash(m.id);
    const c = m.comms;
    if (c.status === 'offline') {
      return { machineId: m.id, status: 'offline', latencyMs: 0, packetLossPct: 100, lastSeenAt: c.lastHeartbeatAt, errorCount: c.errorCount };
    }
    // Each link starts at the numbers in the Mock Dataset and wanders from there.
    const drift = smooth(key, tick, 90) - smooth(key, 0, 90);
    if (c.status === 'degraded') {
      return {
        machineId: m.id,
        status: 'degraded',
        latencyMs: clamp(Math.round(c.latencyMs + drift * 300), 100, 500),
        packetLossPct: clamp(round2(c.packetLossPct + drift * 6), 1, 10),
        lastSeenAt: Math.max(c.lastHeartbeatAt, now - ((tick + (key % 20)) % 20) * 1000),
        errorCount: c.errorCount + Math.floor(tick / 60),
      };
    }
    return {
      machineId: m.id,
      status: 'online',
      latencyMs: clamp(Math.round(c.latencyMs + drift * 14), 1, 30),
      packetLossPct: clamp(round2(c.packetLossPct + drift * 0.5), 0, 0.9),
      lastSeenAt: Math.max(c.lastHeartbeatAt, now - ((tick + (key % 2)) % 2) * 1000),
      errorCount: c.errorCount,
    };
  });
}
