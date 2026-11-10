import type { MessageKey } from '../messages';

type Elements = Record<string, readonly MessageKey[]>;
export const performanceCoverage = {
  file: "04-plant-performance-center.md",
  shows: {
    "Scope and range": [
      "performance.scope", "performance.range", "scope.site", "scope.area",
      "scope.line", "range.last-shift", "range.last-24h", "range.last-7d",
      "range.last-30d",
    ],
    "OEE": [
      "deck.kpi-oee", "performance.availability", "performance.performance", "performance.quality",
      "performance.previous", "performance.change", "performance.oee-empty", "performance.comparison-empty",
      "performance.quality-empty", "performance.previous-quality-empty",
    ],
    "Downtime Pareto": [
      "performance.pareto", "performance.pareto-caption", "performance.pareto-reason", "performance.reason",
      "performance.minutes", "performance.share", "performance.series.cumulative-percentage", "performance.pareto-empty",
    ],
    "Output versus target": [
      "performance.output", "performance.output-caption", "performance.bucket", "performance.hour",
      "performance.day", "performance.series.good", "performance.series.scrap", "performance.series.target",
      "performance.output-units", "performance.output-empty",
    ],
    "Shift performance history": [
      "performance.shift-history", "performance.shift-history-caption", "event-target.shift", "common.start",
      "deck.kpi-oee", "performance.shift-output", "performance.best", "performance.worst",
      "performance.shift-history-empty", "shift.first", "shift.second", "shift.third",
    ],
  },
  actions: {
    "Change scope": [
      "performance.scope",
    ],
    "Change range": [
      "performance.range",
    ],
    "Select a Pareto reason": [
      "performance.pareto-reason", "performance.selected-reason", "performance.minutes", "performance.share",
    ],
  },
  states: {
    "A scope and range with no units and no run minutes: one whole Screen `performance.empty` element when `hasProduction` is false, since all blocks are empty together. If the previous range has no production, the OEE comparison is empty. Quality is empty when no units were made. Previous Quality has its own message when the previous range has run minutes but no units. Output shows its empty state instead of a chart when `outputHasUnits` is false.": [
      "performance.empty", "performance.oee-empty", "performance.comparison-empty", "performance.quality-empty", "performance.pareto-empty",
      "performance.output-empty", "performance.shift-history-empty",
    ],
    "Last shift is the most recent completed Shift and does not change; Last 24 hours includes the current Shift and updates each tick; Last 7 and Last 30 days are fixed history up to load and do not change during the session.": [
      "performance.range-help",
    ],
  },
} as const satisfies { file: string; shows: Elements; actions: Elements; states: Elements };
