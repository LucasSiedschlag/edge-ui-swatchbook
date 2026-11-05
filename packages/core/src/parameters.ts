import type { MockDataset, Parameter, RecipeVersion, Tag } from './mock/types';

/** Reject ambiguity rather than letting consumers choose different copies of a key. */
export function parametersByKey(version: RecipeVersion): ReadonlyMap<string, Parameter> {
  const parameters = new Map<string, Parameter>();
  for (const step of version.steps) for (const parameter of step.parameters) {
    if (parameters.has(parameter.key)) throw new Error(`duplicate Parameter key ${parameter.key} in ${version.id}`);
    parameters.set(parameter.key, parameter);
  }
  return parameters;
}

export function activeRecipeParameter(dataset: MockDataset, tag: Tag): Parameter | undefined {
  if (!tag.parameterKey) return undefined;
  const batch = dataset.activeBatches.find(b => b.lineId === tag.lineId);
  const version = dataset.recipeVersions.find(v => v.id === batch?.recipeVersionId);
  return version ? parametersByKey(version).get(tag.parameterKey) : undefined;
}
