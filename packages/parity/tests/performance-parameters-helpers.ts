import { decimalSeparator } from '@swatchbook/core';
import type { Locator, Page } from '@playwright/test';
import { byId, expect, popupOptions, type Locale } from './harness';

/**
 * Chooses an option of a select. A select that is still closing can swallow the click, so the whole step retries.
 * `option` is a 0 based index (independent of translated names) or the visible text.
 */
export async function choose(page: Page, id: string, option: number | string): Promise<void> {
  await expect(async () => {
    await page.keyboard.press('Escape');
    await byId(page, id).click();
    const options = popupOptions(page);
    await (typeof option === 'number' ? options.nth(option) : options.filter({ hasText: option })).click({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
}
export const pickByIndex = choose;

/** Parses a displayed number such as "52,5%", "+0.8 pp" or "1.234" in the given language. Grouping is dropped. */
export function parseNumber(language: Locale, shown: string): number {
  const decimal = decimalSeparator(language);
  const group = decimal === ',' ? '.' : ',';
  const cleaned = shown.replace(/[^\d.,+\-−]/g, '').split(group).join('').replace(decimal, '.').replace('−', '-');
  return Number(cleaned);
}

/** Every shared chart wrapper also renders an accessible data table next to the drawing, with this id suffix. */
export const chartTable = (page: Page, testId: string): Locator => byId(page, `${testId}-data`);

export async function tableRows(table: Locator): Promise<string[][]> {
  const rows = table.locator('tbody tr');
  // The charts load lazily, so wait for the first row before reading.
  await rows.first().waitFor({ state: 'attached' });
  return rows.evaluateAll(trs => trs.map(tr => [...tr.children].map(cell => (cell.textContent ?? '').trim())));
}

export interface Box { x: number; y: number; width: number; height: number }
export interface ChartText extends Box { text: string }
export interface ChartGeometry { host: Box; plot: Box | null; texts: ChartText[] }

/**
 * Reads the drawing of a chart. Only text that is really painted counts: text clipped away or cut off (for example the pages
 * of a scrolling legend) is not hit by elementsFromPoint and is left out. The plot is the box of the horizontal grid lines.
 */
export async function readChart(page: Page, testId: string): Promise<ChartGeometry> {
  const frame = byId(page, testId);
  // The drawing is mounted lazily and again whenever the chart is rebuilt.
  await frame.locator('svg').first().waitFor({ state: 'attached' });
  await frame.locator('svg').first().scrollIntoViewIfNeeded();
  return frame.evaluate(element => {
    const drawing = element.querySelector('svg')!;
    const box = (rect: DOMRect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    const host = drawing.getBoundingClientRect();
    const texts = [...drawing.querySelectorAll('text')].flatMap(node => {
      const rect = node.getBoundingClientRect();
      const text = (node.textContent ?? '').trim();
      if (!text || !rect.width || !rect.height) return [];
      // Painted over its whole width: a legend item cut off by the legend's own clip (it scrolls in pages) is left out.
      const painted = [rect.x + 1, rect.x + rect.width / 2, rect.x + rect.width - 1]
        .every(x => document.elementsFromPoint(x, rect.y + rect.height / 2).includes(node));
      return painted ? [{ text, ...box(rect) }] : [];
    });
    const lines = [...drawing.querySelectorAll('path')].map(path => path.getBoundingClientRect())
      .filter(rect => rect.height === 0 && rect.width > host.width * 0.4);
    const plot = lines.length ? {
      x: Math.min(...lines.map(rect => rect.left)), y: Math.min(...lines.map(rect => rect.top)),
      width: Math.max(...lines.map(rect => rect.right)) - Math.min(...lines.map(rect => rect.left)),
      height: Math.max(...lines.map(rect => rect.bottom)) - Math.min(...lines.map(rect => rect.top)),
    } : null;
    return { host: box(host), plot, texts };
  });
}

/**
 * Text boxes include the line gap of the font, and the lines of a wrapped label are set tighter than that box.
 * Each box is shrunk vertically by 3 px per side so that only glyphs that really collide count.
 */
const LINE_GAP = 3;
const overlaps = (a: Box, b: Box, tolerance = 0.5) =>
  a.x + tolerance < b.x + b.width && b.x + tolerance < a.x + a.width &&
  a.y + LINE_GAP < b.y + b.height - LINE_GAP && b.y + LINE_GAP < a.y + a.height - LINE_GAP;

/**
 * Human readable list of every pair of painted texts that overlap, and of texts that cross the plot. Empty when clean.
 * `mayBeInPlot` names the texts that are drawn on the plot by design, such as the labels of limit lines.
 */
export function chartCollisions(chart: ChartGeometry, mayBeInPlot: (text: string) => boolean = () => false): string[] {
  const problems: string[] = [];
  const { texts, plot } = chart;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlaps(texts[i]!, texts[j]!)) problems.push(`text "${texts[i]!.text}" overlaps "${texts[j]!.text}"`);
    }
    if (plot && !mayBeInPlot(texts[i]!.text) && overlaps(texts[i]!, plot)) problems.push(`text "${texts[i]!.text}" overlaps the plot`);
  }
  return problems;
}

/** The Shell header can scroll the page; a Screen must not add a horizontal scrollbar. */
export async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
}

/** The words (of every matched element) that are broken across two lines. Empty when no word is broken in the middle. */
export function wordsStayWhole(locator: Locator): Promise<string[]> {
  return locator.evaluateAll(elements => elements.flatMap(element => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        const tops = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
        if (tops.size > 1) broken.push(match[0]);
      }
    }
    return broken;
  }));
}
