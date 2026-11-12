import type { MessageKey } from '../messages';

// Shared by spec coverage and Library rendering tests.
type Elements = Record<string, readonly MessageKey[]>;
export const ledgerCoverage = {
  file: "03-batch-and-lot-ledger.md",
  shows: {
    "Columns": [
      "ledger.grid", "common.batch-id", "term.lot", "ledger.column.upstream-lot",
      "scope.area", "scope.line", "common.product", "event-target.recipe-version",
      "event-target.shift", "common.start", "common.end", "common.duration",
      "common.status", "ledger.column.yield", "ledger.column.scrap", "common.row-count.other",
      "ledger.filter-column", "ledger.search-placeholder", "ledger.compare-panel", "ledger.drawer.header",
      "ledger.drawer.genealogy", "ledger.drawer.parameters", "ledger.drawer.alarms", "ledger.genealogy.material-lot",
      "ledger.genealogy.extrusion-run", "ledger.genealogy.metalwork-lot", "ledger.genealogy.assembly-serial", "common.actual",
      "term.setpoint", "common.deviation", "common.deviation-percent", "common.minimum",
      "common.maximum", "common.unit", "ledger.inside-limits", "ledger.outside-limits",
      "ledger.genealogy-empty", "ledger.parameters-empty", "ledger.alarms-empty", "ledger.result.unknown-batch",
      "action.close",
    ],
  },
  actions: {
    "Sort": [
      "common.sort-ascending", "common.sort-descending", "ledger.sort-default",
    ],
    "Filter by column": [
      "ledger.filter-column", "common.filter", "ledger.filter-count", "common.from", "common.to", "ledger.duration-minutes",
    ],
    "Clear filters": [
      "action.clear-filters", "common.row-count.other",
    ],
    "Select rows": [
      "ledger.select-batch", "ledger.selected-hidden.other", "common.selected-count.other",
      "ledger.result.selected", "ledger.result.deselected", "ledger.select-all",
    ],
    "Compare": [
      "action.compare", "ledger.compare-panel", "ledger.result.compare-count",
    ],
    "Open details": [
      "ledger.open-details", "ledger.drawer.header", "action.close",
    ],
  },
  states: {
    "Filters match nothing: empty state with the active filters listed.": [
      "ledger.empty", "ledger.active-filters",
    ],
    "Fewer than 2 Batches selected: Compare is disabled.": [
      "ledger.result.compare-count",
    ],
    "Fifth selection attempted: limit message.": [
      "ledger.result.selection-limit",
    ],
  },
} as const satisfies { file: string; shows: Elements; actions: Elements; states: Elements };
