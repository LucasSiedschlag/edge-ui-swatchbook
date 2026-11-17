import { LIBRARIES, PRESETS } from '@swatchbook/runtime';
import { SCREENS, SHORTCUTS, TEST_IDS, TOUR_STEPS, screenLabels, shellNavId } from '@swatchbook/core';
import { atMinWidth, byId, expect, noConsoleErrors, openScreen, other, pick, popupOptions, segment, test, text } from './harness';

const root = (page: import('@playwright/test').Page) => page.locator('[data-app-root]');
const hash = (page: import('@playwright/test').Page) => page.evaluate(() => location.hash);

test.describe('Shell', () => {
  test('shows the six navigation items and navigating changes the hash and the selected item', async ({ page, language }) => {
    await openScreen(page, 'deck');
    for (const screen of SCREENS) {
      await expect(byId(page, shellNavId(screen.id))).toHaveCount(1);
      await expect(byId(page, shellNavId(screen.id))).toContainText(text(language, screenLabels[screen.id]));
    }
    for (const screen of SCREENS) {
      await byId(page, shellNavId(screen.id)).click();
      await expect.poll(() => hash(page)).toMatch(new RegExp(`^#/${screen.id}`));
      await expect(byId(page, shellNavId(screen.id))).toHaveClass(/selected/);
      for (const rest of SCREENS.filter(s => s.id !== screen.id)) await expect(byId(page, shellNavId(rest.id))).not.toHaveClass(/selected/);
    }
  });

  test('lists the built Library and shows the others as not built without navigating', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await byId(page, TEST_IDS.shell.libraryPicker).click();
    const options = popupOptions(page);
    await expect(options).toHaveCount(LIBRARIES.length);
    for (const library of LIBRARIES) {
      const option = options.filter({ hasText: library.name });
      await expect(option).toBeVisible();
      if (library.status === 'built') await expect(option).not.toContainText(text(language, 'shell.library-not-built'));
      else await expect(option).toContainText(text(language, 'shell.library-not-built'));
    }
    const before = page.url();
    const planned = LIBRARIES.find(library => library.status !== 'built')!;
    await options.filter({ hasText: planned.name }).click({ force: true });
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
  });

  test('switches the language, the visible text and the document language, and keeps it after reload', async ({ page, language }) => {
    await openScreen(page, 'deck');
    const target = other(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await segment(page, TEST_IDS.shell.language, text(language, target === 'en' ? 'language.english' : 'language.portuguese'));
    await expect(page.locator('html')).toHaveAttribute('lang', target);
    await expect(byId(page, shellNavId('deck'))).toContainText(text(target, screenLabels.deck));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', target);
    await expect(byId(page, shellNavId('deck'))).toContainText(text(target, screenLabels.deck));
  });

  test('switches theme and density and keeps them after reload', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await expect(root(page)).toHaveAttribute('data-theme', 'light');
    await expect(root(page)).toHaveAttribute('data-density', 'comfortable');
    await segment(page, TEST_IDS.shell.theme, text(language, 'theme.dark'));
    await segment(page, TEST_IDS.shell.density, text(language, 'density.compact'));
    await expect(root(page)).toHaveAttribute('data-theme', 'dark');
    await expect(root(page)).toHaveAttribute('data-density', 'compact');
    await page.reload();
    await expect(root(page)).toHaveAttribute('data-theme', 'dark');
    await expect(root(page)).toHaveAttribute('data-density', 'compact');
  });

  test('presets apply theme and density together', async ({ page, language }) => {
    await openScreen(page, 'deck');
    const expected = { 'control-room': ['dark', 'compact'], night: ['dark', 'comfortable'], office: ['light', 'comfortable'] } as const;
    expect(PRESETS.map(preset => preset.id).sort()).toEqual(Object.keys(expected).sort());
    for (const id of ['control-room', 'night', 'office'] as const) {
      await pick(page, TEST_IDS.shell.preset, text(language, `preset.${id}`));
      const [theme, density] = expected[id];
      await expect(root(page)).toHaveAttribute('data-theme', theme);
      await expect(root(page)).toHaveAttribute('data-density', density);
    }
  });

  test('runs the Tour with start, next, previous and finish', async ({ page, language }) => {
    await openScreen(page, 'control');
    const banner = byId(page, TEST_IDS.shell.tour);
    await expect(banner).toHaveCount(0);
    await byId(page, TEST_IDS.shell.tourStart).click();
    await expect(banner).toHaveAttribute('role', 'status');
    await expect.poll(() => hash(page)).toMatch(/^#\/deck/);
    const total = TOUR_STEPS.length;
    const step = (index: number) => text(language, 'tour.progress', { current: index + 1, total });
    await expect(banner).toContainText(text(language, 'screen.deck'));
    await expect(banner).toContainText(text(language, 'tour.deck.note'));
    await expect(banner).toContainText(step(0));
    await expect(byId(page, TEST_IDS.shell.tourPrevious)).toBeDisabled();
    await byId(page, TEST_IDS.shell.tourNext).click();
    await expect.poll(() => hash(page)).toMatch(/^#\/recipes/);
    await expect(banner).toContainText(step(1));
    await byId(page, TEST_IDS.shell.tourPrevious).click();
    await expect.poll(() => hash(page)).toMatch(/^#\/deck/);
    await expect(banner).toContainText(step(0));
    await byId(page, TEST_IDS.shell.tourFinish).click();
    await expect(banner).toHaveCount(0);
  });

  test('falls back to the Deck on an invalid hash', async ({ page }) => {
    await page.goto('/?tick=0#/nowhere');
    await expect.poll(() => hash(page)).toMatch(/^#\/deck/);
    await expect(byId(page, shellNavId('deck'))).toHaveClass(/selected/);
  });

  for (const screen of SCREENS) {
    test(`has no console errors on ${screen.id}`, async ({ page }) => {
      const errors = noConsoleErrors(page);
      await openScreen(page, screen.id);
      await expect(byId(page, shellNavId(screen.id))).toHaveClass(/selected/);
      await page.waitForLoadState('networkidle');
      errors.expectNone();
    });
  }

  test('keeps the Shell usable at 1280 px', async ({ page }) => {
    await openScreen(page, 'deck');
    await atMinWidth(page, async () => {
      for (const id of Object.values(TEST_IDS.shell).filter(id => !id.startsWith('shell.tour'))) await expect(byId(page, id)).toBeVisible();
    });
  });

  test.describe('shortcuts', () => {
    const goScreen = SHORTCUTS.flatMap(({ key, action }) => (action.type === 'go-screen' ? [{ key, screen: action.screen }] : []));

    test('1 to 6 go to the Screens', async ({ page }) => {
      expect(goScreen).toHaveLength(SCREENS.length);
      await openScreen(page, 'control');
      for (const { key, screen } of goScreen) {
        await page.keyboard.press(key);
        await expect.poll(() => hash(page)).toMatch(new RegExp(`^#/${screen}`));
      }
    });

    test('are ignored while typing in an input', async ({ page }) => {
      await openScreen(page, 'recipes');
      const search = byId(page, TEST_IDS.recipes.search);
      await search.click();
      await page.keyboard.press(goScreen.find(entry => entry.screen === 'ledger')!.key);
      await expect(search).toBeFocused();
      expect(await hash(page)).toMatch(/^#\/recipes/);
    });

    test('are ignored behind an open dialog', async ({ page }) => {
      await openScreen(page, 'deck');
      await byId(page, TEST_IDS.deck.estop).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press(goScreen.find(entry => entry.screen === 'ledger')!.key);
      expect(await hash(page)).toMatch(/^#\/deck/);
      await expect(page.getByRole('dialog')).toBeVisible();
    });
  });
});
