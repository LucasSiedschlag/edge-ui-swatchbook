import { decimalSeparator, downtimeLabels, generateMockDataset, performanceScopes, rangeLabels } from '@swatchbook/core';
import type { Page } from '@playwright/test';
import { TEST_IDS, atMinWidth, byId, expect, noConsoleErrors, openScreen, segment, test, text, type Locale } from './harness';
import {
  chartCollisions, chartTable, choose, pageOverflow, parseNumber, pickByIndex, readChart, tableRows, wordsStayWhole,
} from './performance-parameters-helpers';

const ids = TEST_IDS.performance;
const RANGES = ['last-shift', 'last-24h', 'last-7d', 'last-30d'] as const;
const dataset = generateMockDataset();
const scopes = performanceScopes(dataset);
const lineScope = (lineId: string) => scopes.findIndex(option => option.kind === 'line' && option.id === lineId);
const HOUR = 3_600_000;

const range = (page: Page, language: Locale, id: (typeof RANGES)[number]) => choose(page, ids.range, text(language, rangeLabels[id]));

/** Reads one KPI card from its displayed text only. */
async function readKpi(page: Page, language: Locale, id: string) {
  const lines = (await byId(page, id).innerText()).split('\n').map(line => line.trim()).filter(Boolean);
  const after = (label: string) => lines.find(line => line.startsWith(`${label}: `))?.slice(label.length + 2) ?? '';
  const value = lines.find(line => /^\d+[.,]\d%$/.test(line)) ?? '';
  const previous = after(text(language, 'performance.previous'));
  const change = after(text(language, 'performance.change'));
  return { value, previous, change, pct: parseNumber(language, value), previousPct: parseNumber(language, previous), changePp: parseNumber(language, change) };
}
const PARTS = [ids.availability, ids.performance, ids.quality] as const;

async function readOee(page: Page, language: Locale) {
  return { oee: await readKpi(page, language, ids.oee), parts: await Promise.all(PARTS.map(id => readKpi(page, language, id))) };
}

/** A timestamp from a displayed "date time" or "date" label in the language's own date order. */
function parseStamp(language: Locale, shown: string): number {
  const [date = '', time = '00:00'] = shown.split(' ');
  const [a, b, year] = date.split('/').map(Number) as [number, number, number];
  const [month, day] = language === 'en' ? [a, b] : [b, a];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return Date.UTC(year, month - 1, day, hour, minute);
}

test.describe('Plant Performance Center', () => {
  test('shows the required test ids, and the empty state for a Line with no production', async ({ page, language }) => {
    const errors = noConsoleErrors(page);
    await openScreen(page, 'performance');
    for (const id of [ids.scope, ids.range, ids.oee, ids.availability, ids.performance, ids.quality, ids.pareto, ids.output, ids.shiftHistory]) {
      await expect(byId(page, id), id).toHaveCount(1);
      await expect(byId(page, id), id).toBeVisible();
    }
    await expect(byId(page, ids.paretoReason)).toHaveCount(8);
    await expect(byId(page, ids.empty)).toHaveCount(0);
    // Seeded data: the CNC Line (C1) produced nothing in the last completed Shift, but did in the last 24 hours.
    await pickByIndex(page, ids.scope, lineScope('C1'));
    await expect(byId(page, ids.empty)).toBeVisible();
    await expect(byId(page, ids.empty)).toContainText(text(language, 'performance.empty'));
    for (const id of [ids.oee, ids.availability, ids.performance, ids.quality, ids.pareto, ids.output, ids.shiftHistory]) await expect(byId(page, id), id).toHaveCount(0);
    await expect(byId(page, ids.scope)).toBeVisible();
    await expect(byId(page, ids.range)).toBeVisible();
    await range(page, language, 'last-24h');
    await expect(byId(page, ids.empty)).toHaveCount(0);
    await expect(byId(page, ids.oee)).toBeVisible();
    errors.expectNone();
  });

  test('changing the scope and the range changes the numbers', async ({ page, language }) => {
    await openScreen(page, 'performance');
    // Site, the first Area and the first Line of the Last shift all differ.
    const seen = new Set<string>();
    for (const index of [0, scopes.findIndex(option => option.kind === 'area'), lineScope('E1')]) {
      await pickByIndex(page, ids.scope, index);
      await expect.poll(async () => (await readKpi(page, language, ids.oee)).value).not.toBe('');
      const { value } = await readKpi(page, language, ids.oee);
      const output = (await tableRows(chartTable(page, ids.output))).map(row => row.join('|')).join(';');
      expect(seen.has(`${value}#${output}`), `scope ${index} must change the numbers`).toBe(false);
      seen.add(`${value}#${output}`);
    }
    await pickByIndex(page, ids.scope, 0);
    // Each range has its own bucket count: 8 and 24 hours, then days that include the partial first and last day.
    const buckets: Record<string, number> = {};
    for (const id of RANGES) {
      await range(page, language, id);
      await expect(byId(page, ids.range)).toContainText(text(language, rangeLabels[id]));
      buckets[id] = (await tableRows(chartTable(page, ids.output))).length;
    }
    expect(buckets).toEqual({ 'last-shift': 8, 'last-24h': 24, 'last-7d': 8, 'last-30d': 31 });
    // The range help states which ranges are fixed and which are live.
    await expect(page.getByText(text(language, 'performance.range-help'))).toBeVisible();
  });

  test('OEE is the product of Availability, Performance and Quality and changes carry a sign', async ({ page, language }) => {
    test.setTimeout(120_000);
    const separator = decimalSeparator(language);
    const changeFormat = new RegExp(`^[+\\-\\u2212]\\d+\\${separator}\\d pp$`);
    await openScreen(page, 'performance');
    for (const scopeIndex of [0, scopes.findIndex(option => option.kind === 'area'), lineScope('A1')]) {
      await pickByIndex(page, ids.scope, scopeIndex);
      for (const id of RANGES) {
        await range(page, language, id);
        const label = `scope ${scopeIndex} ${id}`;
        await expect.poll(async () => (await readKpi(page, language, ids.oee)).previous, label).not.toBe('');
        const { oee, parts } = await readOee(page, language);
        const [availability, performance, quality] = parts as [typeof oee, typeof oee, typeof oee];
        // Percent values are shown with one decimal, so the product matches within rounding.
        expect(Math.abs(oee.pct - availability.pct * performance.pct * quality.pct / 10000), `${label} OEE`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(oee.previousPct - availability.previousPct * performance.previousPct * quality.previousPct / 10000), `${label} previous OEE`).toBeLessThanOrEqual(0.1);
        for (const part of [oee, availability, performance, quality]) {
          expect(part.change, label).toMatch(changeFormat);
          expect(part.change.endsWith(' pp'), label).toBe(true);
          const difference = part.pct - part.previousPct;
          expect(Math.abs(part.changePp - difference), `${label} change ${part.change}`).toBeLessThanOrEqual(0.15);
          if (difference > 0.2) expect(part.change.startsWith('+'), `${label} ${part.change}`).toBe(true);
          if (difference < -0.2) expect(part.change.startsWith('+'), `${label} ${part.change}`).toBe(false);
        }
        // The KPI labels come from the dictionaries.
        await expect(byId(page, ids.availability)).toContainText(text(language, 'performance.availability'));
        await expect(byId(page, ids.performance)).toContainText(text(language, 'performance.performance'));
        await expect(byId(page, ids.quality)).toContainText(text(language, 'performance.quality'));
      }
    }
  });

  test.describe('Downtime Pareto', () => {
    const labelsOf = (language: Locale) => Object.values(downtimeLabels).map(key => text(language, key));

    test('is sorted largest to smallest with cumulative percent, and shows all 8 reasons', async ({ page, language }) => {
      await openScreen(page, 'performance');
      for (const id of RANGES) {
        await range(page, language, id);
        const rows = await tableRows(chartTable(page, ids.pareto));
        const minutes = rows.map(row => parseNumber(language, row[1]!));
        const share = rows.map(row => parseNumber(language, row[2]!));
        const cumulative = rows.map(row => parseNumber(language, row[3]!));
        expect(minutes, id).toEqual([...minutes].sort((a, b) => b - a));
        const total = minutes.reduce((sum, value) => sum + value, 0);
        let running = 0;
        rows.forEach((_, index) => {
          running += share[index]!;
          expect(Math.abs(share[index]! - minutes[index]! / total * 100), `${id} share ${index}`).toBeLessThanOrEqual(0.11);
          expect(Math.abs(cumulative[index]! - running), `${id} cumulative ${index}`).toBeLessThanOrEqual(0.2);
        });
        expect(cumulative.at(-1), id).toBeCloseTo(100, 1);
        expect(cumulative, id).toEqual([...cumulative].sort((a, b) => a - b));
        // The buttons list the same reasons in the same order.
        await expect(byId(page, ids.paretoReason), id).toHaveCount(rows.length);
        for (const [index, row] of rows.entries()) {
          await expect(byId(page, ids.paretoReason).nth(index), id).toHaveText(
            `${row[0]} · ${text(language, 'performance.minutes')}: ${row[1]} · ${text(language, 'performance.share')}: ${row[2]}`);
        }
      }
      await range(page, language, 'last-shift');
      // Seeded data: the Site has downtime for all 8 reasons in the Last shift.
      const rows = await tableRows(chartTable(page, ids.pareto));
      expect(rows.map(row => row[0]).sort()).toEqual(labelsOf(language).sort());
      expect(rows).toHaveLength(8);
    });

    test('draws every reason label whole in the axis, also the long Portuguese one', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      await openScreen(page, 'performance');
      const chart = await readChart(page, ids.pareto);
      const words = new Set(labelsOf(language).flatMap(label => label.split(/\s+/)));
      const known = new Set([text(language, 'performance.minutes'), text(language, 'performance.series.cumulative-percentage')]);
      // Everything painted that is not a numeric tick or an axis name is a piece of a reason label.
      const pieces = chart.texts.map(item => item.text).filter(item => !known.has(item) && !/^[\d.,\s]+%?$/.test(item));
      const painted = new Set(pieces.flatMap(piece => piece.split(/\s+/)));
      for (const piece of pieces.flatMap(item => item.split(/\s+/))) expect(words.has(piece), `"${piece}" is not a whole word of a reason label`).toBe(true);
      for (const word of words) expect(painted.has(word), `word "${word}" is not drawn`).toBe(true);
      // The drawn label lines of one reason are stacked in one column, so each label fits its slot.
      const longest = labelsOf(language).sort((a, b) => b.length - a.length)[0]!;
      expect(longest.length).toBeGreaterThan(14);
      await expect(byId(page, ids.paretoReason).filter({ hasText: longest })).toHaveCount(1);
      // Axis ticks keep the core unit precision for minutes (none) and zero decimals for the cumulative percent.
      for (const item of chart.texts.map(entry => entry.text)) {
        if (item.endsWith('%')) expect(item).toMatch(/^\d+%$/);
        else if (/^[\d.,]+$/.test(item)) expect(item).toMatch(/^\d{1,3}(?:[.,]\d{3})*$|^\d+$/);
      }
      expect(chartCollisions(chart)).toEqual([]);
      errors.expectNone();
    });

    test('selects a reason by click and by keyboard and exposes aria-pressed and the selected summary', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      await openScreen(page, 'performance');
      const rows = await tableRows(chartTable(page, ids.pareto));
      const buttons = byId(page, ids.paretoReason);
      const summaryTitle = page.getByText(text(language, 'performance.selected-reason'), { exact: true });
      await expect(summaryTitle).toHaveCount(0);
      for (const index of rows.keys()) await expect(buttons.nth(index)).toHaveAttribute('aria-pressed', 'false');
      const pressedOnly = async (index: number) => {
        for (const other of rows.keys()) await expect(buttons.nth(other)).toHaveAttribute('aria-pressed', other === index ? 'true' : 'false');
        // The summary is the smallest block that holds the title, so it is the native labeled description.
        const summary = page.locator('div').filter({ has: summaryTitle }).filter({ hasText: text(language, 'performance.share') }).last();
        await expect(summary).toContainText(rows[index]![0]!);
        await expect(summary).toContainText(text(language, 'performance.minutes'));
        await expect(summary).toContainText(text(language, 'performance.share'));
        await expect(summary).toContainText(rows[index]![1]!);
        await expect(summary).toContainText(rows[index]![2]!);
        await expect(summary.locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')).toHaveCount(0);
      };
      await buttons.nth(2).click();
      await pressedOnly(2);
      await buttons.nth(4).focus();
      await page.keyboard.press('Enter');
      await pressedOnly(4);
      await buttons.nth(5).focus();
      await page.keyboard.press('Space');
      await pressedOnly(5);
      // Tab reaches the buttons one after another.
      await buttons.nth(5).focus();
      await page.keyboard.press('Tab');
      await expect(buttons.nth(6)).toBeFocused();
      await page.keyboard.press('Enter');
      await pressedOnly(6);
      // Changing the range clears the selection.
      await range(page, language, 'last-30d');
      await expect(summaryTitle).toHaveCount(0);
      errors.expectNone();
    });

    test('selects a reason by clicking its bar in the chart', async ({ page }) => {
      await openScreen(page, 'performance');
      const chart = await readChart(page, ids.pareto);
      const centers = await byId(page, ids.pareto).locator('svg path').evaluateAll((paths, plot) => paths.flatMap(path => {
        const rect = path.getBoundingClientRect();
        const fill = path.getAttribute('fill');
        const isBar = fill && fill !== 'none' && rect.height > 2 && rect.width > 20 && Math.abs(rect.bottom - (plot!.y + plot!.height)) < 2;
        return isBar ? [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] : [];
      }).sort((a, b) => a.x - b.x), chart.plot);
      expect(centers).toHaveLength(8);
      await page.mouse.click(centers[1]!.x, centers[1]!.y);
      await expect(byId(page, ids.paretoReason).nth(1)).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('Output versus target', () => {
    for (const id of RANGES) {
      test(`${id}: axis names, tick labels and buckets`, async ({ page, language }) => {
        const errors = noConsoleErrors(page);
        await openScreen(page, 'performance');
        await range(page, language, id);
        const daily = id === 'last-7d' || id === 'last-30d';
        const rows = await tableRows(chartTable(page, ids.output));
        const stamps = rows.map(row => parseStamp(language, row[0]!));
        // Hours step by one hour. Days step by one day from midnight, the first day may start later (partial day).
        const steps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]!);
        if (!daily) expect(steps.every(step => step === HOUR), `${id} hourly steps ${steps}`).toBe(true);
        else expect(stamps.slice(1).every(stamp => new Date(stamp).getUTCHours() === 0), `${id} daily buckets start at midnight`).toBe(true);
        if (daily) expect(steps.slice(1).every(step => step === 24 * HOUR), `${id} daily steps ${steps}`).toBe(true);
        expect(rows.length).toBe({ 'last-shift': 8, 'last-24h': 24, 'last-7d': 8, 'last-30d': 31 }[id]);

        const chart = await readChart(page, ids.output);
        const all = chart.texts.map(item => item.text);
        const timeTicks = chart.texts.filter(item => /^\d{2}:\d{2}$/.test(item.text));
        const dateTicks = chart.texts.filter(item => /^\d{2}\/\d{2}\/\d{4}$/.test(item.text));
        const ticks = daily ? dateTicks : timeTicks;
        expect(daily ? timeTicks : dateTicks, 'tick labels of the other kind').toEqual([]);
        expect(ticks.length).toBeGreaterThanOrEqual(2);
        // Tick density is automatic: with many buckets, not every bucket gets a label.
        if (id === 'last-30d' || id === 'last-24h') expect(ticks.length).toBeLessThan(rows.length);
        const unit = text(language, 'performance.output-units');
        const bucket = text(language, daily ? 'performance.day' : 'performance.hour');
        const otherBucket = text(language, daily ? 'performance.hour' : 'performance.day');
        expect(all.filter(item => item === unit)).toHaveLength(1);
        expect(all.filter(item => item === bucket)).toHaveLength(1);
        expect(all.filter(item => item === otherBucket)).toHaveLength(0);
        for (const series of ['good', 'scrap', 'target'] as const) expect(all, series).toContain(text(language, `performance.series.${series}`));
        // The bucket axis name is centered under the plot and below the tick labels, with a gap.
        const name = chart.texts.find(item => item.text === bucket)!;
        const plot = chart.plot!;
        expect(Math.abs(name.x + name.width / 2 - (plot.x + plot.width / 2)), 'axis name centered').toBeLessThanOrEqual(12);
        const lowest = Math.max(...ticks.map(item => item.y + item.height));
        expect(name.y - lowest, 'gap between tick labels and axis name').toBeGreaterThan(0);
        // The named label sits left of the plot (value axis name), not on top of it.
        expect(chartCollisions(chart)).toEqual([]);
        errors.expectNone();
      });
    }
  });

  test('lists the last 30 Shifts with the best and worst OEE marked as text', async ({ page, language }) => {
    await openScreen(page, 'performance');
    const table = byId(page, ids.shiftHistory);
    const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows).toHaveCount(30);
    const cells = await rows.evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent ?? '').replace(/\s+/g, ' ').trim())));
    const best = text(language, 'performance.best');
    const worst = text(language, 'performance.worst');
    const oee = cells.map(row => parseNumber(language, row[2]!.match(/\d+[.,]\d%/)![0]));
    const starts = cells.map(row => parseStamp(language, row[1]!));
    // Newest Shift first, one Shift (8 hours) apart.
    expect(starts.slice(1).every((stamp, index) => starts[index]! - stamp === 8 * HOUR), 'shifts step by 8 hours').toBe(true);
    const bestRows = cells.flatMap((row, index) => row[2]!.includes(best) ? [index] : []);
    const worstRows = cells.flatMap((row, index) => row[2]!.includes(worst) ? [index] : []);
    expect(bestRows).toHaveLength(1);
    expect(worstRows).toHaveLength(1);
    expect(oee[bestRows[0]!]).toBe(Math.max(...oee));
    expect(oee[worstRows[0]!]).toBe(Math.min(...oee));
    // Equal values choose the earliest Shift, which is the lowest row (the list is newest first).
    expect(bestRows[0]).toBe(oee.lastIndexOf(Math.max(...oee)));
    expect(worstRows[0]).toBe(oee.lastIndexOf(Math.min(...oee)));
    await expect(table).toContainText(text(language, 'performance.shift-output'));
    await expect(page.getByText(text(language, 'performance.shift-history-caption'))).toBeVisible();
    // No header word is broken in the middle.
    expect(await wordsStayWhole(table.getByRole('columnheader'))).toEqual([]);
  });

  test('Last 24 hours moves with the clock and Last 7 days and Last shift do not', async ({ page, language }) => {
    await page.clock.install();
    // No ?tick, so the live clock runs. Playwright's clock moves performance.now and the timers of the app.
    await page.goto('/#/performance');
    await page.locator('[data-app-root]').waitFor();
    const snapshot = async () => ({
      kpi: await byId(page, ids.oee).innerText(),
      output: await tableRows(chartTable(page, ids.output)),
      pareto: await tableRows(chartTable(page, ids.pareto)),
    });
    await range(page, language, 'last-7d');
    const week = await snapshot();
    await range(page, language, 'last-shift');
    const shift = await snapshot();
    await range(page, language, 'last-24h');
    const before = await snapshot();
    await page.clock.fastForward(HOUR + 120_000);
    await page.clock.runFor(2_000);
    await expect.poll(async () => (await snapshot()).output[0]![0], 'the first hour of the window rolls forward').not.toBe(before.output[0]![0]);
    const after = await snapshot();
    expect(after.output).toHaveLength(24);
    expect(after.kpi).not.toBe(before.kpi);
    await range(page, language, 'last-7d');
    expect(await snapshot()).toEqual(week);
    await range(page, language, 'last-shift');
    expect(await snapshot()).toEqual(shift);
  });

  test.describe('real browser layout', () => {
    test('chart text never overlaps text or the plot, in light and dark theme and compact density', async ({ page, language }) => {
      const errors = noConsoleErrors(page);
      await openScreen(page, 'performance');
      const variants = [
        { theme: 'theme.light', density: 'density.comfortable' }, { theme: 'theme.dark', density: 'density.comfortable' },
        { theme: 'theme.dark', density: 'density.compact' }, { theme: 'theme.light', density: 'density.compact' },
      ] as const;
      for (const variant of variants) {
        await segment(page, TEST_IDS.shell.theme, text(language, variant.theme));
        await segment(page, TEST_IDS.shell.density, text(language, variant.density));
        for (const id of RANGES) {
          await range(page, language, id);
          for (const chartId of [ids.pareto, ids.output]) {
            await expect.poll(async () => {
              const chart = await readChart(page, chartId);
              return chart.texts.length > 8 && chart.plot ? chartCollisions(chart) : ['chart not drawn yet'];
            }, `${chartId} ${id} ${variant.theme} ${variant.density}`).toEqual([]);
          }
        }
      }
      errors.expectNone();
    });

    for (const width of [1280, 1440]) {
      test(`has no page overflow at ${width} px`, async ({ page, language }) => {
        const run = async () => {
          await openScreen(page, 'performance');
          for (const id of RANGES) {
            await range(page, language, id);
            await expect(byId(page, ids.output)).toBeVisible();
            expect(await pageOverflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
          }
        };
        if (width === 1280) await atMinWidth(page, run);
        else await run();
      });
    }

    test('the long labels of a Pareto button and of the table headers wrap at spaces only', async ({ page }) => {
      await openScreen(page, 'performance');
      expect(await wordsStayWhole(byId(page, ids.paretoReason))).toEqual([]);
      expect(await wordsStayWhole(byId(page, ids.shiftHistory).getByRole('cell'))).toEqual([]);
    });
  });
});
