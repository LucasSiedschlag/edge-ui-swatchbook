import deckSpec from '../../../../../docs/screens/01-operations-live-deck.md?raw';
import recipesSpec from '../../../../../docs/screens/02-interactive-recipe-lab.md?raw';
import ledgerSpec from '../../../../../docs/screens/03-batch-and-lot-ledger.md?raw';
import performanceSpec from '../../../../../docs/screens/04-plant-performance-center.md?raw';
import parametersSpec from '../../../../../docs/screens/05-live-parameter-matrix.md?raw';
import controlSpec from '../../../../../docs/screens/06-control-room-command.md?raw';
import { describe, expect, it } from 'vitest';
import { recipesCoverage } from './recipes-coverage';
import { parametersCoverage } from './parameters-coverage';
import { performanceCoverage } from './performance-coverage';
import { controlCoverage } from './control-coverage';
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
        "deck.alarm-banner", "deck.alarm-count.other", "term.machine", "common.message",
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
      "No Batch and nothing made this Shift on the Line: the KPI block shows the empty note under the KPIs.": [
        "deck.kpi-empty",
      ],
      "No current Shift in the Snapshot: the Shift block shows an empty state.": [
        "deck.shift-empty",
      ],
    },
  },
  recipes: recipesCoverage,
  ledger: {
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
        "common.sort", "common.sort-ascending", "common.sort-descending",
      ],
      "Filter by column": [
        "ledger.filter-column", "common.filter", "common.from", "common.to",
      ],
      "Clear filters": [
        "action.clear-filters", "common.row-count.other",
      ],
      "Select rows": [
        "ledger.select-batch", "ledger.selected-hidden.other", "common.selected-count.other", "common.select-item",
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
  performance: performanceCoverage,
  parameters: parametersCoverage,
  control: controlCoverage,
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
        // A counted text has a singular and a plural key; the element references the plural one and the singular is covered with it.
        const covered = key.endsWith('.one') ? `${key.slice(0, -4)}.other` : key;
        expect(referenced.has(covered as MessageKey), `${key} needs a required-element reference`).toBe(true);
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
