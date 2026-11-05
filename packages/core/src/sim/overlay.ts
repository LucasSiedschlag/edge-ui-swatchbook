import type { LineId, Tag } from '../mock/types';

export interface SetpointStep {
  /** The first tick that uses `value`. Plant State applies an override from the next tick. */
  fromTick: number;
  value: number;
}

/**
 * What Plant State (Issue #3) layers on top of the Simulator. The Mock Dataset stays untouched, so the past is never redrawn.
 * `setpoints` is a timeline per Tag, sorted by tick. `runTicks` says how many ticks a Line ran between two ticks, so a
 * Pause or an Emergency stop stops production.
 */
export interface Overlay {
  setpoints?: ReadonlyMap<string, readonly SetpointStep[]>;
  runTicks?: (lineId: LineId, fromTick: number, toTick: number) => number;
}

export function setpointAt(overlay: Overlay | undefined, tag: Tag, tick: number): number {
  const steps = overlay?.setpoints?.get(tag.id);
  if (!steps) return tag.setpoint;
  let value = tag.setpoint;
  for (const s of steps) if (s.fromTick <= tick) value = s.value;
  return value;
}

export function runTicksOf(overlay: Overlay | undefined, lineId: LineId, fromTick: number, toTick: number): number {
  return overlay?.runTicks ? overlay.runTicks(lineId, fromTick, toTick) : toTick - fromTick;
}
