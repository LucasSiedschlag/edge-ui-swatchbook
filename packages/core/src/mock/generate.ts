import { createRng } from './prng';
import { generateMachines, AREAS, LINES } from './plant';
import { NOW } from './time';
import type { MockDataset } from './types';
import { generateAlarms } from './alarms';
import { generateEvents } from './events';
import { generateBatches } from './batches';
import { generateTags } from './tags';
import { generateHistory } from './history';
import { generateRecipes, PRODUCTS } from './recipes';
import { generateUsers } from './users';

export const DEFAULT_SEED = 20260101;

/** Each section gets its own stream, so changing one section never shifts another. */
const sectionRng = (seed: number, salt: number) => createRng((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0);

export function generateMockDataset(seed: number = DEFAULT_SEED): MockDataset {
  const machines = generateMachines(sectionRng(seed, 1));
  const recipeSection = generateRecipes(sectionRng(seed, 3));
  const batchSection = generateBatches(sectionRng(seed, 4), LINES, recipeSection.recipes, recipeSection.recipeVersions);
  const users = generateUsers(sectionRng(seed, 2));
  const tags = generateTags(sectionRng(seed, 5), machines, batchSection.activeBatches, recipeSection.recipeVersions);
  const alarms = generateAlarms(sectionRng(seed, 6), machines, tags, batchSection.batches, batchSection.activeBatches, users);
  const eventSection = generateEvents(sectionRng(seed, 8), users, alarms, tags, recipeSection.recipes, recipeSection.recipeVersions, batchSection.activeBatches, batchSection.batches, machines);
  return {
    seed,
    now: NOW,
    areas: structuredClone(AREAS),
    lines: structuredClone(LINES),
    machines,
    users,
    products: structuredClone(PRODUCTS),
    ...recipeSection,
    ...batchSection,
    tags: eventSection.tags,
    alarms,
    events: eventSection.events,
    ...generateHistory(sectionRng(seed, 7), LINES, batchSection.batches, batchSection.activeBatches),
  };
}
