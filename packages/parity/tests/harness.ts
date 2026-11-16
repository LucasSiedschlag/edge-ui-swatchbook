import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { PREFERENCES_KEY, en, ptBR, t, type Locale, type MessageKey, type ScreenId } from '@swatchbook/core';

export { expect };
export { TEST_IDS, SCREENS, SHORTCUTS, shellNavId } from '@swatchbook/core';
export type { Locale, MessageKey, ScreenId };

/** The only thing that differs between the two projects. */
export type Options = { language: Locale };

export const test = base.extend<Options>({
  language: ['en', { option: true }],
  // Seed the language before the app loads. Only when nothing is stored, so a switch made in a test survives a reload.
  page: async ({ page, language }, use) => {
    await page.addInitScript(([key, lang]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ language: lang }));
    }, [PREFERENCES_KEY, language] as const);
    await use(page);
  },
});

/** Expected texts come from the core dictionaries, never from the app under test. */
export const dictionary = { en, 'pt-BR': ptBR };
export const text = (language: Locale, key: MessageKey, params?: Record<string, string | number>) => t(language, key, params);
export const other = (language: Locale): Locale => (language === 'en' ? 'pt-BR' : 'en');

/** Opens a Screen by hash route with the clock frozen at a tick. */
export async function openScreen(page: Page, screen: ScreenId, tick = 0): Promise<void> {
  await page.goto(`/?tick=${tick}#/${screen}`);
  await page.locator('[data-app-root]').waitFor();
}

/** Locator for an id taken from TEST_IDS or shellNavId. */
export const byId = (page: Page, id: string): Locator => page.getByTestId(id);

/** Collects console errors and page errors. Call `expectNone()` at the end of the check. */
export function noConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  return { expectNone: () => expect(errors, 'console and page errors').toEqual([]) };
}

/** Runs a check at another desktop width, for example 1280 px, then restores the viewport. */
export async function atWidth(page: Page, width: number, check: () => Promise<void>): Promise<void> {
  const before = page.viewportSize() ?? { width: 1440, height: 900 };
  await page.setViewportSize({ width, height: before.height });
  try { await check(); } finally { await page.setViewportSize(before); }
}
export const atMinWidth = (page: Page, check: () => Promise<void>) => atWidth(page, 1280, check);

/** Chooses an option of a segmented control (radio group). */
export const segment = (page: Page, id: string, label: string) => byId(page, id).getByText(label, { exact: true }).click();

/** The visible rows of the open select popup. Native to Ant Design; other Libraries replace this one selector. */
export const popupOptions = (page: Page): Locator => page.locator('.ant-select-dropdown:visible .ant-select-item-option');

/** Chooses an option of a select by its visible text. */
export async function pick(page: Page, id: string, label: string): Promise<void> {
  await byId(page, id).click();
  await popupOptions(page).filter({ hasText: label }).click();
}
