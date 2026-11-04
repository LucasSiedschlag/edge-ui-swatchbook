import type { LinkStatus, Machine, Timestamp } from '../mock/types';
import { hash, noise, smooth } from './noise';
import { simulatedTime } from './clock';

export interface MachineLink {
  machineId: string;
  status: LinkStatus;
  latencyMs: number;
  packetLossPct: number;
  lastSeenAt: Timestamp;
  errorCount: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

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
    const wave = smooth(key, tick, 90);
    if (c.status === 'degraded') {
      return {
        machineId: m.id,
        status: 'degraded',
        latencyMs: Math.round(120 + wave * 330),
        packetLossPct: round1(1 + wave * 8),
        lastSeenAt: now - Math.floor(noise(key, tick) * 20) * 1000,
        errorCount: c.errorCount + Math.floor(tick / 60),
      };
    }
    return {
      machineId: m.id,
      status: 'online',
      latencyMs: Math.round(4 + wave * 20),
      packetLossPct: round1(wave * 0.8),
      lastSeenAt: now - Math.floor(noise(key, tick + 1) * 2) * 1000,
      errorCount: c.errorCount,
    };
  });
}
