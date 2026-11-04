import { describe, expect, it } from 'vitest';
import { generateMockDataset } from './generate';

const d = generateMockDataset();

describe('plant layout', () => {
  it('has 3 Areas, 7 Lines and 27 Machines', () => {
    expect(d.areas.map((a) => a.id)).toEqual(['extrusion', 'metalworking', 'assembly']);
    expect(d.lines.map((l) => l.id)).toEqual(['E1', 'E2', 'RF1', 'P1', 'C1', 'A1', 'A2']);
    expect(d.machines).toHaveLength(27);
  });

  it('matches the machine counts per Line', () => {
    const count = (id: string) => d.machines.filter((m) => m.lineId === id).length;
    expect(['E1', 'E2', 'RF1', 'P1', 'C1', 'A1', 'A2'].map(count)).toEqual([5, 5, 3, 1, 1, 6, 6]);
  });

  it('puts every Line in an Area and every Machine on a Line', () => {
    for (const l of d.lines) expect(d.areas.some((a) => a.id === l.areaId)).toBe(true);
    for (const m of d.machines) expect(d.lines.some((l) => l.id === m.lineId)).toBe(true);
  });

  it('has unique Machine ids', () => {
    expect(new Set(d.machines.map((m) => m.id)).size).toBe(27);
  });

  it('has at least one Offline and one Degraded Machine link', () => {
    const s = d.machines.map((m) => m.comms.status);
    expect(s).toContain('offline');
    expect(s).toContain('degraded');
  });
});

describe('users', () => {
  it('has about 15 Users covering all four Roles', () => {
    expect(d.users).toHaveLength(15);
    expect(new Set(d.users.map((u) => u.role))).toEqual(
      new Set(['operator', 'engineer', 'technician', 'manager']),
    );
    expect(new Set(d.users.map((u) => u.id)).size).toBe(15);
  });
});
