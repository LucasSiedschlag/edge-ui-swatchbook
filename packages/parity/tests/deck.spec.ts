import type { Page } from '@playwright/test';
import { TEST_IDS, lineStatusLabels, stopReasonLabels, type LineId } from '@swatchbook/core';
import { atMinWidth, byId, expect, noConsoleErrors, openScreen, popupOptions, shellNavId, test, text, type Locale } from './harness';
import { expectHeadersIntact, expectNoForeignLanguage, expectNoPageOverflow, pressEscapeInside } from './deck-control-helpers';

const ids = TEST_IDS.deck;
const dialog = (page: Page) => page.getByRole('dialog');
const pickLine = async (page: Page, line: LineId) => {
  await byId(page, ids.lineSelect).click();
  // The option text is the Line id followed directly by its name, so match the prefix only (ids are prefix-unique).
  await popupOptions(page).filter({ hasText: new RegExp(`^${line}`) }).click();
};
const status = (language: Locale, key: keyof typeof lineStatusLabels) => text(language, lineStatusLabels[key]);
const reason = (language: Locale, key: keyof typeof stopReasonLabels) => text(language, stopReasonLabels[key]);

// Seeded Mock Dataset at tick 0, read from the core views (deckView / lineStatus): E1 is in Alarm with one Critical Alarm,
// A2 is stopped by a Fault, C1 has no Batch, every other Line is Running. Only E1 has a Critical Alarm.
const SEEDED_STATUS: Record<LineId, keyof typeof lineStatusLabels> = { E1: 'alarm', E2: 'running', RF1: 'running', P1: 'running', C1: 'running', A1: 'running', A2: 'stopped' };

test.describe('Operations Live Deck', () => {
  test('has every required test id, the conditional ones only when their element exists', async ({ page }) => {
    await openScreen(page, 'deck');
    const always = [ids.lineSelect, ids.lineStatus, ids.batch, ids.batchProgress, ids.kpiOee, ids.kpiOutput, ids.kpiCycle, ids.kpiScrap, ids.alarmBanner, ids.pause, ids.resume, ids.estop, ids.reset, ids.handover, ids.shift];
    for (const id of always) await expect(byId(page, id), id).toHaveCount(1);
    // Absent on E1 at load: stop reason, Batch empty state, KPI empty note, Shift empty state, dialogs, action error.
    for (const id of [ids.stopReason, ids.batchEmpty, ids.kpiEmpty, ids.shiftEmpty, ids.estopConfirm, ids.handoverNote, ids.actionError]) await expect(byId(page, id), id).toHaveCount(0);
    await byId(page, ids.estop).click();
    await expect(byId(page, ids.estopConfirm)).toHaveCount(1);
    await pressEscapeInside(page, dialog(page));
    await expect(byId(page, ids.estopConfirm)).toHaveCount(0);
    await byId(page, ids.handover).click();
    await expect(byId(page, ids.handoverNote)).toHaveCount(1);
    await pressEscapeInside(page, dialog(page));
    await pickLine(page, 'A2');
    await expect(byId(page, ids.stopReason)).toHaveCount(1);
    await pickLine(page, 'C1');
    for (const id of [ids.batchEmpty, ids.kpiEmpty]) await expect(byId(page, id), id).toHaveCount(1);
    await expect(byId(page, ids.batchProgress)).toHaveCount(0);
  });

  test('the Line selector lists the seven Lines, each with its status, and E1 is the default', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await expect(byId(page, ids.lineSelect)).toContainText('E1');
    await byId(page, ids.lineSelect).click();
    const options = popupOptions(page);
    await expect(options).toHaveCount(7);
    for (const [line, state] of Object.entries(SEEDED_STATUS)) {
      const option = options.filter({ hasText: new RegExp(`^${line}`) });
      await expect(option, line).toHaveCount(1);
      await expect(option, line).toContainText(status(language, state));
    }
    await page.keyboard.press('Escape');
    for (const [line, state] of Object.entries(SEEDED_STATUS)) {
      await pickLine(page, line as LineId);
      await expect(byId(page, ids.lineStatus), line).toHaveText(status(language, state));
    }
  });

  test('Pause stops the Line with its reason, Resume runs it again', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await pickLine(page, 'E2');
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'running'));
    await expect(byId(page, ids.stopReason)).toHaveCount(0);
    await expect(byId(page, ids.resume)).toBeDisabled();
    await byId(page, ids.pause).click();
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'stopped'));
    await expect(byId(page, ids.stopReason)).toHaveText(reason(language, 'paused'));
    await expect(byId(page, ids.pause)).toBeDisabled();
    await expect(byId(page, ids.resume)).toBeEnabled();
    await byId(page, ids.resume).click();
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'running'));
    await expect(byId(page, ids.stopReason)).toHaveCount(0);
  });

  test('Pause is per Line: the other Lines keep their status', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await pickLine(page, 'E2');
    await byId(page, ids.pause).click();
    await pickLine(page, 'RF1');
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'running'));
    await byId(page, ids.lineSelect).click();
    await expect(popupOptions(page).filter({ hasText: /^E2/ })).toContainText(status(language, 'stopped'));
  });

  test('Emergency stop asks for confirmation, latches the Line until Reset, and Reset clears the latch', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await pickLine(page, 'E2');
    await byId(page, ids.estop).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(text(language, 'deck.estop-confirm.title'));
    await expect(dialog(page)).toContainText(text(language, 'deck.estop-confirm.body'));
    // Cancelling changes nothing.
    await dialog(page).getByRole('button', { name: text(language, 'action.cancel') }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'running'));
    await expect(byId(page, ids.reset)).toBeDisabled();
    // Confirming stops and latches.
    await byId(page, ids.estop).click();
    await byId(page, ids.estopConfirm).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'stopped'));
    await expect(byId(page, ids.stopReason)).toHaveText(reason(language, 'emergency-stop'));
    await expect(byId(page, ids.reset)).toBeEnabled();
    await expect(byId(page, ids.resume)).toBeDisabled();
    await expect(byId(page, ids.pause)).toBeDisabled();
    await expect(byId(page, ids.estop)).toBeDisabled();
    // Reset clears the latch. The plant core then holds the Line stopped (Paused by operator) until someone resumes it.
    await byId(page, ids.reset).click();
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'stopped'));
    await expect(byId(page, ids.stopReason)).toHaveText(reason(language, 'paused'));
    await expect(byId(page, ids.reset)).toBeDisabled();
    await expect(byId(page, ids.resume)).toBeEnabled();
    await byId(page, ids.resume).click();
    await expect(byId(page, ids.lineStatus)).toHaveText(status(language, 'running'));
    await expect(byId(page, ids.stopReason)).toHaveCount(0);
    await expect(byId(page, ids.estop)).toBeEnabled();
  });

  test('the Critical Alarm banner states the count with the right plural form and expands and collapses', async ({ page, language }) => {
    await openScreen(page, 'deck');
    const banner = byId(page, ids.alarmBanner);
    const toggle = banner.getByRole('button');
    // One Critical Alarm on E1 (singular form). Zero on every other Line (plural form, cannot expand).
    // Literal forms from the core dictionaries: deck.alarm-count.one / deck.alarm-count.other.
    await expect(banner).toContainText(text(language, 'deck.alarm-count.one', { count: 1 }));
    await expect(banner).not.toContainText(text(language, 'deck.alarm-count.other', { count: 1 }));
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveText(text(language, 'action.expand-banner'));
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(banner.locator('table')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveText(text(language, 'action.collapse-banner'));
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The list shows Machine, message and age of the one Critical Alarm (E1 extruder, AL-0160, raised 6 min before tick 0).
    await expect(banner.locator('table')).toHaveCount(1);
    await expect(banner.locator('tbody tr')).toHaveCount(1);
    await expect(banner.locator('th')).toHaveText([text(language, 'term.machine'), text(language, 'common.message'), text(language, 'common.age')]);
    await expect(banner.locator('tbody tr')).toContainText(text(language, 'machine.extruder'));
    await expect(banner.locator('tbody tr')).toContainText(/6\s?min/);
    await toggle.click();
    await expect(banner.locator('table')).toHaveCount(0);
    await pickLine(page, 'E2');
    await expect.poll(async () => (await banner.innerText()).split('\n')[0]).toBe(text(language, 'deck.alarm-count.other', { count: 0 }));
    await expect(banner).toContainText(text(language, 'deck.alarm-empty'));
    await expect(toggle).toBeDisabled();
    await toggle.click({ force: true });
    await expect(banner.locator('table')).toHaveCount(0);
  });

  test('the Batch block shows the active Batch and its empty state on Line C1', async ({ page, language }) => {
    await openScreen(page, 'deck');
    const batch = byId(page, ids.batch);
    // Seeded E1 Batch: B-E1-00701, LOT-E1-00701, DOR-1L-80, Recipe Version 2, 154 of 411 units. The percent is locale formatted.
    for (const literal of ['B-E1-00701', 'LOT-E1-00701', 'DOR-1L-80', '154', '411']) await expect(batch).toContainText(literal);
    for (const key of ['common.batch-id', 'term.lot', 'common.product', 'event-target.recipe-version', 'common.start', 'deck.batch-elapsed', 'deck.batch-produced', 'deck.batch-target'] as const) await expect(batch).toContainText(text(language, key));
    await expect(byId(page, ids.batchProgress)).toHaveText(language === 'en' ? '154 of 411 (37.5%)' : '154 de 411 (37,5%)');
    await expect(byId(page, ids.batchProgress).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37.5');
    await expect(byId(page, ids.batchEmpty)).toHaveCount(0);
    await pickLine(page, 'C1');
    await expect(byId(page, ids.batchEmpty)).toHaveText(text(language, 'deck.batch-empty'));
    await expect(byId(page, ids.batchProgress)).toHaveCount(0);
    await expect(batch).not.toContainText('B-E1-00701');
  });

  test('the KPI block shows line speed for Extrusion and cycle time versus takt for Assembly', async ({ page, language }) => {
    await openScreen(page, 'deck');
    for (const id of [ids.kpiOee, ids.kpiOutput, ids.kpiCycle, ids.kpiScrap]) await expect(byId(page, id), id).toBeVisible();
    await expect(byId(page, ids.kpiOee)).toContainText(text(language, 'deck.kpi-oee'));
    await expect(byId(page, ids.kpiOee)).toContainText(language === 'en' ? '65.4%' : '65,4%');
    await expect(byId(page, ids.kpiOutput)).toContainText(text(language, 'deck.kpi-output'));
    await expect(byId(page, ids.kpiScrap)).toContainText(text(language, 'deck.kpi-scrap'));
    // E1 (Extrusion): line speed in m/min, no takt.
    await expect(byId(page, ids.kpiCycle)).toContainText(text(language, 'deck.kpi-speed'));
    await expect(byId(page, ids.kpiCycle)).toContainText(language === 'en' ? '2.1' : '2,1');
    await expect(byId(page, ids.kpiCycle)).toContainText('m/min');
    await expect(byId(page, ids.kpiCycle)).not.toContainText(text(language, 'deck.kpi-takt'));
    // A1 (Assembly): cycle time versus takt, both in seconds (seeded cycle 120 s).
    await pickLine(page, 'A1');
    await expect(byId(page, ids.kpiCycle)).toContainText(text(language, 'deck.kpi-cycle'));
    await expect(byId(page, ids.kpiCycle)).toContainText(text(language, 'deck.kpi-takt'));
    await expect(byId(page, ids.kpiCycle)).toContainText('120');
    await expect(byId(page, ids.kpiCycle)).not.toContainText(text(language, 'deck.kpi-speed'));
    // The empty note only shows when the Line has nothing live: C1.
    await expect(byId(page, ids.kpiEmpty)).toHaveCount(0);
    await pickLine(page, 'C1');
    await expect(byId(page, ids.kpiEmpty)).toHaveText(text(language, 'deck.kpi-empty'));
  });

  test('the Shift block shows the current Shift with its time left', async ({ page, language }) => {
    await openScreen(page, 'deck');
    const shift = byId(page, ids.shift);
    // Seeded clock: Shift 1, 06:00 to 14:00, 8 h left at tick 0.
    await expect(shift).toContainText(text(language, 'deck.shift'));
    await expect(shift).toContainText(text(language, 'shift.first'));
    await expect(shift).toContainText(text(language, 'deck.shift-remaining'));
    await expect(shift).toContainText(/8\s?h/);
    await expect(shift).toContainText('06:00');
    await expect(shift).toContainText('14:00');
    await expect(byId(page, ids.shiftEmpty)).toHaveCount(0);
  });

  test('the Shift handover requires a note, then records it and closes', async ({ page, language }) => {
    await openScreen(page, 'deck');
    await byId(page, ids.handover).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(text(language, 'deck.handover-note'));
    await expect(byId(page, ids.handoverNote)).toHaveAttribute('placeholder', text(language, 'deck.handover-placeholder'));
    const submit = dialog(page).getByRole('button', { name: text(language, 'action.submit-handover') });
    // An empty or blank note is refused with the required-note message and the dialog stays open.
    await submit.click();
    await expect(dialog(page)).toContainText(text(language, 'plant-error.note-required'));
    await byId(page, ids.handoverNote).fill('   ');
    await submit.click();
    await expect(dialog(page)).toContainText(text(language, 'plant-error.note-required'));
    await expect(dialog(page)).toBeVisible();
    await byId(page, ids.handoverNote).fill('Die changed, scrap bin emptied.');
    await submit.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(text(language, 'plant-error.note-required'))).toHaveCount(0);
    await expect(byId(page, ids.handover)).toBeFocused();
    // The handover is logged: the Event Log on Screen 6 shows the newest entry first.
    await byId(page, shellNavId('control')).click();
    const firstRow = byId(page, TEST_IDS.control.eventLog).locator('tbody tr:not([aria-hidden])').first();
    await expect(firstRow).toContainText(text(language, 'event-action.shift-handover'));
    await expect(firstRow).toContainText('Die changed, scrap bin emptied.');
  });

  test('the note-required error is exposed as deck.action-error', async ({ page, language }) => {
    // Contract: the only action refusal an Operator can reach is the empty handover note. Spec lists deck.action-error as required.
    await openScreen(page, 'deck');
    await byId(page, ids.handover).click();
    await dialog(page).getByRole('button', { name: text(language, 'action.submit-handover') }).click();
    await expect(byId(page, ids.actionError)).toContainText(text(language, 'plant-error.note-required'));
  });

  test('Escape closes the dialogs and returns focus to the button that opened them', async ({ page }) => {
    await openScreen(page, 'deck');
    for (const id of [ids.estop, ids.handover]) {
      await byId(page, id).click();
      await pressEscapeInside(page, dialog(page));
      await expect(dialog(page)).toHaveCount(0);
      await expect(byId(page, id)).toBeFocused();
    }
    // Same through the keyboard only: focus the button, Enter opens, Escape closes.
    await byId(page, ids.handover).focus();
    await page.keyboard.press('Enter');
    await pressEscapeInside(page, dialog(page));
    await expect(dialog(page)).toHaveCount(0);
    await expect(byId(page, ids.handover)).toBeFocused();
  });

  test('keyboard shortcuts are ignored behind an open dialog and the Line does not change', async ({ page }) => {
    await openScreen(page, 'deck');
    for (const id of [ids.estop, ids.handover]) {
      await byId(page, id).click();
      await expect(dialog(page)).toBeVisible();
      for (const key of ['3', '6', 'a']) await page.keyboard.press(key);
      expect(await page.evaluate(() => location.hash)).toMatch(/^#\/deck/);
      await pressEscapeInside(page, dialog(page));
      await expect(dialog(page)).toHaveCount(0);
    }
    // Back on the Screen, a shortcut works again.
    await page.keyboard.press('3');
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/ledger/);
  });

  test('typing digits into the handover note does not navigate', async ({ page }) => {
    await openScreen(page, 'deck');
    await byId(page, ids.handover).click();
    await byId(page, ids.handoverNote).click();
    await page.keyboard.type('line 3 a 6');
    await expect(byId(page, ids.handoverNote)).toHaveValue('line 3 a 6');
    expect(await page.evaluate(() => location.hash)).toMatch(/^#\/deck/);
  });

  test('keyboard order reaches the Line selector, the banner button and the five actions in reading order', async ({ page }) => {
    await openScreen(page, 'deck');
    const order: string[] = [ids.lineSelect, ids.alarmBanner, ids.pause, ids.estop, ids.handover];
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const visited: string[] = [];
    for (let i = 0; i < 80 && visited.length < order.length; i += 1) {
      await page.keyboard.press('Tab');
      const hit = await page.evaluate(() => {
        let el: Element | null = document.activeElement;
        while (el && !el.getAttribute('data-testid')) el = el.parentElement;
        return el?.getAttribute('data-testid') ?? null;
      });
      if (hit && order.includes(hit) && !visited.includes(hit)) visited.push(hit);
    }
    expect(visited).toEqual(order);
  });

  test('has no horizontal page overflow at 1440 and 1280 px', async ({ page }) => {
    await openScreen(page, 'deck');
    await expectNoPageOverflow(page);
    await byId(page, ids.alarmBanner).getByRole('button').click();
    await atMinWidth(page, () => expectNoPageOverflow(page));
  });

  test('keeps the banner list headers and every block inside the viewport at 1440 and 1280 px', async ({ page }) => {
    await openScreen(page, 'deck');
    await byId(page, ids.alarmBanner).getByRole('button').click();
    await expectHeadersIntact(byId(page, ids.alarmBanner));
    await atMinWidth(page, async () => {
      await expectHeadersIntact(byId(page, ids.alarmBanner));
      for (const id of Object.values(ids).filter(id => !([ids.stopReason, ids.batchEmpty, ids.estopConfirm, ids.handoverNote, ids.actionError, ids.kpiEmpty, ids.shiftEmpty] as string[]).includes(id))) {
        const box = await byId(page, id).boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.x + box!.width, `${id} inside the viewport`).toBeLessThanOrEqual(1280);
      }
    });
  });

  test('shows no text of the other language and has no console errors', async ({ page, language }) => {
    const errors = noConsoleErrors(page);
    await openScreen(page, 'deck');
    await byId(page, ids.alarmBanner).getByRole('button').click();
    await expectNoForeignLanguage(page, language);
    await byId(page, ids.lineSelect).click();
    await expectNoForeignLanguage(page, language);
    await page.keyboard.press('Escape');
    await byId(page, ids.handover).click();
    await expectNoForeignLanguage(page, language);
    await pressEscapeInside(page, dialog(page));
    await byId(page, ids.estop).click();
    await expectNoForeignLanguage(page, language);
    await pressEscapeInside(page, dialog(page));
    await page.waitForLoadState('networkidle');
    errors.expectNone();
  });
});
