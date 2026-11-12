import type { MessageKey } from '../messages';

type Elements = Record<string, readonly MessageKey[]>;
export const recipesCoverage = {
  file: "02-interactive-recipe-lab.md",
  shows: {
    "Recipe library": [
      "recipes.library", "recipes.column-recipe-id", "recipes.column-name", "common.product",
      "recipes.filter-line-type", "recipes.column-version", "recipes.filter-status", "recipes.search-placeholder",
      "common.search", "common.row-count.other",
    ],
    "Recipe Version view": [
      "recipes.version", "recipes.steps", "recipes.step-number", "recipes.step-kind",
      "recipes.parameters", "common.parameter", "common.name", "term.setpoint",
      "common.minimum", "common.maximum", "common.unit", "recipes.version-empty",
      "recipes.steps-empty", "recipes.parameters-empty", "recipes.no-addable-step", "recipes.first-step", "recipes.last-step",
    ],
    "Dependency check panel": [
      "recipes.dependency-check", "recipes.rules-empty", "rule-status.pass", "rule-status.fail",
      "rule-status.not-applicable", "recipes.violation.below-min", "recipes.violation.above-max", "recipes.violation.adjacent-too-far",
      "recipes.violation.missing",
    ],
  },
  actions: {
    "Open a Recipe Version": [
      "recipes.open-version",
    ],
    "New Draft": [
      "action.recipe-new-draft",
    ],
    "Add, remove or reorder Steps": [
      "action.add-step", "action.remove-step", "action.move-up", "action.move-down",
    ],
    "Edit Parameter values": [
      "recipes.edit-parameters", "common.minimum", "term.setpoint", "common.maximum",
    ],
    "Save Draft": [
      "action.recipe-save",
    ],
    "Approve": [
      "action.recipe-approve",
    ],
    "Discard Draft": [
      "action.recipe-discard", "recipes.discard-confirm", "action.cancel",
    ],
  },
  states: {
    "Library filter with no match: `recipes.library-empty`. If no Recipe Version is open either, show one whole Screen `recipes.empty` instead.": [
      "recipes.library-empty", "recipes.empty",
    ],
    "Draft with failing rules, Draft with all rules passing, Approved read-only.": [
      "recipes.draft-failing", "recipes.draft-passing", "recipes.approved-read-only",
    ],
    "Field error (min, setpoint, max out of order).": [
      "plant-error.parameter-order",
    ],
  },
} as const satisfies { file: string; shows: Elements; actions: Elements; states: Elements };
