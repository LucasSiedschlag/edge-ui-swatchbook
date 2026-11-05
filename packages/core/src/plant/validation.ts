import type { LineType, RecipeVersion } from '../mock/types';
import { checkRecipeVersion, type RuleResult } from './rules';

/** Incomplete working copies are allowed, but ambiguous identities or values never enter Plant State. */
export function validateVersion(version: RecipeVersion, lineType: LineType): { valid: boolean; rules: RuleResult[] } {
  const ids = new Set<string>(), keys = new Set<string>();
  let valid = true;
  const unique = (id: string) => {
    if (ids.has(id)) valid = false;
    ids.add(id);
  };
  for (const [index, step] of version.steps.entries()) {
    unique(step.id);
    if (step.order !== index + 1) valid = false;
    for (const parameter of step.parameters) {
      unique(parameter.id);
      if (keys.has(parameter.key)) valid = false;
      keys.add(parameter.key);
      if (![parameter.min, parameter.setpoint, parameter.max].every(Number.isFinite) || parameter.min > parameter.setpoint || parameter.setpoint > parameter.max) valid = false;
    }
  }
  return { valid, rules: valid ? checkRecipeVersion(version, lineType) : [] };
}
