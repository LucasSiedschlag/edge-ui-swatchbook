import type { MessageKey } from '../messages';

type Elements = Record<string, readonly MessageKey[]>;
export const parametersCoverage = {
  file: "05-live-parameter-matrix.md",
  shows: {
    "Tag grid": [
      "parameters.grid", "scope.line", "term.machine", "parameters.tag-name",
      "parameters.current-value", "common.unit", "term.setpoint", "common.minimum",
      "common.maximum", "common.status",
    ],
    "Trend": [
      "parameters.trend", "parameters.trend-caption", "parameters.trend-window", "parameters.series",
      "common.time", "common.value", "common.status", "common.minimum",
      "common.maximum", "term.setpoint", "parameters.series.limit",
      "trend-error.trend-limit", "trend-error.duplicate-tag", "trend-error.unknown-tag",
      "trend-window.last-5m", "trend-window.last-30m", "trend-window.last-2h",
    ],
    "Connectivity": [
      "parameters.connectivity", "parameters.link-status", "parameters.last-seen", "parameters.connectivity-empty",
    ],
  },
  actions: {
    "Filter": [
      "common.filter", "scope.line", "term.machine", "common.status",
      "parameters.search-placeholder",
    ],
    "Select Tags for the trend": [
      "parameters.select-tag", "parameters.select-all-tags", "trend-error.trend-limit",
    ],
    "Change trend window": [
      "parameters.trend-window",
    ],
    "Setpoint Override": [
      "parameters.override", "parameters.override-value", "parameters.override-reason", "parameters.override-reason-placeholder",
      "action.setpoint-override", "action.cancel", "plant-error.tag-not-writable", "plant-error.reason-required",
      "plant-error.invalid-value", "plant-error.value-out-of-range",
    ],
    "Reset to recipe value": [
      "action.reset-to-recipe", "parameters.recipe-value", "plant-error.no-recipe-value",
    ],
  },
  states: {
    "Tag out of limits: High or Low, and shown as such.": [
      "tag-status.high", "tag-status.low",
    ],
    "Stale Tag on an Offline Machine: no Setpoint Override allowed.": [
      "tag-status.stale", "link-status.offline", "plant-error.tag-stale",
    ],
    "No Tag matches the filter: `parameters.grid-empty`.": [
      "parameters.grid-empty",
    ],
    "No Tag selected for the trend: `parameters.trend-empty` asks to select Tags.": [
      "trend-error.nothing-selected",
    ],
    "If the whole Screen has no content, show one `parameters.empty` instead of the block empty states.": [
      "parameters.empty",
    ],
  },
} as const satisfies { file: string; shows: Elements; actions: Elements; states: Elements };
