import {
  MAX_TREND_TAGS, TREND_WINDOWS, decimalSeparator, formatTagValue, formatTime, generateMockDataset, linkStatusLabels,
  plantErrorLabels, shellNavId, simulatedTime, tCount, tagStatusLabels, trendTicks, trendWindowLabels, type TrendWindowId,
} from '@swatchbook/core';
import type { Page } from '@playwright/test';
import { TEST_IDS, atMinWidth, byId, expect, noConsoleErrors, openScreen, segment, test, text, type Locale } from './harness';
import {
  chartCollisions, chartTable, choose, pageOverflow, parseNumber, readChart, tableRows, wordsStayWhole,
} from './performance-parameters-helpers';

const ids = TEST_IDS.parameters;
const dataset = generateMockDataset();
const TOTAL_TAGS = dataset.tags.length;
// The unit of each Tag below, in the order the Tags are selected: V, A, °C, kW. They belong to machine E1-extruder.
const FOUR_UNITS = [['supply-voltage', 'V'], ['motor-current', 'A'], ['motor-temperature', '°C'], ['power', 'kW']] as const;
const tagId = (machine: string, name: string) => `${machine}.${name}`;
const COLUMNS = 11; // selection, Line, Machine, Tag name, current value, unit, setpoint, minimum, maximum, status, actions
const CELL = { setpoint: 6, status: 9, actions: 10 } as const;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const gridRows = (page: Page) => byId(page, ids.grid).getByRole('row').filter({ has: page.getByRole('cell') });
const rowOf = (page: Page, tag: string) => gridRows(page).filter({ hasText: tag });
const selectBox = (page: Page, language: Locale, id: string) => page.getByLabel(text(language, 'parameters.select-tag', { tag: id }));
const dialog = (page: Page) => page.getByRole('dialog');

interface Filters { line?: string; machine?: string; status?: keyof typeof tagStatusLabels; search?: string }
/** Applies filters on a fresh Screen. Option texts start with the id, so the translated names do not matter. */
async function filterBy(page: Page, language: Locale, filters: Filters) {
  if (filters.line) await choose(page, ids.filterLine, `${filters.line} ·`);
  if (filters.machine) await choose(page, ids.filterMachine, `${filters.machine} ·`);
  if (filters.status) await choose(page, ids.filterStatus, text(language, tagStatusLabels[filters.status]));
  if (filters.search !== undefined) await byId(page, ids.search).fill(filters.search);
}
/** The record count the Screen shows, built from the dictionaries. */
const recordCount = (page: Page, language: Locale, count: number) =>
  page.getByText(new RegExp(`^${escapeRegExp(tCount(language, 'common.row-count', count))} · `));
async function expectRecords(page: Page, language: Locale, count: number) {
  await expect(recordCount(page, language, count)).toBeVisible();
  await expect(byId(page, ids.grid)).toHaveAttribute('aria-rowcount', String(count + 1));
}
const selectedCount = (page: Page, language: Locale, count: number) =>
  expect(page.getByText(new RegExp(` · ${escapeRegExp(tCount(language, 'common.selected-count', count))}$`))).toBeVisible();

/** Selects the first n of the four-unit Tags on E1-extruder. */
async function selectFourUnitTags(page: Page, language: Locale, n: number, from = 0) {
  for (const [name] of FOUR_UNITS.slice(from, n)) await selectBox(page, language, tagId('E1-extruder', name)).check();
}

test.describe('Live Parameter Matrix', () => {
  test('shows the required test ids in each of its states', async ({ page, language }) => {
    await openScreen(page, 'parameters');
    for (const id of [ids.grid, ids.filterLine, ids.filterMachine, ids.filterStatus, ids.search, ids.trend, ids.trendWindow, ids.connectivity, ids.trendEmpty]) {
      await expect(byId(page, id), id).toHaveCount(1);
      await expect(byId(page, id), id).toBeVisible();
    }
    expect(await byId(page, ids.tagSelect).count()).toBeGreaterThan(1);
    expect(await byId(page, ids.override).count()).toBeGreaterThan(1);
    expect(await byId(page, ids.resetRecipe).count()).toBeGreaterThan(1);
    await expect(page.getByLabel(text(language, 'parameters.select-all-tags'))).toHaveCount(1);
    for (const id of [ids.gridEmpty, ids.trendLimit, ids.empty, ids.overrideValue, ids.overrideApply, ids.overrideError]) await expect(byId(page, id), id).toHaveCount(0);

    await filterBy(page, language, { search: 'no tag has this name' });
    await expect(byId(page, ids.gridEmpty)).toBeVisible();
    await expect(byId(page, ids.gridEmpty)).toContainText(text(language, 'parameters.grid-empty'));
    await filterBy(page, language, { search: '' });
    await expect(byId(page, ids.gridEmpty)).toHaveCount(0);

    await filterBy(page, language, { machine: 'E1-extruder' });
    for (const [name] of FOUR_UNITS) await selectBox(page, language, tagId('E1-extruder', name)).check();
    await selectBox(page, language, tagId('E1-extruder', 'vibration')).click();
    await expect(byId(page, ids.trendLimit)).toBeVisible();
    await expect(byId(page, ids.trendEmpty)).toHaveCount(0);

    await filterBy(page, language, { search: 'motor-current' });
    await rowOf(page, 'motor-current').getByTestId(ids.override).click({ force: true });
    // Seeded data: motor-current is a read-only Tag, so no dialog. A writable Tag opens it.
    await expect(dialog(page)).toHaveCount(0);
    await filterBy(page, language, { search: 'barrel-zone-1' });
    await rowOf(page, 'barrel-zone-1').getByTestId(ids.override).click();
    for (const id of [ids.overrideValue, ids.overrideReason, ids.overrideApply]) await expect(byId(page, id), id).toBeVisible();
    await byId(page, ids.overrideApply).click();
    await expect(byId(page, ids.overrideError)).toBeVisible();
    // `parameters.empty` shows only when the whole Screen has no content, which the seeded Mock Dataset never does.
  });

  test.describe('Tag grid', () => {
    test('is one ARIA table with every Tag, an absolute row index and a virtual window of rows', async ({ page }) => {
      await openScreen(page, 'parameters');
      const grid = byId(page, ids.grid);
      await expect(grid).toHaveAttribute('role', 'table');
      await expect(grid).toHaveAttribute('aria-colcount', String(COLUMNS));
      // About 300 Tags: the seeded dataset has 307, one extra row for the header.
      expect(TOTAL_TAGS).toBe(307);
      await expect(grid).toHaveAttribute('aria-rowcount', '308');
      await expect(page.getByRole('table')).toHaveCount(2); // the grid and the connectivity table
      await expect(grid.getByRole('columnheader')).toHaveCount(COLUMNS);
      await expect(gridRows(page).first()).toBeVisible();
      const indexes = () => grid.getByRole('row').evaluateAll(rows => rows.map(row => Number(row.getAttribute('aria-rowindex'))));
      expect((await indexes())[0]).toBe(1);
      expect(await grid.getByRole('row').count()).toBeLessThan(60);
      // Scroll down: the rendered rows keep their absolute index, and each index belongs to the Tag at that place in the dataset.
      await gridRows(page).first().hover();
      await page.mouse.wheel(0, 3000);
      await expect.poll(async () => Math.max(...await indexes())).toBeGreaterThan(40);
      let previous = '';
      await expect.poll(async () => { const now = JSON.stringify(await indexes()); const same = now === previous; previous = now; return same; }, { intervals: [250] }).toBe(true);
      const after = await indexes();
      expect(after.every(index => index >= 1 && index <= 308), 'indexes stay absolute').toBe(true);
      const body = after.filter(index => index > 1);
      expect(body, 'consecutive rows').toEqual(body.map((_, offset) => body[0]! + offset));
      for (const index of body) {
        const tag = dataset.tags[index - 2]!;
        const row = grid.locator(`[role="row"][aria-rowindex="${index}"]`);
        await expect(row, `row ${index}`).toContainText(tag.machineId);
        await expect(row, `row ${index}`).toContainText(tag.name);
        await expect(row.getByRole('cell')).toHaveCount(COLUMNS);
      }
    });

    test('scrolls to the very last Tag, with aria-rowindex 308', async ({ page }) => {
      await openScreen(page, 'parameters');
      const grid = byId(page, ids.grid);
      await gridRows(page).first().hover();
      for (let attempt = 0; attempt < 12; attempt++) await page.mouse.wheel(0, 5000);
      const last = dataset.tags.at(-1)!;
      const lastRow = grid.locator('[role="row"][aria-rowindex="308"]');
      await expect(lastRow, 'the last row is rendered after scrolling to the end').toHaveCount(1);
      await expect(lastRow).toContainText(last.machineId);
      await expect(lastRow).toContainText(last.name);
    });

    test('rows are 81 px high when comfortable and 59 px when compact', async ({ page, language }) => {
      await openScreen(page, 'parameters');
      const height = async () => (await gridRows(page).first().boundingBox())!.height;
      await expect.poll(height).toBeGreaterThan(70);
      expect(Math.abs(await height() - 81)).toBeLessThanOrEqual(3);
      await segment(page, TEST_IDS.shell.density, text(language, 'density.compact'));
      await expect.poll(async () => Math.abs(await height() - 59)).toBeLessThanOrEqual(3);
      await segment(page, TEST_IDS.shell.density, text(language, 'density.comfortable'));
      await expect.poll(async () => Math.abs(await height() - 81)).toBeLessThanOrEqual(3);
    });

    for (const width of [1280, 1440]) {
      test(`reaches all 11 columns with the Actions column pinned and fully visible at ${width} px`, async ({ page, language }) => {
        const run = async () => {
          const errors = noConsoleErrors(page);
          await openScreen(page, 'parameters');
          const grid = byId(page, ids.grid);
          const headers = grid.getByRole('columnheader');
          await expect(headers).toHaveCount(COLUMNS);
          await expect(gridRows(page).first()).toBeVisible();
          const frame = (await grid.boundingBox())!;
          const inside = (box: { x: number; width: number }) => box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1;
          const actionsHeader = headers.nth(COLUMNS - 1);
          const actionsInView = async () => {
            expect(inside((await actionsHeader.boundingBox())!), 'Actions header fully visible').toBe(true);
            for (const row of await gridRows(page).all()) {
              const cell = (await row.getByRole('cell').nth(CELL.actions).boundingBox())!;
              expect(inside(cell), 'Actions cell fully visible').toBe(true);
              for (const id of [ids.override, ids.resetRecipe]) expect(inside((await row.getByTestId(id).boundingBox())!), `${id} fully visible`).toBe(true);
            }
          };
          await actionsInView();
          // Scrolling the grid sideways keeps the selection and the Actions columns pinned, and every column can be reached.
          await gridRows(page).first().hover();
          await page.mouse.wheel(2000, 0);
          const firstColumn = headers.nth(1);
          await actionsInView();
          const select = (await headers.first().boundingBox())!;
          expect(select.x, 'selection column pinned left').toBeGreaterThanOrEqual(frame.x - 1);
          expect(select.x, 'selection column pinned left').toBeLessThanOrEqual(frame.x + 2);
          const scrolled = (await firstColumn.boundingBox())!.x < frame.x + 40;
          for (let index = 0; index < COLUMNS; index++) {
            await headers.nth(index).scrollIntoViewIfNeeded();
            const box = (await headers.nth(index).boundingBox())!;
            expect(inside(box), `column ${index} reachable`).toBe(true);
          }
          if (width === 1280) expect(scrolled, 'the grid needs a sideways scroll at the minimum width').toBe(true);
          await gridRows(page).first().hover();
          await page.mouse.wheel(-5000, 0);
          await actionsInView();
          // No header word is broken in the middle, and no header is cut off.
          expect(await wordsStayWhole(headers)).toEqual([]);
          const cut = await headers.evaluateAll(cells => cells.filter(cell => cell.textContent && cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent));
          expect(cut, 'headers cut off').toEqual([]);
          await expect(headers.nth(COLUMNS - 1)).toContainText(text(language, 'parameters.override'));
          errors.expectNone();
        };
        if (width === 1280) await atMinWidth(page, run);
        else await run();
      });

      test(`has no page overflow at ${width} px`, async ({ page }) => {
        const run = async () => {
          await openScreen(page, 'parameters');
          await expect(gridRows(page).first()).toBeVisible();
          expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
        };
        if (width === 1280) await atMinWidth(page, run);
        else await run();
      });
    }

    test('wraps no word of a cell or of the Actions column in the middle', async ({ page }) => {
      await openScreen(page, 'parameters');
      await expect(gridRows(page).first()).toBeVisible();
      expect(await wordsStayWhole(gridRows(page))).toEqual([]);
    });
  });

  test.describe('filters', () => {
    // Literal counts of the seeded Mock Dataset (seed 20260101). Read once from the running app, with the
    // grid unfiltered, then one filter at a time (the record counter text and aria-rowcount agree).
    const cases: Array<[string, Filters, number]> = [
      ['no filter', {}, 307],
      ['Line A1', { line: 'A1' }, 66], ['Line A2', { line: 'A2' }, 66], ['Line C1', { line: 'C1' }, 11], ['Line E1', { line: 'E1' }, 60],
      ['Line E2', { line: 'E2' }, 60], ['Line P1', { line: 'P1' }, 11], ['Line RF1', { line: 'RF1' }, 33],
      ['Machine E1-extruder', { machine: 'E1-extruder' }, 16],
      ['status Normal', { status: 'normal' }, 293], ['status High', { status: 'high' }, 2], ['status Low', { status: 'low' }, 1], ['status Stale', { status: 'stale' }, 11],
      ['name search "temp"', { search: 'temp' }, 45], ['name search "TEMP" (case-insensitive)', { search: 'TEMP' }, 45],
      ['Line RF1 and search "speed"', { line: 'RF1', search: 'speed' }, 3],
      ['Line E1, Machine E1-extruder and search "temp"', { line: 'E1', machine: 'E1-extruder', search: 'temp' }, 7],
      ['Line A2 and status Stale', { line: 'A2', status: 'stale' }, 11],
      ['status High and search "current"', { status: 'high', search: 'current' }, 1],
      ['Line E2 and Machine E1-extruder (no overlap)', { line: 'E2', machine: 'E1-extruder' }, 0],
    ];
    for (const [name, filters, count] of cases) {
      test(`${name}: ${count} Tags`, async ({ page, language }) => {
        await openScreen(page, 'parameters');
        await filterBy(page, language, filters);
        await expectRecords(page, language, count);
        if (count === 0) await expect(byId(page, ids.gridEmpty)).toBeVisible();
        else await expect(byId(page, ids.gridEmpty)).toHaveCount(0);
      });
    }

    test('combine step by step and show the status of the matching Tags', async ({ page, language }) => {
      await openScreen(page, 'parameters');
      await filterBy(page, language, { line: 'E1' });
      await expectRecords(page, language, 60);
      await filterBy(page, language, { machine: 'E1-extruder' });
      await expectRecords(page, language, 16);
      await filterBy(page, language, { search: 'temp' });
      await expectRecords(page, language, 7);
      await filterBy(page, language, { status: 'high' });
      await expectRecords(page, language, 0);
      await expect(byId(page, ids.gridEmpty)).toContainText(text(language, 'parameters.grid-empty'));
      await filterBy(page, language, { status: 'normal' });
      await expectRecords(page, language, 7);
      // Seeded data: High Tags are E1-extruder.motor-current and E1-puller.belt-pressure, Low is E2-saw.power.
      await filterBy(page, language, { search: '', machine: 'E1-extruder' });
      await filterBy(page, language, { status: 'high' });
      await expect(gridRows(page)).toHaveCount(1);
      await expect(gridRows(page).first()).toContainText('motor-current');
      await expect(gridRows(page).first().getByRole('cell').nth(CELL.status)).toHaveText(text(language, tagStatusLabels.high));
    });
  });

  test.describe('trend', () => {
    test('asks to select Tags, takes up to 4 and refuses the fifth with the message', async ({ page, language }) => {
      await openScreen(page, 'parameters');
      await expect(byId(page, ids.trendEmpty)).toHaveText(text(language, 'trend-error.nothing-selected'));
      await filterBy(page, language, { machine: 'E1-extruder' });
      await selectFourUnitTags(page, language, 4);
      await selectedCount(page, language, MAX_TREND_TAGS);
      await expect(byId(page, ids.trendEmpty)).toHaveCount(0);
      const fifth = selectBox(page, language, tagId('E1-extruder', 'vibration'));
      await fifth.click();
      await expect(byId(page, ids.trendLimit)).toHaveText(text(language, 'trend-error.trend-limit'));
      await expect(fifth).not.toBeChecked();
      await selectedCount(page, language, MAX_TREND_TAGS);
      // The fifth does nothing: the four chosen Tags stay drawn.
      expect(await tableRows(chartTable(page, ids.trend)).then(rows => new Set(rows.map(row => row[0])).size)).toBe(4);
      // Clearing one makes room again and clears the message.
      await selectBox(page, language, tagId('E1-extruder', 'motor-current')).uncheck();
      await expect(byId(page, ids.trendLimit)).toHaveCount(0);
      await fifth.check();
      await selectedCount(page, language, MAX_TREND_TAGS);
      // The native select-all of more than 4 visible Tags is refused the same way.
      await filterBy(page, language, { search: 'temp' });
      await page.getByLabel(text(language, 'parameters.select-all-tags')).click();
      await expect(byId(page, ids.trendLimit)).toBeVisible();
    });

    test('select all takes every visible Tag when there are 4 or fewer', async ({ page, language }) => {
      await openScreen(page, 'parameters');
      await filterBy(page, language, { search: 'puller-speed' });
      await expectRecords(page, language, 2);
      await page.getByLabel(text(language, 'parameters.select-all-tags')).check();
      await selectedCount(page, language, 2);
      await expect.poll(async () => new Set((await tableRows(chartTable(page, ids.trend))).map(row => row[0])).size).toBe(2);
      await expect(byId(page, ids.trendLimit)).toHaveCount(0);
    });

    test('draws 4 value axes with distinct names for 4 units and offers the three windows', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      await openScreen(page, 'parameters');
      await filterBy(page, language, { machine: 'E1-extruder' });
      await selectFourUnitTags(page, language, 4);
      await expect.poll(async () => (await readChart(page, ids.trend)).texts.length).toBeGreaterThan(10);
      const chart = await readChart(page, ids.trend);
      const all = chart.texts.map(item => item.text);
      for (const [, unit] of FOUR_UNITS) expect(all.filter(item => item === unit), `axis name ${unit}`).toHaveLength(1);
      // Tick labels carry the unit of their own axis, one distinct unit per axis.
      const tickUnits = new Set(all.flatMap(item => item.match(/^[\d.,]+ (\S+)$/)?.[1] ?? []));
      expect([...tickUnits].sort()).toEqual(FOUR_UNITS.map(([, unit]) => unit).sort());
      expect(all.filter(item => item === text(language, 'common.time'))).toHaveLength(1);
      expect(all).toContain(`E1-extruder · ${FOUR_UNITS[0][0]}`);

      const windows = Object.keys(TREND_WINDOWS) as TrendWindowId[];
      for (const window of windows) {
        await choose(page, ids.trendWindow, text(language, trendWindowLabels[window]));
        const { ticks, step } = TREND_WINDOWS[window];
        const expected = trendTicks(window, 0).map(tick => formatTime(language, simulatedTime(tick)));
        expect(expected).toHaveLength(ticks / step);
        await expect.poll(async () => (await tableRows(chartTable(page, ids.trend))).length, window).toBe(4 * expected.length);
        const rows = await tableRows(chartTable(page, ids.trend));
        for (const [index, [name]] of FOUR_UNITS.entries()) {
          const mine = rows.slice(index * expected.length, (index + 1) * expected.length);
          expect(mine.every(row => row[0] === `E1-extruder · ${name}`), `${window} series ${name}`).toBe(true);
          expect(mine.map(row => row[1]), `${window} times of ${name}`).toEqual(expected);
        }
        await expect(byId(page, ids.trendWindow)).toContainText(text(language, trendWindowLabels[window]));
      }
      errors.expectNone();
    });

    test('labels the time axis with distinct, increasing times in every window', async ({ page, language }) => {
      await openScreen(page, 'parameters');
      await filterBy(page, language, { machine: 'E1-extruder' });
      await selectFourUnitTags(page, language, 1);
      for (const window of Object.keys(TREND_WINDOWS) as TrendWindowId[]) {
        await choose(page, ids.trendWindow, text(language, trendWindowLabels[window]));
        await expect.poll(async () => (await readChart(page, ids.trend)).texts.filter(item => /^\d{2}:\d{2}$/.test(item.text)).length, window).toBeGreaterThan(2);
        const ticks = (await readChart(page, ids.trend)).texts.filter(item => /^\d{2}:\d{2}$/.test(item.text)).sort((a, b) => a.x - b.x).map(item => item.text);
        // The labels show hours and minutes, so two ticks with the same label would read as a mistake.
        expect(new Set(ticks).size, `${window} tick labels ${ticks.join(' ')}`).toBe(ticks.length);
        expect(ticks, `${window} ticks increase`).toEqual([...ticks].sort());
      }
    });

    test('keeps chart text clear of other text and of the plot for 1 to 4 Tags, in light, dark and compact', async ({ page, language }) => {
      test.setTimeout(150_000);
      const errors = noConsoleErrors(page);
      await openScreen(page, 'parameters');
      await filterBy(page, language, { machine: 'E1-extruder' });
      const variants = [
        { theme: 'theme.light', density: 'density.comfortable' }, { theme: 'theme.dark', density: 'density.comfortable' },
        { theme: 'theme.dark', density: 'density.compact' }, { theme: 'theme.light', density: 'density.compact' },
      ] as const;
      // The limit lines of each Tag carry a label ("Minimum: 360 V") that sits on the plot by design.
      const limitLabel = new RegExp(`^(${escapeRegExp(text(language, 'common.minimum'))}|${escapeRegExp(text(language, 'common.maximum'))}): `);
      let selected = 0;
      for (const n of [1, 2, 3, 4]) {
        await selectFourUnitTags(page, language, n, selected);
        selected = n;
        for (const variant of variants) {
          await segment(page, TEST_IDS.shell.theme, text(language, variant.theme));
          await segment(page, TEST_IDS.shell.density, text(language, variant.density));
          await expect.poll(async () => {
            const chart = await readChart(page, ids.trend);
            const names = chart.texts.filter(item => FOUR_UNITS.slice(0, n).some(([, unit]) => item.text === unit)).length;
            return names === n && chart.plot ? chartCollisions(chart, label => limitLabel.test(label)) : [`axis names ${names} of ${n}, plot ${chart.plot ? 'found' : 'missing'}`];
          }, `${n} Tags, ${variant.theme}, ${variant.density}`).toEqual([]);
        }
      }
      errors.expectNone();
    });
  });

  test.describe('Setpoint Override', () => {
    // E1-puller.puller-speed is writable, limits 0.5 to 3.0 m/min, with one decimal and a recipe value.
    const MACHINE = 'E1-puller';
    const NAME = 'puller-speed';
    const TAG = tagId(MACHINE, NAME);
    const UNIT = 'm/min';
    const open = async (page: Page, language: Locale) => {
      await openScreen(page, 'parameters');
      await filterBy(page, language, { machine: MACHINE, search: NAME });
      await expectRecords(page, language, 1);
      return rowOf(page, NAME);
    };
    const type = async (page: Page, language: Locale, value: number, reason: string) => {
      await byId(page, ids.overrideValue).fill(String(value).replace('.', decimalSeparator(language)));
      await byId(page, ids.overrideReason).fill(reason);
    };

    test('applies a valid value, shows the decimal comma, and logs old and new value in the Control Event Log', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      const row = await open(page, language);
      const separator = decimalSeparator(language);
      const setpoint = row.getByRole('cell').nth(CELL.setpoint);
      const oldShown = (await setpoint.textContent())!;
      await row.getByTestId(ids.override).click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toContainText(`${text(language, 'parameters.recipe-value')}: ${oldShown} ${UNIT}`);
      await expect(byId(page, ids.overrideValue)).toHaveValue(oldShown);
      // 2,5 in pt-BR means 2.5, and the field keeps showing the comma. In en the same value is 2.5.
      await type(page, language, 2.5, 'parity check');
      await expect(byId(page, ids.overrideValue)).toHaveValue(`2${separator}5`);
      await byId(page, ids.overrideApply).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(setpoint).toHaveText(formatTagValue(language, 2.5, UNIT));
      await expect(setpoint).toHaveText(`2${separator}5`);
      await expect(row.getByTestId(ids.override)).toBeFocused();
      // The new setpoint is what the dialog offers next time, in the locale's format.
      await row.getByTestId(ids.override).click();
      await expect(byId(page, ids.overrideValue)).toHaveValue(`2${separator}5`);
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      // Reset to recipe value restores the recipe setpoint, and it is logged too.
      await expect(row.getByTestId(ids.resetRecipe)).toHaveAttribute('aria-disabled', 'false');
      await row.getByTestId(ids.resetRecipe).click();
      await expect(setpoint).toHaveText(oldShown);
      await expect(row.getByTestId(ids.resetRecipe)).toHaveAttribute('aria-disabled', 'true');
      await expect(row.getByTestId(ids.resetRecipe)).toHaveAccessibleDescription(new RegExp(escapeRegExp(text(language, 'parameters.recipe-value-unchanged'))));

      await byId(page, shellNavId('control')).click();
      const log = byId(page, TEST_IDS.control.eventLog);
      const override = log.getByRole('row').filter({ hasText: text(language, 'event-action.setpoint-override') }).filter({ hasText: TAG });
      const reset = log.getByRole('row').filter({ hasText: text(language, 'event-action.reset-to-recipe') }).filter({ hasText: TAG });
      await expect(override).toHaveCount(1);
      await expect(reset).toHaveCount(1);
      await expect(override).toContainText('parity check');
      const numbers = async (locator: typeof override) => (await locator.getByRole('cell').allTextContents())
        .filter(cell => /^-?\d+[.,]\d+$/.test(cell.trim())).map(cell => parseNumber(language, cell));
      const [before, after] = await numbers(override);
      expect(before).toBeCloseTo(parseNumber(language, oldShown), 1);
      expect(after).toBeCloseTo(2.5, 5);
      const [resetBefore, resetAfter] = await numbers(reset);
      expect(resetBefore).toBeCloseTo(2.5, 5);
      expect(resetAfter).toBeCloseTo(parseNumber(language, oldShown), 1);
      errors.expectNone();
    });

    test('rejects a missing reason and values outside the minimum and maximum with the core error text', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      const row = await open(page, language);
      const setpoint = row.getByRole('cell').nth(CELL.setpoint);
      const before = await setpoint.textContent();
      await row.getByTestId(ids.override).click();
      await byId(page, ids.overrideValue).fill(String(2.5).replace('.', decimalSeparator(language)));
      await byId(page, ids.overrideApply).click();
      await expect(byId(page, ids.overrideError)).toHaveText(text(language, plantErrorLabels['reason-required']));
      await expect(dialog(page)).toBeVisible();
      for (const value of [3.1, 0.4, 30]) {
        await type(page, language, value, 'parity check');
        await byId(page, ids.overrideApply).click();
        await expect(byId(page, ids.overrideError), `value ${value}`).toHaveText(text(language, plantErrorLabels['value-out-of-range']));
        await expect(dialog(page)).toBeVisible();
      }
      // Editing a field clears the error.
      await byId(page, ids.overrideReason).fill('another reason');
      await expect(byId(page, ids.overrideError)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(setpoint).toHaveText(before!);
      // Nothing was logged.
      await byId(page, shellNavId('control')).click();
      await expect(byId(page, TEST_IDS.control.eventLog)).toBeVisible();
      await expect(byId(page, TEST_IDS.control.eventLog).getByRole('row').filter({ hasText: TAG })).toHaveCount(0);
      errors.expectNone();
    });

    test('opens and closes the dialog without console errors and returns focus to the button that opened it', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      const row = await open(page, language);
      const opener = row.getByTestId(ids.override);
      // Mouse then Cancel, keyboard then Escape, Escape again, then the close button of the dialog.
      await opener.click();
      await expect(dialog(page)).toBeVisible();
      await dialog(page).getByRole('button', { name: text(language, 'action.cancel') }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
      await opener.hover();
      await opener.click();
      await expect(dialog(page)).toBeVisible();
      await dialog(page).getByRole('button').first().click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
      errors.expectNone();
    });

    test('does not allow an override of a read-only Tag and says why', async ({ page, language }) => {
      await openScreen(page, 'parameters');
      await filterBy(page, language, { machine: 'E1-extruder', search: 'motor-current' });
      const row = rowOf(page, 'motor-current');
      const override = row.getByTestId(ids.override);
      await expect(override).toHaveAttribute('aria-disabled', 'true');
      await expect(override).toHaveAccessibleDescription(text(language, plantErrorLabels['tag-not-writable']));
      await override.click({ force: true });
      await expect(dialog(page)).toHaveCount(0);
      await override.focus();
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toHaveCount(0);
    });

    test('does not allow an override or reset of Stale Tags of an Offline Machine and says why', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      await openScreen(page, 'parameters');
      // Seeded data: A2-reinforcement-insert is the one Offline Machine and its 11 Tags are the Stale ones.
      await filterBy(page, language, { status: 'stale' });
      await expectRecords(page, language, 11);
      const stale = text(language, plantErrorLabels['tag-stale']);
      const rows = await gridRows(page).all();
      expect(rows.length).toBeGreaterThan(3);
      for (const row of rows) {
        await expect(row).toContainText('A2-reinforcement-insert');
        await expect(row.getByRole('cell').nth(CELL.status)).toHaveText(text(language, tagStatusLabels.stale));
        const override = row.getByTestId(ids.override);
        await expect(override).toHaveAttribute('aria-disabled', 'true');
        await expect(override).toHaveAccessibleDescription(stale);
        await override.click({ force: true });
        await expect(dialog(page)).toHaveCount(0);
        const reset = row.getByTestId(ids.resetRecipe);
        await expect(reset).toHaveAttribute('aria-disabled', 'true');
        await expect(reset).toHaveAccessibleDescription(new RegExp(escapeRegExp(stale)));
        await reset.click({ force: true });
      }
      await expect(byId(page, ids.trendLimit)).toHaveCount(0);
      // The Machine itself is listed as Offline.
      await expect(byId(page, ids.connectivity).getByRole('row').filter({ hasText: 'A2-reinforcement-insert' }))
        .toContainText(text(language, linkStatusLabels.offline));
      errors.expectNone();
    });

    test('Stale Tags stop updating while live Tags keep changing with the clock', async ({ page, language }) => {
      await page.clock.install();
      await page.goto('/#/parameters');
      await page.locator('[data-app-root]').waitFor();
      const values = async (machine: string) => {
        await expect(gridRows(page).first()).toContainText(machine);
        return gridRows(page).evaluateAll(rows => rows.map(row => [...row.querySelectorAll('[role="cell"]')][4]?.textContent));
      };
      await filterBy(page, language, { machine: 'E1-extruder' });
      const live = await values('E1-extruder');
      await page.clock.fastForward(5_000);
      await page.clock.runFor(2_000);
      await expect.poll(() => values('E1-extruder')).not.toEqual(live);
      await filterBy(page, language, { machine: 'A2-reinforcement-insert' });
      const stale = await values('A2-reinforcement-insert');
      await page.clock.fastForward(5_000);
      await page.clock.runFor(2_000);
      expect(await values('A2-reinforcement-insert')).toEqual(stale);
    });
  });

  test('connectivity lists every Machine with its link status and last seen time, Offline first', async ({ page, language }) => {
    await openScreen(page, 'parameters');
    const table = byId(page, ids.connectivity);
    await expect(table.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(dataset.machines.length);
    const rows = await table.getByRole('row').filter({ has: page.getByRole('cell') })
      .evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent ?? '').trim())));
    expect(rows.map(row => row[1]).sort()).toEqual(dataset.machines.map(machine => machine.id).sort());
    const rank = [linkStatusLabels.offline, linkStatusLabels.degraded, linkStatusLabels.online].map(key => text(language, key));
    const order = rows.map(row => rank.indexOf(row[2]!));
    expect(order.every(index => index >= 0), 'every status is a known link status').toBe(true);
    expect(order, 'Offline first, then Degraded, then Online').toEqual([...order].sort((a, b) => a - b));
    // Seeded data: one Offline Machine, two Degraded ones.
    expect(order.filter(index => index === 0)).toHaveLength(1);
    expect(order.filter(index => index === 1)).toHaveLength(2);
    expect(rows[0]![1]).toBe('A2-reinforcement-insert');
    for (const row of rows) {
      expect(row[0], 'Line id').toBe(dataset.machines.find(machine => machine.id === row[1])!.lineId);
      expect(row[3]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    }
    for (const header of ['scope.line', 'term.machine', 'parameters.link-status', 'parameters.last-seen'] as const) {
      await expect(table.getByRole('columnheader', { name: text(language, header), exact: true })).toBeVisible();
    }
  });

  test('has no console errors while filtering, selecting and changing the trend window', async ({ page, language }) => {
    const errors = noConsoleErrors(page);
    await openScreen(page, 'parameters');
    await filterBy(page, language, { line: 'E1', status: 'normal', search: 'temp' });
    await selectBox(page, language, tagId('E1-extruder', 'motor-temperature')).check();
    await choose(page, ids.trendWindow, text(language, trendWindowLabels['2h']));
    await expect(byId(page, ids.trend)).toBeVisible();
    await readChart(page, ids.trend);
    errors.expectNone();
  });
});
