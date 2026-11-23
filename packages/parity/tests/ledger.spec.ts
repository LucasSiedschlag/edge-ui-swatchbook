import type { Page } from '@playwright/test';
import { LEDGER_FILTER_COLUMNS, TEST_IDS, batchStatusLabels, ledgerFilterId, ledgerFilterLabels, shiftLabels, tCount, type LedgerFilterColumn, type Locale, type MessageKey } from '@swatchbook/core';
import { atWidth, byId, openScreen, pick, popupOptions, text } from './harness';
import { dataset, expect, name, portugueseLeaks, test } from './recipes-ledger-helpers';

const ids = TEST_IDS.ledger;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- locators ----
const grid = (page: Page) => byId(page, ids.grid);
const bodyRows = (page: Page) => grid(page).getByRole('row').filter({ has: byId(page, ids.rowSelect) });
const batchRow = (page: Page, id: string) => bodyRows(page).filter({ has: page.getByRole('cell', { name: id, exact: true }) });
const header = (page: Page, label: string) => grid(page).getByRole('columnheader').filter({ hasText: new RegExp(`^${escape(label)}$`) });
const checkbox = (page: Page, language: Locale, id: string) => page.getByRole('checkbox', { name: text(language, 'ledger.select-batch', { batch: id }) });
const openButton = (page: Page, language: Locale, id: string) => batchRow(page, id).getByRole('button', { name: text(language, 'ledger.open-details') });
const rowIds = (page: Page, count = 3) => bodyRows(page).evaluateAll((rows, n) => rows.slice(0, n).map(row => row.querySelectorAll('[role="cell"]')[1]?.textContent ?? ''), count);
const rowCount = (language: Locale, n: number) => tCount(language, 'common.row-count', n);
const textFilter = (page: Page, column: 'batchId' | 'lotId' | 'upstreamLotId') => byId(page, ledgerFilterId(column));
const bound = (page: Page, column: LedgerFilterColumn, which: 0 | 1) => byId(page, ledgerFilterId(column)).getByRole('spinbutton').nth(which);

/** Reads the grid once: the count line, the first rows and the ARIA counts must agree with the expectation. */
async function expectGrid(page: Page, language: Locale, count: number, first: string[]) {
  await expect(byId(page, ids.rowCount)).toHaveText(rowCount(language, count));
  await expect(grid(page)).toHaveAttribute('aria-rowcount', String(count === 0 ? 2 : count + 1));
  if (count > 0) await expect.poll(() => rowIds(page, first.length)).toEqual(first);
  else await expect(bodyRows(page)).toHaveCount(0);
}
const DEFAULT_FIRST = ['B-A1-01150', 'B-A2-01150', 'B-E1-00700'];
const FIRST_FIVE = ['B-A1-01150', 'B-A2-01150', 'B-E1-00700', 'B-E2-00700', 'B-A1-01149'];

async function closePopup(page: Page) { await page.keyboard.press('Escape'); await expect(popupOptions(page)).toHaveCount(0); }
async function chooseMany(page: Page, id: string, label: string) { await pick(page, id, label); await closePopup(page); }
async function dateRange(page: Page, language: Locale, column: 'start' | 'end', from: [number, number, number], to: [number, number, number]) {
  const [fy, fm, fd] = from; const [ty, tm, td] = to;
  const format = (y: number, m: number, d: number) => (language === 'pt-BR' ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` : `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`);
  const inputs = byId(page, ledgerFilterId(column)).locator('input');
  await inputs.nth(0).fill(format(fy!, fm!, fd!)); await inputs.nth(0).press('Enter');
  await inputs.nth(1).fill(format(ty!, tm!, td!)); await inputs.nth(1).press('Enter');
}
const areaLabel = (language: Locale, id: string) => name(language, dataset.areas.find(area => area.id === id)!.name);
const lineLabel = (language: Locale, id: string) => `${id} · ${name(language, dataset.lines.find(line => line.id === id)!.name)}`;
const productLabel = (language: Locale, code: string) => { const product = dataset.products.find(item => item.code === code)!; return `${product.code} · ${name(language, product.name)}`; };

// Counts and the first rows were read once from the real app on the seeded Mock Dataset (default seed 20260101, clock frozen at tick 0)
// with each filter alone, and agree with the tallies of the raw Batch, Lot and Recipe records noted in apps/ant-design/src/Ledger.test.tsx.
const FILTERS: { column: LedgerFilterColumn; apply(page: Page, language: Locale): Promise<void>; count: number; first: string[] }[] = [
  { column: 'batchId', apply: (page) => textFilter(page, 'batchId').fill('E1'), count: 700, first: ['B-E1-00700', 'B-E1-00699', 'B-E1-00698'] },
  { column: 'lotId', apply: (page) => textFilter(page, 'lotId').fill('A1'), count: 1150, first: ['B-A1-01150', 'B-A1-01149', 'B-A1-01148'] },
  { column: 'upstreamLotId', apply: (page) => textFilter(page, 'upstreamLotId').fill('E1'), count: 1216, first: ['B-A2-01150', 'B-A1-01149', 'B-A2-01149'] },
  { column: 'areas', apply: (page, language) => chooseMany(page, ids.filterAreas, areaLabel(language, 'extrusion')), count: 1400, first: ['B-E1-00700', 'B-E2-00700', 'B-E1-00699'] },
  { column: 'lines', apply: (page, language) => chooseMany(page, ids.filterLines, lineLabel(language, 'E1')), count: 700, first: ['B-E1-00700', 'B-E1-00699', 'B-E1-00698'] },
  { column: 'products', apply: (page, language) => chooseMany(page, ids.filterProducts, productLabel(language, 'WIN-1L-60')), count: 624, first: ['B-A2-01150', 'B-E1-00699', 'B-P1-00400'] },
  { column: 'shifts', apply: (page, language) => chooseMany(page, ids.filterShifts, text(language, shiftLabels.S2)), count: 1681, first: ['B-A1-01147', 'B-P1-00400', 'B-A2-01147'] },
  { column: 'statuses', apply: (page, language) => chooseMany(page, ids.filterStatuses, text(language, batchStatusLabels.rework)), count: 305, first: ['B-A2-01136', 'B-A1-01133', 'B-E1-00691'] },
  { column: 'recipeVersion', apply: (page) => bound(page, 'recipeVersion', 0).fill('2'), count: 1927, first: ['B-A1-01150', 'B-E1-00700', 'B-A2-01149'] },
  { column: 'yield', apply: (page) => bound(page, 'yield', 0).fill('98'), count: 1284, first: ['B-A2-01150', 'B-A1-01148', 'B-E1-00699'] },
  { column: 'scrap', apply: (page) => bound(page, 'scrap', 0).fill('20'), count: 952, first: ['B-RF1-00500', 'B-P1-00400', 'B-E1-00698'] },
  { column: 'duration', apply: (page) => bound(page, 'duration', 0).fill('120'), count: 2244, first: ['B-E1-00700', 'B-E2-00700', 'B-RF1-00500'] },
  // Whole local dates 2025-12-30 to 2025-12-31 in America/Sao_Paulo.
  { column: 'start', apply: (page, language) => dateRange(page, language, 'start', [2025, 12, 30], [2025, 12, 31]), count: 112, first: ['B-RF1-00500', 'B-A1-01148', 'B-E1-00699'] },
  { column: 'end', apply: (page, language) => dateRange(page, language, 'end', [2025, 12, 30], [2025, 12, 31]), count: 112, first: ['B-A1-01147', 'B-A2-01147', 'B-A1-01146'] },
];

const HEADERS: [string, MessageKey][] = [
  ['batchId', 'common.batch-id'], ['lotId', 'term.lot'], ['upstreamLotId', 'ledger.column.upstream-lot'], ['areaId', 'scope.area'], ['lineId', 'scope.line'],
  ['productCode', 'common.product'], ['recipeVersion', 'event-target.recipe-version'], ['shift', 'event-target.shift'], ['start', 'common.start'], ['end', 'common.end'],
  ['durationMinutes', 'common.duration'], ['status', 'common.status'], ['yieldPct', 'ledger.column.yield'], ['scrap', 'ledger.column.scrap'],
];

test.describe('Ledger', () => {
  test.beforeEach(async ({ page }) => { await openScreen(page, 'ledger'); });

  test('exposes every required test id across its states', async ({ page, language }) => {
    expect(Object.values(ids)).toHaveLength(26);
    const seen = new Set<string>();
    const note = async (id: string, minimum = 1) => {
      await expect.poll(() => byId(page, id).count(), id).toBeGreaterThanOrEqual(minimum);
      seen.add(id);
    };
    for (const id of [ids.grid, ids.rowCount, ids.clearFilters, ids.rowSelect, ids.compare, ...LEDGER_FILTER_COLUMNS.map(ledgerFilterId)]) await note(id);
    await expect(byId(page, ids.empty)).toHaveCount(0);
    for (const first of FIRST_FIVE.slice(0, 4)) await checkbox(page, language, first).click();
    await checkbox(page, language, FIRST_FIVE[4]!).click();
    await note(ids.selectionLimit);
    await byId(page, ids.compare).click();
    await note(ids.comparePanel);
    await openButton(page, language, FIRST_FIVE[0]!).click();
    for (const id of [ids.drawer, ids.drawerGenealogy, ids.drawerParameters, ids.drawerAlarms]) await note(id);
    await page.keyboard.press('Escape');
    await textFilter(page, 'batchId').fill('no-such-batch');
    await note(ids.empty);
    expect([...seen].sort()).toEqual(Object.values(ids).sort());
  });

  test('renders 5,000 records in a virtual table with 16 cells per row, up to the last row', async ({ page, language }) => {
    await expect(byId(page, ids.rowCount)).toHaveText(rowCount(language, 5000));
    await expect(grid(page)).toHaveAttribute('role', 'table');
    await expect(grid(page)).toHaveAttribute('aria-rowcount', '5001');
    await expect(grid(page)).toHaveAttribute('aria-colcount', '16');
    await expect(grid(page).getByRole('columnheader')).toHaveCount(16);
    const rendered = await bodyRows(page).count();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    const snapshot = () => grid(page).evaluate(table => {
      const rows = [...table.querySelectorAll<HTMLElement>('[role="row"][aria-rowindex]')].filter(row => row.querySelector('[data-testid="ledger.row-select"]'));
      const last = rows.find(row => row.getAttribute('aria-rowindex') === '5001');
      return {
        first: Number(rows[0]?.getAttribute('aria-rowindex')), max: Math.max(...rows.map(row => Number(row.getAttribute('aria-rowindex')))),
        cells: [...new Set(rows.map(row => row.querySelectorAll('[role="cell"]').length))], lastId: last?.querySelectorAll('[role="cell"]')[1]?.textContent ?? null,
      };
    });
    expect((await snapshot()).first).toBe(2);
    await grid(page).hover();
    // The last row of the default sort (Start descending) is the oldest Batch. Row 5001 is rendered with all 16 cells.
    await expect.poll(async () => { await page.mouse.wheel(0, 400_000); return snapshot(); }, { timeout: 15_000 })
      .toMatchObject({ max: 5001, cells: [16], lastId: expect.stringMatching(/^B-[A-Z0-9]+-\d{5}$/) });
  });

  for (const filter of FILTERS) {
    test(`filters by ${filter.column} and clears back to 5,000 records`, async ({ page, language }) => {
      await filter.apply(page, language);
      await expectGrid(page, language, filter.count, filter.first);
      await byId(page, ids.clearFilters).click();
      await expectGrid(page, language, 5000, DEFAULT_FIRST);
      for (const field of await grid(page).locator('xpath=ancestor::*[contains(@class,"ant-card")][1]').locator('input:not([type="checkbox"])').all()) {
        if (await field.isVisible() && await field.getAttribute('role') !== 'combobox') await expect(field).toHaveValue('');
      }
    });
  }

  test('combines filters, lists them in the empty state and clears them all', async ({ page, language }) => {
    await textFilter(page, 'batchId').fill('E1');
    await chooseMany(page, ids.filterAreas, areaLabel(language, 'extrusion'));
    await chooseMany(page, ids.filterStatuses, text(language, batchStatusLabels.completed));
    await bound(page, 'recipeVersion', 0).fill('2');
    await bound(page, 'recipeVersion', 1).fill('2');
    await bound(page, 'yield', 0).fill('95');
    await bound(page, 'scrap', 1).fill('20');
    await expectGrid(page, language, 152, ['B-E1-00700', 'B-E1-00699', 'B-E1-00695']);
    await textFilter(page, 'lotId').fill('no-such-lot');
    await expectGrid(page, language, 0, []);
    const empty = byId(page, ids.empty);
    await expect(empty).toContainText(text(language, 'ledger.empty'));
    await expect(empty).toContainText(text(language, 'ledger.active-filters'));
    const label = (column: LedgerFilterColumn) => text(language, ledgerFilterLabels[column]);
    const from = text(language, 'common.from'); const to = text(language, 'common.to');
    const percent = language === 'pt-BR' ? '95,0%' : '95.0%';
    for (const line of [
      `${label('batchId')}: E1`, `${label('lotId')}: no-such-lot`, `${label('areas')}: ${areaLabel(language, 'extrusion')}`, `${label('statuses')}: ${text(language, batchStatusLabels.completed)}`,
      `${label('recipeVersion')}: ${from}: 2, ${to}: 2`, `${label('yield')}: ${from}: ${percent}`, `${label('scrap')}: ${to}: 20`,
    ]) await expect(empty).toContainText(line);
    await byId(page, ids.clearFilters).click();
    await expectGrid(page, language, 5000, DEFAULT_FIRST);
  });

  test('shows an empty state inside a rowgroup of the table with coherent ARIA counts', async ({ page, language }) => {
    await textFilter(page, 'batchId').fill('no-such-batch');
    await expect(byId(page, ids.empty)).toBeVisible();
    await expect(byId(page, ids.rowCount)).toHaveText(rowCount(language, 0));
    const shape = await byId(page, ids.empty).evaluate(empty => {
      const table = empty.closest('[data-testid="ledger.grid"]');
      const group = empty.closest('[role="rowgroup"]');
      const row = empty.closest('[role="row"]');
      const cell = empty.closest('[role="cell"]');
      return {
        inTable: Boolean(table && group && table.contains(group)), rowInGroup: Boolean(group && row && group.contains(row)), cellInRow: Boolean(row && cell && row.contains(cell)),
        colspan: cell?.getAttribute('aria-colspan'), rowindex: row?.getAttribute('aria-rowindex'),
        rowcount: table?.getAttribute('aria-rowcount'), colcount: table?.getAttribute('aria-colcount'),
      };
    });
    expect(shape).toEqual({ inTable: true, rowInGroup: true, cellInRow: true, colspan: '16', rowindex: '2', rowcount: '2', colcount: '16' });
    await expect(byId(page, ids.empty)).toContainText(`${text(language, ledgerFilterLabels.batchId)}: no-such-batch`);
  });

  test('cycles a header through ascending, descending and the default sort, also by keyboard', async ({ page, language }) => {
    const cycle: [MessageKey, string[], string[]][] = [
      ['common.batch-id', ['B-A1-00001', 'B-A1-00002', 'B-A1-00003'], ['B-RF1-00500', 'B-RF1-00499', 'B-RF1-00498']],
      ['ledger.column.yield', ['B-A2-00329', 'B-A2-00425', 'B-P1-00112'], ['B-A1-00020', 'B-A1-00171', 'B-A1-00192']],
    ];
    const start = header(page, text(language, 'common.start'));
    await expect(start).toHaveAttribute('aria-sort', 'descending');
    for (const [key, ascending, descending] of cycle) {
      const column = header(page, text(language, key));
      await column.click(); await expectGrid(page, language, 5000, ascending);
      await expect(column).toHaveAttribute('aria-sort', 'ascending');
      await expect(start).toHaveAttribute('aria-sort', 'none');
      await column.click(); await expectGrid(page, language, 5000, descending);
      await expect(column).toHaveAttribute('aria-sort', 'descending');
      await column.click(); await expectGrid(page, language, 5000, DEFAULT_FIRST);
      await expect(column).toHaveAttribute('aria-sort', 'none');
      await expect(start).toHaveAttribute('aria-sort', 'descending');
    }
    const lot = header(page, text(language, 'term.lot'));
    await lot.focus();
    await page.keyboard.press('Enter');
    await expectGrid(page, language, 5000, ['B-A1-00001', 'B-A1-00002', 'B-A1-00003']);
    await expect(lot).toHaveAttribute('aria-sort', 'ascending');
  });

  test('selects up to four Batches, refuses the fifth with the limit message and never lets select-all exceed four', async ({ page, language }) => {
    const selectAll = grid(page).getByRole('checkbox', { name: text(language, 'ledger.select-all') });
    await expect(selectAll).toBeDisabled();
    await selectAll.click({ force: true });
    await expect(byId(page, ids.rowSelect).locator('xpath=self::*[@checked]')).toHaveCount(0);
    const selected = (n: number) => page.getByText(tCount(language, 'common.selected-count', n), { exact: true });
    await expect(selected(0)).toBeVisible();
    for (const [index, id] of FIRST_FIVE.slice(0, 4).entries()) { await checkbox(page, language, id).click(); await expect(selected(index + 1)).toBeVisible(); }
    await expect(page.getByRole('status').filter({ hasText: text(language, 'ledger.result.selected') })).toBeVisible();
    await checkbox(page, language, FIRST_FIVE[4]!).click();
    const limit = byId(page, ids.selectionLimit);
    await expect(limit).toHaveText(text(language, 'ledger.result.selection-limit'));
    await expect(limit).toHaveAttribute('role', 'status');
    await expect(checkbox(page, language, FIRST_FIVE[4]!)).not.toBeChecked();
    await expect(selected(4)).toBeVisible();
    // Every attempt announces again, so the notice is replaced.
    const first = await limit.elementHandle();
    await checkbox(page, language, FIRST_FIVE[4]!).click();
    await expect.poll(() => first!.evaluate(node => node.isConnected)).toBe(false);
    await expect(byId(page, ids.selectionLimit)).toBeVisible();
    // Select-all on one visible row is allowed alone, and is unavailable again once hidden selections would exceed four.
    await checkbox(page, language, FIRST_FIVE[0]!).click();
    await expect(page.getByRole('status').filter({ hasText: text(language, 'ledger.result.deselected') })).toBeVisible();
    await expect(selected(3)).toBeVisible();
    await textFilter(page, 'batchId').fill('B-A1-01150');
    await expect(page.getByText(tCount(language, 'ledger.selected-hidden', 3), { exact: true })).toBeVisible();
    await expect(selectAll).toBeEnabled();
    await selectAll.click();
    await expect(selected(4)).toBeVisible();
    await expect(page.getByText(tCount(language, 'ledger.selected-hidden', 3), { exact: true })).toBeVisible();
    await byId(page, ids.clearFilters).click();
    await expect(selected(4)).toBeVisible();
    await expect(selectAll).toBeDisabled();
  });

  test('reports selected Batches hidden by a filter and counts them toward the limit', async ({ page, language }) => {
    await checkbox(page, language, 'B-A1-01150').click();
    await checkbox(page, language, 'B-A2-01150').click();
    await textFilter(page, 'batchId').fill('B-E');
    await expect(page.getByText(tCount(language, 'ledger.selected-hidden', 2), { exact: true })).toBeVisible();
    const selectAll = grid(page).getByRole('checkbox', { name: text(language, 'ledger.select-all') });
    await expect(selectAll).toBeDisabled();
    await checkbox(page, language, 'B-E1-00700').click();
    await checkbox(page, language, 'B-E2-00700').click();
    await expect(page.getByText(tCount(language, 'common.selected-count', 4), { exact: true })).toBeVisible();
    await checkbox(page, language, 'B-E1-00699').click();
    await expect(byId(page, ids.selectionLimit)).toHaveText(text(language, 'ledger.result.selection-limit'));
    await checkbox(page, language, 'B-E1-00700').click();
    await checkbox(page, language, 'B-E2-00700').click();
    await byId(page, ids.clearFilters).click();
    await expect(checkbox(page, language, 'B-A1-01150')).toBeChecked();
    await expect(checkbox(page, language, 'B-A2-01150')).toBeChecked();
    await expect(page.getByText(tCount(language, 'ledger.selected-hidden', 2), { exact: true })).toHaveCount(0);
  });

  test('compares 2 to 4 Batches in a panel that is in view and focused', async ({ page, language }) => {
    const compare = byId(page, ids.compare);
    await expect(compare).toHaveAttribute('aria-disabled', 'true');
    await expect(compare).not.toHaveAttribute('disabled');
    await expect(compare).toHaveAccessibleDescription(text(language, 'ledger.result.compare-count'));
    await compare.click({ force: true });
    await expect(byId(page, ids.comparePanel)).toHaveCount(0);
    const metrics: [string, string, string][] = [['B-A1-01150', '97.9', '1'], ['B-A2-01150', '98.6', '1'], ['B-E1-00700', '97.0', '15'], ['B-E2-00700', '95.4', '15']];
    const percent = (value: string) => (language === 'pt-BR' ? `${value.replace('.', ',')}%` : `${value}%`);
    await checkbox(page, language, metrics[0]![0]).click();
    await expect(compare).toHaveAttribute('aria-disabled', 'true');
    for (let count = 2; count <= 4; count++) {
      await checkbox(page, language, metrics[count - 1]![0]).click();
      await expect(compare).toHaveAttribute('aria-disabled', 'false');
      await compare.click();
      const panel = byId(page, ids.comparePanel);
      await expect(panel).toBeVisible();
      await expect(panel).toBeInViewport();
      await expect(panel).toBeFocused();
      await expect(panel).toContainText(text(language, 'ledger.compare-panel'));
      for (const [id, yieldValue, scrap] of metrics.slice(0, count)) {
        await expect(panel).toContainText(id);
        await expect(panel).toContainText(percent(yieldValue));
        await expect(panel.getByText(scrap, { exact: true }).first()).toBeVisible();
      }
      for (const [id] of metrics.slice(count)) await expect(panel).not.toContainText(id);
      if (language === 'en') {
        await expect(panel).toContainText('1 h 45 min');
        await expect(panel).toContainText('1 h 38 min');
      }
    }
    // Closing the panel returns focus to Compare. Changing the selection also closes it.
    await byId(page, ids.comparePanel).getByRole('button').first().click();
    await expect(byId(page, ids.comparePanel)).toHaveCount(0);
    await expect(compare).toBeFocused();
    await compare.click();
    await expect(byId(page, ids.comparePanel)).toBeFocused();
    await checkbox(page, language, metrics[0]![0]).click();
    await expect(byId(page, ids.comparePanel)).toHaveCount(0);
    await expect(compare).toBeFocused();
  });

  test('opens the drawer with Genealogy links, actuals and Alarms, closes with Esc and returns focus', async ({ page, language }) => {
    await textFilter(page, 'batchId').fill('B-A1-01150');
    const button = openButton(page, language, 'B-A1-01150');
    await button.focus();
    await button.click();
    const drawer = byId(page, ids.drawer);
    const heading = text(language, 'ledger.drawer.header');
    await expect(drawer).toContainText(`${heading} · B-A1-01150`);
    await expect(drawer).toContainText('LOT-A1-01150');
    await expect(drawer).toContainText(text(language, batchStatusLabels.completed));
    await expect(drawer.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await expect(drawer.getByRole('button', { name: text(language, 'action.close'), exact: true })).toHaveCount(1);
    const genealogy = byId(page, ids.drawerGenealogy);
    for (const value of ['ML-PVC-043', 'LOT-E2-00659', 'LOT-RF1-00488', 'LOT-A1-01150', 'SN-A1-001150']) await expect(genealogy.getByText(value, { exact: true })).toBeVisible();
    await expect(genealogy.getByRole('link')).toHaveText(['B-E2-00659', 'B-RF1-00488', 'B-A1-01150']);
    // Parameter actuals against setpoint: three rows, Cycle time actual 110 against setpoint 109.
    const parameters = byId(page, ids.drawerParameters);
    await expect(parameters.locator('tbody tr')).toHaveCount(3);
    const percent = (value: string) => (language === 'pt-BR' ? value.replace('.', ',') : value);
    const cycle = parameters.locator('tbody tr').filter({ hasText: text(language, 'parameter.cycle-time') });
    await expect(cycle.locator('td')).toHaveText([text(language, 'parameter.cycle-time'), '110', '109', percent('0.9%'), '60', '119', 's', text(language, 'ledger.inside-limits')]);
    await expect(byId(page, ids.drawerAlarms)).toContainText(text(language, 'ledger.alarms-empty'));
    // Shortcuts are suppressed behind the drawer.
    const before = await page.evaluate(() => location.hash);
    await page.keyboard.press('6');
    await page.keyboard.press('/');
    await page.keyboard.press('1');
    expect(await page.evaluate(() => location.hash)).toBe(before);
    await expect(textFilter(page, 'batchId')).not.toBeFocused();
    // Genealogy navigation keeps the drawer open and focuses its title.
    await genealogy.getByRole('link', { name: 'B-E2-00659' }).click();
    await expect(drawer).toContainText('LOT-E2-00659');
    await expect(drawer).not.toContainText('B-A1-01150');
    await expect(drawer.getByText(`${heading} · B-E2-00659`)).toBeFocused();
    await expect(byId(page, ids.drawerParameters).locator('tbody tr')).toHaveCount(8);
    await page.keyboard.press('Escape');
    await expect(drawer.getByRole('dialog')).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('lists the Alarms raised during the run in the drawer', async ({ page, language }) => {
    // B-E1-00006 is a seeded Batch with one Alarm in its run window.
    await textFilter(page, 'batchId').fill('B-E1-00006');
    await openButton(page, language, 'B-E1-00006').click();
    const alarms = byId(page, ids.drawerAlarms);
    await expect(alarms.locator('tbody tr.ant-table-row')).toHaveCount(1);
    await expect(alarms).not.toContainText(text(language, 'ledger.alarms-empty'));
  });

  test('opens a focused row with Enter and returns focus to it on Esc', async ({ page, language }) => {
    const row = batchRow(page, 'B-A1-01150');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(byId(page, ids.drawer)).toContainText(`${text(language, 'ledger.drawer.header')} · B-A1-01150`);
    await page.keyboard.press('Escape');
    await expect(byId(page, ids.drawer).getByRole('dialog')).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test('names the date range inputs distinctly inside a labelled group', async ({ page, language }) => {
    for (const column of ['start', 'end'] as const) {
      const group = byId(page, ledgerFilterId(column));
      await expect(group).toHaveAttribute('role', 'group');
      await expect(group).toHaveAccessibleName(text(language, 'ledger.filter-column', { column: text(language, ledgerFilterLabels[column]) }));
      const names = await group.locator('input').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label') ?? (input as HTMLInputElement).placeholder));
      expect(names).toEqual([text(language, 'common.from'), text(language, 'common.to')]);
    }
  });

  test('names every filter after its visible label', async ({ page, language }) => {
    for (const column of LEDGER_FILTER_COLUMNS) {
      const expected = text(language, 'ledger.filter-column', { column: text(language, column === 'batchId' ? 'common.batch-id' : ledgerFilterLabels[column]) });
      const control = byId(page, ledgerFilterId(column));
      const named = (await control.getAttribute('aria-label')) ? control : control.locator('[aria-label]').first();
      await expect(named).toHaveAttribute('aria-label', expected);
    }
  });

  for (const pasted of ['1e400', '-']) {
    test(`keeps the grid rendered when ${pasted} is pasted into a numeric range input`, async ({ page, language }) => {
      for (const column of ['recipeVersion', 'yield', 'scrap', 'duration'] as const) {
        for (const which of [0, 1] as const) {
          await byId(page, ids.clearFilters).click();
          const field = bound(page, column, which);
          await field.fill('2');
          await field.fill('');
          await field.focus();
          await page.keyboard.insertText(pasted);
          await expect(byId(page, ids.rowCount)).toHaveText(rowCount(language, 5000));
          await expect(grid(page)).toHaveAttribute('aria-rowcount', '5001');
          await expect.poll(() => rowIds(page, 1)).toEqual(['B-A1-01150']);
          await expect(byId(page, ids.empty)).toHaveCount(0);
        }
      }
    });
  }

  test('keeps Batch ID outside the Filter Collapse, mounts every filter and answers the / shortcut when collapsed', async ({ page, language }) => {
    const toggle = page.getByRole('button', { name: new RegExp(escape(text(language, 'ledger.filter-count', { count: 0 }))) });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(byId(page, ids.filterAreas)).toBeVisible();
    await textFilter(page, 'batchId').fill('E1');
    await expect(page.getByRole('button', { name: new RegExp(escape(text(language, 'ledger.filter-count', { count: 1 }))) })).toBeVisible();
    await byId(page, ids.clearFilters).click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    for (const column of LEDGER_FILTER_COLUMNS) await expect(byId(page, ledgerFilterId(column))).toHaveCount(1);
    await expect(byId(page, ids.filterAreas)).toBeHidden();
    for (const id of [ids.filterBatchId, ids.clearFilters, ids.rowCount]) await expect(byId(page, id)).toBeVisible();
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('/');
    await expect(textFilter(page, 'batchId')).toBeFocused();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.focus();
    await page.keyboard.press('/');
    await expect(textFilter(page, 'batchId')).toBeFocused();
  });

  for (const width of [1280, 1440]) {
    test(`has no horizontal page overflow at ${width} px`, async ({ page }) => {
      await atWidth(page, width, async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'page horizontal overflow').toBe(0);
      });
    });

    test(`shows at least 6 data columns beside the pinned ones, the whole Actions column and unbroken header words at ${width} px`, async ({ page, language }) => {
      await atWidth(page, width, async () => {
        const headers = grid(page).getByRole('columnheader');
        await expect(headers).toHaveCount(16);
        const layout = await grid(page).evaluate(table => {
          const cells = [...table.querySelectorAll<HTMLElement>('[role="columnheader"]')];
          const box = table.getBoundingClientRect();
          const pinnedLeft = cells[1]!.getBoundingClientRect().right;
          const actions = cells[cells.length - 1]!.getBoundingClientRect();
          const middle = cells.slice(2, -1).map(cell => cell.getBoundingClientRect());
          const open = table.querySelector<HTMLElement>('[role="row"][aria-rowindex="2"] button')?.getBoundingClientRect();
          return {
            visible: middle.filter(rect => rect.left >= pinnedLeft - 1 && rect.right <= actions.left + 1).length,
            actions: { left: actions.left - box.left, right: box.right - actions.right, width: actions.width },
            button: open ? { inside: open.left >= box.left - 1 && open.right <= box.right + 1, width: open.width } : null,
            viewport: { right: window.innerWidth - box.right },
          };
        });
        expect(layout.visible).toBeGreaterThanOrEqual(6);
        expect(layout.actions.right).toBeGreaterThanOrEqual(-1);
        expect(layout.actions.left).toBeGreaterThan(0);
        expect(layout.button).not.toBeNull();
        expect(layout.button!.inside).toBe(true);
        expect(layout.viewport.right).toBeGreaterThanOrEqual(-1);
        const broken = await headers.evaluateAll(cells => cells.slice(1, 15).flatMap(cell => {
          const problems: string[] = [];
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, word.index!); range.setEnd(node, word.index! + word[0].length);
              if (new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size > 1) problems.push(`broken: ${word[0]}`);
              // A nowrap header whose text runs past its cell is cut mid-word (ellipsis).
              if (range.getBoundingClientRect().right > cell.getBoundingClientRect().right + 0.5) problems.push(`cut: ${word[0]}`);
            }
          }
          return problems;
        }));
        expect(broken).toEqual([]);
        for (const [, key] of HEADERS) await expect(header(page, text(language, key))).toHaveCount(1);
        await expect(batchRow(page, 'B-A1-01150').getByRole('button', { name: text(language, 'ledger.open-details') })).toBeVisible();
      });
    });
  }

  test('has no English UI text in pt-BR', async ({ page, language }) => {
    test.skip(language !== 'pt-BR');
    for (const id of FIRST_FIVE) await checkbox(page, language, id).click();
    await byId(page, ids.compare).click();
    const grids = await portugueseLeaks(page);
    await openButton(page, language, FIRST_FIVE[0]!).click();
    await expect(byId(page, ids.drawerGenealogy)).toBeVisible();
    const drawer = await portugueseLeaks(page);
    await page.keyboard.press('Escape');
    await textFilter(page, 'batchId').fill('no-such-batch');
    await expect(byId(page, ids.empty)).toBeVisible();
    const empty = await portugueseLeaks(page);
    const leaks = [...new Set([...grids.leaks, ...drawer.leaks, ...empty.leaks])];
    test.info().annotations.push({ type: 'unknown-strings', description: [...new Set([...grids.unknown, ...drawer.unknown, ...empty.unknown])].join(' | ') });
    expect(leaks).toEqual([]);
  });
});
