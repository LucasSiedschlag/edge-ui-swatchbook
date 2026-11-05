import type { LineId, Tag } from '../mock/types';

export interface SetpointStep {
  /** The first tick that uses `value`. Plant State applies an override at the action tick. */
  fromTick: number;
  value: number;
}

/**
 * What Plant State (Issue #3) layers on top of the Simulator. The Mock Dataset stays untouched, so the past is never redrawn.
 * An Overlay object is immutable. Any change requires a new object.
 * `setpoints` is a timeline per Tag, sorted by tick. `runTicks` says how many ticks a Line ran between two ticks, so a
 * Pause or an Emergency stop stops production.
 *
 * Steps only ever get added at the end. Reset to recipe value is a new step with the recipe value, never the removal of earlier
 * steps, because that would redraw the past and change what the alarm history says. The alarm state of an overridden Tag is
 * kept from one call to the next and is cut back to the first changed step if the list changes.
 *
 * A second change of the same Tag in the same tick replaces the last step, so the list never repeats a tick. An override that
 * differs from the recipe value (the Tag's setpoint in the Mock Dataset) also ends the hold of an Alarm open at load, so the
 * Tag follows the operator from that tick.
 *
 * `runTicks` must be pure and additive: `runTicks(a, c)` equals `runTicks(a, b) + runTicks(b, c)`. The Simulator also asks about
 * the next second (`tick`, `tick + 1`) to know whether a Line is making product now.
 */
export interface Overlay {
  setpoints?: ReadonlyMap<string, readonly SetpointStep[]>;
  runTicks?: (lineId: LineId, fromTick: number, toTick: number) => number;
}

/** Refuses override steps that are not in strictly rising tick order, because the latch and the lookup rely on it. */
export function assertOverlay(overlay: Overlay | undefined): void {
  for (const [tagId, steps] of overlay?.setpoints ?? []) {
    for (const step of steps) {
      if (!Number.isInteger(step.fromTick) || !Number.isFinite(step.value)) {
        throw new Error(`override steps of ${tagId} need integer ticks and finite values`);
      }
    }
    for (let i = 1; i < steps.length; i++) {
      if ((steps[i] as SetpointStep).fromTick <= (steps[i - 1] as SetpointStep).fromTick) {
        throw new Error(`override steps of ${tagId} must be in rising tick order`);
      }
    }
  }
}

export function setpointAt(overlay: Overlay | undefined, tag: Tag, tick: number): number {
  const steps = overlay?.setpoints?.get(tag.id);
  if (!steps || steps.length === 0) return tag.setpoint;
  // Last step at or before the tick, by binary search over the sorted steps.
  let lo = 0;
  let hi = steps.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((steps[mid] as SetpointStep).fromTick <= tick) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans < 0 ? tag.setpoint : (steps[ans] as SetpointStep).value;
}

export function runTicksOf(overlay: Overlay | undefined, lineId: LineId, fromTick: number, toTick: number): number {
  return overlay?.runTicks ? overlay.runTicks(lineId, fromTick, toTick) : toTick - fromTick;
}
