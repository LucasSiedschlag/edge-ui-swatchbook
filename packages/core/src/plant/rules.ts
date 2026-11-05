import type { LineType, RecipeVersion } from '../mock/types';

export type RuleId = 1 | 2 | 3 | 4;
export type ViolationKind = 'below-min' | 'above-max' | 'adjacent-too-far';
export interface RuleViolation { parameterKeys: string[]; kind: ViolationKind; limit: number; actual: number }
export interface RuleResult { rule: RuleId; status: 'pass' | 'fail' | 'not-applicable'; violations: RuleViolation[] }
export const BARREL_MIN = 165, BARREL_MAX = 195, BARREL_STEP_MAX = 15, WELD_TEMP_MIN = 240, WELD_TEMP_MAX = 270, WELD_TIME_MIN = 20, WELD_TIME_MAX = 40, TAKT_SECONDS = 120;

// This is a design suggestion, not a verified production value.
export function diePressureLimit(screwSpeedRpm: number): number { return 150 + 4 * screwSpeedRpm; }

export function checkRecipeVersion(version: RecipeVersion, lineType: LineType): RuleResult[] {
  const values = new Map(version.steps.flatMap(step => step.parameters.map(p => [p.key, p.setpoint] as const)));
  const barrel: RuleViolation[] = [], pressure: RuleViolation[] = [], weld: RuleViolation[] = [], takt: RuleViolation[] = [];
  const window = (out: RuleViolation[], key: string, min: number, max: number) => {
    const actual = values.get(key);
    if (actual === undefined) return;
    if (actual < min) out.push({ parameterKeys: [key], kind: 'below-min', limit: min, actual });
    else if (actual > max) out.push({ parameterKeys: [key], kind: 'above-max', limit: max, actual });
  };
  const zones = [1, 2, 3, 4, 5].map(n => `barrel-zone-${n}`);
  for (const zone of zones) window(barrel, zone, BARREL_MIN, BARREL_MAX);
  for (let i = 0; i < zones.length - 1; i++) {
    const a = values.get(zones[i]!), b = values.get(zones[i + 1]!);
    if (a !== undefined && b !== undefined && Math.abs(a - b) > BARREL_STEP_MAX) barrel.push({ parameterKeys: [zones[i]!, zones[i + 1]!], kind: 'adjacent-too-far', limit: BARREL_STEP_MAX, actual: Math.abs(a - b) });
  }
  const die = values.get('die-pressure'), speed = values.get('screw-speed');
  if (die !== undefined && speed !== undefined && die > diePressureLimit(speed)) pressure.push({ parameterKeys: ['die-pressure', 'screw-speed'], kind: 'above-max', limit: diePressureLimit(speed), actual: die });
  window(weld, 'weld-temperature', WELD_TEMP_MIN, WELD_TEMP_MAX);
  window(weld, 'weld-time', WELD_TIME_MIN, WELD_TIME_MAX);
  const cycle = values.get('cycle-time');
  if (cycle !== undefined && cycle >= TAKT_SECONDS) takt.push({ parameterKeys: ['cycle-time'], kind: 'above-max', limit: TAKT_SECONDS, actual: cycle });
  return ([barrel, pressure, weld, takt] as RuleViolation[][]).map((violations, i) => {
    const applies = lineType === (i < 2 ? 'extrusion' : 'assembly');
    return { rule: (i + 1) as RuleId, status: applies ? (violations.length ? 'fail' : 'pass') : 'not-applicable', violations: applies ? violations : [] };
  });
}
export function failingRules(results: RuleResult[]): RuleId[] { return results.filter(result => result.status === 'fail').map(result => result.rule); }
