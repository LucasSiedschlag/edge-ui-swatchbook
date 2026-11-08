import deckSpec from '../../../../../docs/screens/01-operations-live-deck.md?raw';
import recipesSpec from '../../../../../docs/screens/02-interactive-recipe-lab.md?raw';
import ledgerSpec from '../../../../../docs/screens/03-batch-and-lot-ledger.md?raw';
import performanceSpec from '../../../../../docs/screens/04-plant-performance-center.md?raw';
import parametersSpec from '../../../../../docs/screens/05-live-parameter-matrix.md?raw';
import controlSpec from '../../../../../docs/screens/06-control-room-command.md?raw';
import { describe, expect, it } from 'vitest';
import { en, ptBR, type MessageKey } from '../messages';

// This manifest names UI elements, not layouts. Exact action rows and State lines
// come from the specs. Prose semantics, translations and native rendering need review.
type Elements = Record<string, readonly MessageKey[]>;
interface ScreenCoverage { file: string; shows: Elements; actions: Elements; states: Elements }
const manifest: Record<string, ScreenCoverage> = {
  deck: {
    file: "01-operations-live-deck.md",
    shows: {
      "Line selector": [
        "scope.line",
      ],
      "Line status": [
        "deck.line-status", "deck.stop-reason", "line-status.running", "line-status.stopped",
        "line-status.alarm", "stop-reason.paused", "stop-reason.emergency-stop", "stop-reason.fault",
      ],
      "Active Batch": [
        "deck.batch", "common.batch-id", "term.lot", "common.product",
        "event-target.recipe-version", "common.start", "deck.batch-elapsed", "deck.batch-progress",
        "deck.batch-produced", "deck.batch-target",
      ],
      "Live KPIs": [
        "deck.kpis", "deck.kpi-oee", "deck.kpi-output", "deck.kpi-cycle",
        "deck.kpi-takt", "deck.kpi-speed", "deck.kpi-scrap", "deck.kpi-empty",
      ],
      "Critical alarm banner": [
        "deck.alarm-banner", "deck.alarm-count", "term.machine", "common.message",
        "common.age",
      ],
      "Current Shift": [
        "deck.shift", "deck.shift-remaining", "common.start", "common.end",
        "deck.shift-empty",
      ],
    },
    actions: {
      "Pause": [
        "action.pause",
      ],
      "Resume": [
        "action.resume",
      ],
      "Emergency stop": [
        "action.emergency-stop", "deck.estop-confirm.title", "deck.estop-confirm.body", "action.emergency-stop",
        "action.cancel", "action.confirm",
      ],
      "Reset": [
        "action.reset",
      ],
      "Shift handover": [
        "action.shift-handover", "deck.handover", "deck.handover-note", "deck.handover-placeholder",
        "action.submit-handover", "action.cancel",
      ],
      "Expand or collapse banner": [
        "action.expand-banner", "action.collapse-banner",
      ],
    },
    states: {
      "Running, Stopped (three reasons), Alarm.": [
        "line-status.running", "line-status.stopped", "line-status.alarm", "stop-reason.paused",
        "stop-reason.emergency-stop", "stop-reason.fault",
      ],
      "No active Batch on the Line: the Batch block shows an empty state.": [
        "deck.batch-empty",
      ],
      "No Critical Alarms: the banner shows zero and cannot expand.": [
        "deck.alarm-empty",
      ],
    },
  },
  recipes: {
    file: "02-interactive-recipe-lab.md",
    shows: {
      "Recipe library": [
        "recipes.library", "recipes.column-recipe-id", "recipes.column-name", "common.product",
        "recipes.filter-line-type", "recipes.column-version", "recipes.filter-status", "recipes.search-placeholder",
        "common.search", "common.row-count",
      ],
      "Recipe Version view": [
        "recipes.version", "recipes.steps", "recipes.step-number", "recipes.step-kind",
        "recipes.parameters", "common.parameter", "common.name", "term.setpoint",
        "common.minimum", "common.maximum", "common.unit", "recipes.version-empty",
        "recipes.steps-empty", "recipes.parameters-empty",
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
        "action.recipe-discard",
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
  },
  ledger: {
    file: "03-batch-and-lot-ledger.md",
    shows: {
      "Columns": [
        "ledger.grid", "common.batch-id", "term.lot", "ledger.column.upstream-lot",
        "scope.area", "scope.line", "common.product", "event-target.recipe-version",
        "event-target.shift", "common.start", "common.end", "common.duration",
        "common.status", "ledger.column.yield", "ledger.column.scrap", "common.row-count",
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
        "common.sort", "common.sort-ascending", "common.sort-descending",
      ],
      "Filter by column": [
        "ledger.filter-column", "common.filter", "common.from", "common.to",
      ],
      "Clear filters": [
        "action.clear-filters", "common.row-count",
      ],
      "Select rows": [
        "ledger.select-batch", "ledger.selected-hidden", "common.selected-count", "common.select-item",
        "ledger.result.selected", "ledger.result.deselected",
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
  },
  performance: {
    file: "04-plant-performance-center.md",
    shows: {
      "Scope and range": [
        "performance.scope", "performance.range", "scope.site", "scope.area",
        "scope.line", "range.last-shift", "range.last-24h", "range.last-7d",
        "range.last-30d",
      ],
      "OEE": [
        "deck.kpi-oee", "performance.availability", "performance.performance", "performance.quality",
        "performance.previous", "performance.change", "common.change", "performance.oee-empty", "performance.comparison-empty",
        "performance.quality-empty",
      ],
      "Downtime Pareto": [
        "performance.pareto", "performance.pareto-caption", "performance.pareto-reason", "performance.reason",
        "performance.minutes", "performance.share", "performance.series.cumulative-percentage", "performance.pareto-empty",
      ],
      "Output versus target": [
        "performance.output", "performance.output-caption", "performance.bucket", "performance.hour",
        "performance.day", "performance.series.good", "performance.series.scrap", "performance.series.target",
        "common.value", "performance.output-empty",
      ],
      "Shift performance history": [
        "performance.shift-history", "performance.shift-history-caption", "event-target.shift", "common.start",
        "deck.kpi-oee", "performance.shift-output", "performance.best", "performance.worst",
        "performance.shift-history-empty",
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
        "performance.pareto-reason", "performance.minutes", "performance.share",
      ],
    },
    states: {
      "A scope and range with no units and no run minutes: one whole Screen `performance.empty` element when `hasProduction` is false, since all blocks are empty together. If the previous range has no production, the OEE comparison is empty. Quality is empty when no units were made.": [
        "performance.empty", "performance.oee-empty", "performance.comparison-empty", "performance.quality-empty", "performance.pareto-empty",
        "performance.output-empty", "performance.shift-history-empty",
      ],
      "Last shift is the most recent completed Shift and does not change; Last 24 hours includes the current Shift and updates each tick; Last 7 and Last 30 days are fixed history up to load and do not change during the session.": [
        "performance.range-help",
      ],
    },
  },
  parameters: {
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
        "parameters.select-tag", "trend-error.trend-limit",
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
        "action.reset-to-recipe", "plant-error.no-recipe-value",
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
  },
  control: {
    file: "06-control-room-command.md",
    shows: {
      "Active alarm list": [
        "control.alarms", "control.alarm-priority", "control.alarm-state", "scope.line",
        "term.machine", "common.message", "control.alarm-raised", "common.age",
        "control.alarm-acknowledged-by", "control.select-alarm",
      ],
      "Event Log": [
        "term.event-log", "common.time", "control.event-user", "control.event-role",
        "control.event-action", "control.event-target", "control.event-target-kind", "control.event-old-value",
        "control.event-new-value", "control.event-note", "common.change", "control.event-range",
      ],
      "Communication diagnostics": [
        "control.diagnostics", "term.machine", "parameters.link-status", "control.diagnostics-latency",
        "control.diagnostics-packet-loss", "control.diagnostics-heartbeat", "control.diagnostics-error-count", "control.diagnostics-empty",
      ],
    },
    actions: {
      "Filter Alarms": [
        "control.filter-alarms", "control.alarm-priority", "control.alarm-state", "scope.area",
        "scope.line",
      ],
      "Acknowledge": [
        "action.alarm-acknowledge",
      ],
      "Filter the Event Log": [
        "control.filter-events", "control.event-user", "control.event-action", "control.event-range",
      ],
      "Sort diagnostics": [
        "control.diagnostics-sort", "common.sort", "parameters.link-status", "control.diagnostics-latency",
        "control.diagnostics-packet-loss", "term.machine",
      ],
    },
    states: {
      "No active Alarms: empty state in the list.": [
        "control.alarm-empty",
      ],
      "Event Log filter with no match: empty state.": [
        "control.event-empty",
      ],
      "Offline Machine: shown first in diagnostics and linked to its Alarm if one exists.": [
        "link-status.offline", "control.open-machine-alarm",
      ],
      "Acknowledging an Alarm that is already acknowledged: no change, no log entry.": [
        "control.already-acknowledged",
      ],
    },
  },
};

function section(spec: string, heading: string): string {
  const body = spec.split(`## ${heading}\n`)[1];
  if (body === undefined) throw new Error(`Missing spec section: ${heading}`);
  return body.split('\n## ')[0]!;
}

const specs: Record<string, string> = { deck: deckSpec, recipes: recipesSpec, ledger: ledgerSpec, performance: performanceSpec, parameters: parametersSpec, control: controlSpec };

const files = {
  deck: '01-operations-live-deck.md', recipes: '02-interactive-recipe-lab.md',
  ledger: '03-batch-and-lot-ledger.md', performance: '04-plant-performance-center.md',
  parameters: '05-live-parameter-matrix.md', control: '06-control-room-command.md',
};

describe('Screen spec coverage', () => {
  it('has a required-element manifest for all six Screens', () => {
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(files).sort());
  });

  for (const [screen, file] of Object.entries(files)) {
    it(`${screen} covers every Shows item, action row and State line`, () => {
      const entry = manifest[screen];
      expect(entry, `${screen} manifest`).toBeDefined();
      if (!entry) return;
      expect(entry.file).toBe(file);
      const spec = specs[screen]!;
      const actions = section(spec, 'Actions').split('\n').filter(line => /^\| [^|-]/.test(line))
        .map(line => line.split('|')[1]!.trim()).filter(action => action !== 'Action');
      const states = [...section(spec, 'States').matchAll(/^- (.+)$/gm)].map(match => match[1]!);
      const shows = [...section(spec, 'Shows').matchAll(/^- \*\*([^*]+)\*\*/gm)].map(match => match[1]!.replace(/\.$/, ''));
      if (screen === 'ledger') shows.push('Columns'); // This spec uses a prose column list.
      expect(Object.keys(entry.actions)).toEqual(actions);
      expect(Object.keys(entry.states)).toEqual(states);
      expect(Object.keys(entry.shows)).toEqual(shows);
      for (const group of [entry.shows, entry.actions, entry.states]) {
        for (const [element, keys] of Object.entries(group)) {
          expect(keys.length, element).toBeGreaterThan(0);
          for (const key of keys) {
            expect(Object.hasOwn(en, key), element + ': ' + key).toBe(true);
            expect(Object.hasOwn(ptBR, key), element + ': ' + key).toBe(true);
          }
        }
      }
      const referenced = new Set(Object.values(entry).flatMap(value =>
        typeof value === 'string' ? [] : Object.values(value).flat()));
      for (const key of Object.keys(en).filter(key => key.startsWith(`${screen}.`))) {
        expect(referenced.has(key as MessageKey), `${key} needs a required-element reference`).toBe(true);
      }
    });
  }
});

it('names the 14 Ledger columns in the order required by the spec', () => {
  const columnKeys: readonly MessageKey[] = [
    'common.batch-id', 'term.lot', 'ledger.column.upstream-lot', 'scope.area',
    'scope.line', 'common.product', 'event-target.recipe-version', 'event-target.shift',
    'common.start', 'common.end', 'common.duration', 'common.status',
    'ledger.column.yield', 'ledger.column.scrap',
  ];
  const prose = section(ledgerSpec, 'Shows').match(/with these columns: ([^.]+)\./)![1]!;
  const names = prose.replace(/\([^)]*\)/g, '').split(/,| and /).map(name => name.trim().toLowerCase());
  expect(names).toHaveLength(14);
  expect(columnKeys.map(key => en[key].toLowerCase())).toEqual(names);
});
