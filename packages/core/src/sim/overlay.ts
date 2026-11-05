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
 *
 * Steps only ever get added at the end. Reset to recipe value is a new step with the recipe value, never the removal of earlier
 * steps, because that would redraw the past and change what the alarm history says. The alarm state of an overridden Tag is
 * kept from one call to the next and is cut back to the first changed step if the list changes.
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
