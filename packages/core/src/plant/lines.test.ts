import { describe, expect, it } from 'vitest';
import { generateMockDataset } from '../mock/generate';
import { simulatedTime } from '../sim/clock';
import { simulate } from '../sim/simulate';
import { createPlantState, lineStatus, reduce } from './index';
import type { PlantState } from './index';

const d = generateMockDataset();
const start = () => createPlantState(d);
const at = (tick: number) => ({ tick });

/** Runs an action and returns the new state, failing the test if it was refused. */
function ok(state: PlantState, action: Parameters<typeof reduce>[1], tick: number) {
  const r = reduce(state, action, at(tick));
  if (!r.ok) throw new Error(`refused: ${r.error.code}`);
  return r;
}

describe('Line status at the start', () => {
  const s = start();

  it('shows Alarm on a Line with an active Critical Alarm', () => {
    expect(lineStatus(s, 'E1', 0)).toMatchObject({ status: 'alarm', criticalAlarms: 1 });
  });

  it('shows Stopped with reason Fault on a Line with an Offline Machine', () => {
    expect(lineStatus(s, 'A2', 0)).toMatchObject({ status: 'stopped', reason: 'fault' });
  });

  it('shows Running on the other Lines, including the idle one', () => {
    for (const id of ['E2', 'RF1', 'P1', 'C1', 'A1'] as const) expect(lineStatus(s, id, 0)).toMatchObject({ status: 'running', reason: null });
  });

  it('starts with the Event Log of the Mock Dataset and the first Operator as the current User', () => {
    expect(s.events).toHaveLength(d.events.length);
    expect(d.users.find((u) => u.id === s.currentUserId)?.role).toBe('operator');
  });
});

describe('Pause and Resume', () => {
  it('stops a Line from the tick of the Pause and logs one entry', () => {
    const r = ok(start(), { type: 'pause', lineId: 'E2' }, 100);
    expect(lineStatus(r.state, 'E2', 100)).toMatchObject({ status: 'stopped', reason: 'paused' });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ action: 'pause', targetKind: 'line', target: 'E2', at: simulatedTime(100), userId: start().currentUserId });
    expect(r.state.events).toHaveLength(d.events.length + 1);
  });

  it('does not change the state it was given', () => {
    const before = start();
    const copy = JSON.stringify(before.events) + JSON.stringify(before.controls);
    ok(before, { type: 'pause', lineId: 'E2' }, 10);
    expect(JSON.stringify(before.events) + JSON.stringify(before.controls)).toBe(copy);
  });

  it('runs the Line again on Resume, and the Overlay counts only the ticks it ran', () => {
    const paused = ok(start(), { type: 'pause', lineId: 'E2' }, 100).state;
    expect(paused.overlay.runTicks?.('E2', 0, 200)).toBe(100);
    const resumed = ok(paused, { type: 'resume', lineId: 'E2' }, 160);
    expect(lineStatus(resumed.state, 'E2', 160)).toMatchObject({ status: 'running' });
    expect(resumed.events[0]).toMatchObject({ action: 'resume', target: 'E2' });
    expect(resumed.state.overlay.runTicks?.('E2', 0, 200)).toBe(140);
    expect(resumed.state.overlay.runTicks?.('E1', 0, 200)).toBe(200);
  });

  it('does nothing, and logs nothing, for a Pause on a paused Line or a Resume on a running one', () => {
    const paused = ok(start(), { type: 'pause', lineId: 'E2' }, 100).state;
    const again = ok(paused, { type: 'pause', lineId: 'E2' }, 120);
    expect(again.events).toEqual([]);
    expect(again.state.controls).toEqual(paused.controls);
    expect(ok(start(), { type: 'resume', lineId: 'E2' }, 5).events).toEqual([]);
  });

  it('refuses a Resume while the Line has an active Critical Alarm', () => {
    const paused = ok(start(), { type: 'pause', lineId: 'E1' }, 50).state;
    const r = reduce(paused, { type: 'resume', lineId: 'E1' }, at(60));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('critical-alarm-active');
  });

  it('keeps a Line with an Offline Machine stopped for Fault, whatever is pressed', () => {
    const paused = ok(start(), { type: 'pause', lineId: 'A2' }, 5).state;
    expect(lineStatus(paused, 'A2', 5).reason).toBe('fault');
    const r = ok(paused, { type: 'resume', lineId: 'A2' }, 10);
    expect(lineStatus(r.state, 'A2', 10)).toMatchObject({ status: 'stopped', reason: 'fault' });
    expect(r.state.overlay.runTicks?.('A2', 0, 500)).toBe(0);
  });
});

describe('Emergency stop and Reset', () => {
  it('needs a confirmation', () => {
    const r = reduce(start(), { type: 'emergency-stop', lineId: 'E2', confirmed: false }, at(10));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('confirmation-required');
  });

  it('latches the Line until Reset, and Reset leaves it stopped until Resume', () => {
    const stopped = ok(start(), { type: 'emergency-stop', lineId: 'E2', confirmed: true }, 100);
    expect(lineStatus(stopped.state, 'E2', 100)).toMatchObject({ status: 'stopped', reason: 'emergency-stop' });
    expect(stopped.events[0]).toMatchObject({ action: 'emergency-stop', target: 'E2' });

    const refused = reduce(stopped.state, { type: 'resume', lineId: 'E2' }, at(110));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('latched');

    const reset = ok(stopped.state, { type: 'reset', lineId: 'E2' }, 120);
    expect(reset.events[0]).toMatchObject({ action: 'reset', target: 'E2' });
    expect(lineStatus(reset.state, 'E2', 120)).toMatchObject({ status: 'stopped', reason: 'paused' });

    const running = ok(reset.state, { type: 'resume', lineId: 'E2' }, 130);
    expect(lineStatus(running.state, 'E2', 130)).toMatchObject({ status: 'running' });
    expect(running.state.overlay.runTicks?.('E2', 0, 200)).toBe(100 + 0 + 70);
  });

  it('keeps the Emergency stop reason ahead of Fault until Reset', () => {
    const stopped = ok(start(), { type: 'emergency-stop', lineId: 'A2', confirmed: true }, 10).state;
    expect(lineStatus(stopped, 'A2').reason).toBe('emergency-stop');
    const reset = ok(stopped, { type: 'reset', lineId: 'A2' }, 20).state;
    expect(lineStatus(reset, 'A2').reason).toBe('fault');
    expect(lineStatus(reset, 'A2', 15).reason).toBe('emergency-stop');
  });

  it('does nothing for a Reset that is not needed', () => {
    const r = ok(start(), { type: 'reset', lineId: 'E2' }, 10);
    expect(r.events).toEqual([]);
  });
});

describe('the current User', () => {
  it('is changed without a log entry, and used by later actions', () => {
    const engineer = d.users.find((u) => u.role === 'engineer');
    const changed = ok(start(), { type: 'set-user', userId: engineer?.id ?? '' }, 5);
    expect(changed.events).toEqual([]);
    const r = ok(changed.state, { type: 'pause', lineId: 'E2' }, 6);
    expect(r.events[0]?.userId).toBe(engineer?.id);
  });

  it('refuses a User that does not exist', () => {
    const r = reduce(start(), { type: 'set-user', userId: 'U99' }, at(1));
    expect(r.ok).toBe(false);
  });
});

describe('with the Simulator', () => {
  it('stops a paused Line making product, and keeps the Fault Line at zero from the start', () => {
    const paused = ok(start(), { type: 'pause', lineId: 'E2' }, 60).state;
    const before = simulate(d, 59, paused.overlay).lines.find((l) => l.lineId === 'E2');
    const after = simulate(d, 600, paused.overlay).lines.find((l) => l.lineId === 'E2');
    expect(before?.lineSpeed?.value).toBeGreaterThan(0);
    expect(after?.lineSpeed?.value).toBe(0);
    expect(after?.batch?.producedUnits).toBe(simulate(d, 61, paused.overlay).lines.find((l) => l.lineId === 'E2')?.batch?.producedUnits);
    expect(simulate(d, 0, paused.overlay).lines.find((l) => l.lineId === 'A2')?.outputThisShift).toBe(0);
  });
});
