import type { Locator, Page } from '@playwright/test';
import { en, ptBR, generateMockDataset, tr, type Locale, type MessageKey } from '@swatchbook/core';
import { byId, expect, noConsoleErrors, test as base, text } from './harness';

export { expect };

/** Every check also fails on any console or page error. */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors = noConsoleErrors(page);
    await use();
    errors.expectNone();
  }, { auto: true }],
});

/** The seeded Mock Dataset, only used to name things (areas, lines, Products), never to compute expected counts. */
export const dataset = generateMockDataset();
export const name = (language: Locale, ref: { key: string; params?: Record<string, string | number> }) => tr(language, ref as Parameters<typeof tr>[1]);

/** Types like a user, one key at a time, replacing the current content. */
export async function typeValue(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.pressSequentially(value);
}
/** Types a value and commits it with Enter or blur (Tab). */
export async function editField(field: Locator, value: string, commit: 'enter' | 'blur' = 'blur'): Promise<void> {
  await typeValue(field, value);
  await field.press(commit === 'enter' ? 'Enter' : 'Tab');
}

/** Every English dictionary entry as a full-string matcher, for the pt-BR leak check. Keys whose pt-BR text is identical are skipped. */
export function englishMatchers(): RegExp[] {
  const ptValues = new Set(Object.values(ptBR));
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (Object.keys(en) as MessageKey[])
    .filter(key => en[key] !== ptBR[key] && !ptValues.has(en[key]))
    .map(key => new RegExp(`^${escape(en[key]).replace(/\\\{[a-z]+\\\}/g, '.+?')}$`));
}

/** Exactly the English strings Ant Design renders itself that the Library cannot translate through the dictionaries. */
export const KNOWN_ANT_ENGLISH = ['down', 'Increase Value', 'Decrease Value'];

/**
 * In pt-BR no visible text, accessible name, placeholder or title may be a string of the core en dictionary.
 * Strings that are neither English dictionary text nor Portuguese dictionary text are returned as findings, for the report.
 */
export async function portugueseLeaks(page: Page): Promise<{ leaks: string[]; unknown: string[] }> {
  const strings = await page.evaluate(() => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && (box.width > 0 || box.height > 0);
    };
    const found = new Set<string>();
    const add = (value: string | null | undefined) => { const trimmed = value?.replace(/\s+/g, ' ').trim(); if (trimmed) found.add(trimmed); };
    for (const element of document.querySelectorAll('body *')) {
      if (element.closest('script,style')) continue;
      if (!visible(element) && !element.closest('[data-app-root] [style*="clip"]')) continue;
      for (const attribute of ['aria-label', 'placeholder', 'title']) add(element.getAttribute(attribute));
      for (const node of element.childNodes) if (node.nodeType === Node.TEXT_NODE) add(node.textContent);
    }
    return [...found];
  });
  const english = englishMatchers();
  const portuguese = Object.values(ptBR).map(value => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z]+\\\}/g, '.+?')}$`));
  const leaks = strings.filter(value => !KNOWN_ANT_ENGLISH.includes(value) && english.some(pattern => pattern.test(value)));
  const unknown = strings.filter(value => !leaks.includes(value) && !portuguese.some(pattern => pattern.test(value)) && /[A-Za-z]{3,}/.test(value));
  return { leaks, unknown };
}

// ---- Recipes ----

export const recipeIds = (page: Page) => byId(page, 'recipes.library').locator('tbody tr[aria-label] td:first-child').allTextContents();
export const recipeRow = (page: Page, id: string) => byId(page, 'recipes.library').locator(`tbody tr[aria-label^="${id},"]`);
export const openRecipe = (page: Page, id: string) => recipeRow(page, id).getByRole('button').click();
export const parameterField = (page: Page, language: Locale, parameterKey: MessageKey, fieldKey: 'common.minimum' | 'term.setpoint' | 'common.maximum') =>
  page.getByRole('spinbutton', { name: text(language, 'recipes.parameter-field', { parameter: text(language, parameterKey), field: text(language, fieldKey) }), exact: true });
export const setpoint = (page: Page, language: Locale, parameterKey: MessageKey) => parameterField(page, language, parameterKey, 'term.setpoint');
