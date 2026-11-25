import type { Locator, Page } from '@playwright/test';
import { en, ptBR } from '@swatchbook/core';
import { expect, other, type Locale } from './harness';

/** The page never scrolls sideways: the document is not wider than the viewport. */
export async function expectNoPageOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'document scrollWidth <= viewport width').toBeLessThanOrEqual(clientWidth);
}

/** Every visible header cell shows its whole text (not clipped) and never breaks a word across lines. */
export async function expectHeadersIntact(scope: Locator): Promise<void> {
  const problems = await scope.evaluate(root => {
    const found: string[] = [];
    for (const th of root.querySelectorAll('th')) {
      if (!th.checkVisibility() || (th.textContent ?? '').trim() === '') continue;
      const name = (th.textContent ?? '').trim();
      if (th.scrollWidth > th.clientWidth) found.push(`clipped: ${name} (${th.scrollWidth} > ${th.clientWidth})`);
      const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const data = (node as Text).data;
        for (const word of data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index!);
          range.setEnd(node, word.index! + word[0].length);
          const tops = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
          if (tops.size > 1) found.push(`word broken across lines: "${word[0]}" in ${name}`);
        }
      }
    }
    return found;
  });
  expect(problems, 'header cells').toEqual([]);
}

/** Every row of the table keeps all its columns inside the table box: the table is not wider than its container. */
export async function expectTableFits(table: Locator, columns: number): Promise<void> {
  await expect(table.locator('table')).toHaveCount(1);
  const info = await table.evaluate(root => {
    const real = root.querySelector('table')!;
    const hosts = [...root.querySelectorAll('*')].filter(el => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth);
    for (const el of hosts) el.setAttribute('data-overflow', `${el.scrollWidth} > ${el.clientWidth}`);
    const cells = [...real.querySelectorAll('tbody tr:not([aria-hidden]) td')].slice(0, 20);
    const outside = cells.filter(cell => cell.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length;
    return {
      // Leaf columns: header cells that do not span several columns (a grouped header such as Change has colSpan 2).
      leafHeaders: [...real.querySelectorAll('thead th')].filter(th => (th as HTMLTableCellElement).colSpan === 1 && (th as HTMLElement).checkVisibility()).length,
      scrollers: hosts.map(el => `${root.getAttribute('data-testid')}: scrollWidth > clientWidth (${el.getAttribute('data-overflow')})`),
      outside,
    };
  });
  expect(info.leafHeaders, 'visible leaf column headers').toBe(columns);
  expect(info.scrollers, 'elements scrolling sideways inside the table').toEqual([]);
  expect(info.outside, 'cells beyond the viewport').toBe(0);
}

/** Returns the visible text nodes of the page, including open popups, trimmed. */
const visibleTexts = (page: Page): Promise<string[]> => page.evaluate(() => {
  const found: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    const text = (node.textContent ?? '').trim();
    if (!element || !text || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) continue;
    if (element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) found.push(text);
  }
  return found;
});

/** In a non-English language no visible text equals (or contains, for long strings) an English-only dictionary value. */
export async function expectNoForeignLanguage(page: Page, language: Locale): Promise<void> {
  const foreign = other(language) === 'en' ? en : ptBR;
  const own = language === 'en' ? en : ptBR;
  const ownValues = new Set(Object.values(own));
  const differing = (Object.keys(foreign) as (keyof typeof foreign)[])
    .map(key => foreign[key] as string)
    .filter(value => !value.includes('{') && value.trim().length > 0 && !ownValues.has(value));
  const texts = await visibleTexts(page);
  const leaks = texts.flatMap(text => differing.filter(value => text === value || (value.length >= 12 && text.includes(value))).map(value => `"${value}" in "${text}"`));
  expect(leaks, `${other(language)} text visible in ${language}`).toEqual([]);
}

/** Escape only reaches a dialog once focus is inside it, so wait for that before pressing the key. */
export async function pressEscapeInside(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
}
