import type { Page } from '@playwright/test';
import { TEST_IDS, dependencyRuleLabels, formatList, lineTypeLabels, plantErrorLabels, recipeStatusLabels, ruleStatusLabels, stepKindLabels, tCount, type Locale, type MessageKey } from '@swatchbook/core';
import { atWidth, byId, openScreen, pick, popupOptions, text } from './harness';
import { editField, expect, openRecipe, parameterField, portugueseLeaks, recipeIds, recipeRow, setpoint, test, typeValue } from './recipes-ledger-helpers';

const ids = TEST_IDS.recipes;
const RULE_IDS = [ids.rule1, ids.rule2, ids.rule3, ids.rule4] as const;
const rule = (page: Page, n: 1 | 2 | 3 | 4) => byId(page, RULE_IDS[n - 1]!);
const ruleName = (language: Locale, n: 1 | 2 | 3 | 4) => text(language, dependencyRuleLabels[n]);
type Status = keyof typeof ruleStatusLabels;
async function expectRule(page: Page, language: Locale, n: 1 | 2 | 3 | 4, status: Status) {
  await expect(rule(page, n).getByText(text(language, ruleStatusLabels[status]), { exact: true })).toBeVisible();
  for (const other of (Object.keys(ruleStatusLabels) as Status[]).filter(key => key !== status)) {
    await expect(rule(page, n).getByText(text(language, ruleStatusLabels[other]), { exact: true })).toHaveCount(0);
  }
}
const versionLabel = (language: Locale, recipe: string, number: number, status: 'draft' | 'approved') =>
  text(language, 'recipes.version-option', { recipe, number, status: text(language, recipeStatusLabels[status]) });
const stepNames = (page: Page) => byId(page, ids.step).evaluateAll(steps => steps.map(step => step.getAttribute('aria-label')));
const buttonIn = (scope: ReturnType<typeof byId>, language: Locale, key: MessageKey) => scope.getByRole('button', { name: text(language, key), exact: true });

const ZONE3 = 'parameter.barrel-zone-3' as const;
const ZONE2 = 'parameter.barrel-zone-2' as const;
const DIE = 'parameter.die-pressure' as const;
const SCREW = 'parameter.screw-speed' as const;

/** R01 v3 is a seeded Draft: Barrel zone 3 is 198 and fails rule 1. Repairs it, with the Die pressure too, so Save and Approve open. */
async function repairR01(page: Page, language: Locale) {
  await editField(setpoint(page, language, DIE), '180');
  await editField(setpoint(page, language, ZONE3), '180');
  await expectRule(page, language, 1, 'pass');
  await expectRule(page, language, 2, 'pass');
}

test.describe('Recipes', () => {
  test.beforeEach(async ({ page }) => { await openScreen(page, 'recipes'); });

  test('exposes every required test id across its states', async ({ page, language }) => {
    const seen = new Set<string>();
    const note = async (id: string, count?: number) => {
      await (count === undefined ? expect(byId(page, id).first()).toBeAttached() : expect(byId(page, id)).toHaveCount(count));
      seen.add(id);
    };
    for (const id of [ids.library, ids.filterLineType, ids.filterStatus, ids.search]) await note(id, 1);
    await note(ids.empty, 0);
    await openRecipe(page, 'R01');
    await note(ids.version, 1); await note(ids.versionChoice, 1);
    await note(ids.step, 4); await note(ids.parameter, 11);
    for (const id of RULE_IDS) await note(id, 1);
    for (const id of [ids.save, ids.approve, ids.discard, ids.addStep]) await note(id, 1);
    await note(ids.newDraft, 0);
    await expect(byId(page, ids.stepChoice)).toHaveCount(0);
    // A removed Step can be added again, which shows the Step choice.
    await buttonIn(byId(page, ids.step).last(), language, 'action.remove-step').click();
    await note(ids.stepChoice, 1);
    await openRecipe(page, 'R11');
    await note(ids.newDraft, 1);
    await expect(byId(page, ids.parameterError)).toHaveCount(0);
    await openRecipe(page, 'R01');
    await editField(parameterField(page, language, ZONE3, 'common.minimum'), '999', 'enter');
    await note(ids.parameterError, 1);
    await byId(page, ids.search).fill('no-such-recipe');
    await note(ids.libraryEmpty, 1);
    await byId(page, ids.search).fill('');
    await expect(byId(page, ids.libraryEmpty)).toHaveCount(0);
    expect([...seen].sort()).toEqual(Object.values(ids).sort());
  });

  test('filters the library by Line type, status and search with literal expectations', async ({ page, language }) => {
    expect(await recipeIds(page)).toHaveLength(40);
    expect((await recipeIds(page)).slice(0, 5)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05']);
    await expect(recipeRow(page, 'R01').locator('td').nth(4)).toHaveText('3');
    await expect(recipeRow(page, 'R01').locator('td').nth(5)).toHaveText(text(language, recipeStatusLabels.draft));
    await pick(page, ids.filterLineType, text(language, lineTypeLabels.extrusion));
    await expect.poll(() => recipeIds(page)).toEqual(['R01', 'R06', 'R11', 'R16', 'R21', 'R26', 'R31', 'R36']);
    await pick(page, ids.filterStatus, text(language, recipeStatusLabels.approved));
    await expect.poll(() => recipeIds(page)).toEqual(['R11', 'R16', 'R26', 'R31']);
    await byId(page, ids.search).fill('WIN-TT');
    await expect.poll(() => recipeIds(page)).toEqual(['R11']);
    await expect(page.getByText(tCount(language, 'common.row-count', 1), { exact: true })).toBeVisible();
  });

  test('shows library-empty with a Version open and the whole Screen empty without one', async ({ page, language }) => {
    await byId(page, ids.search).fill('no-such-recipe');
    await expect(byId(page, ids.empty)).toContainText(text(language, 'recipes.empty'));
    await expect(byId(page, ids.library)).toHaveCount(0);
    await expect(byId(page, ids.libraryEmpty)).toHaveCount(0);
    await expect(byId(page, ids.version)).toHaveCount(0);
    await byId(page, ids.search).fill('');
    await expect(byId(page, ids.empty)).toHaveCount(0);
    await openRecipe(page, 'R01');
    await byId(page, ids.search).fill('no-such-recipe');
    await expect(byId(page, ids.libraryEmpty)).toContainText(text(language, 'recipes.library-empty'));
    await expect(byId(page, ids.empty)).toHaveCount(0);
    await expect(byId(page, ids.version)).toBeVisible();
  });

  test('the / shortcut focuses the search', async ({ page }) => {
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('/');
    await expect(byId(page, ids.search)).toBeFocused();
  });

  test('opens a latest Version by row click, by Enter and by the Open button, and keeps the Recipe selected', async ({ page, language }) => {
    const choice = byId(page, ids.versionChoice);
    await expect(recipeRow(page, 'R01')).toHaveAttribute('aria-selected', 'false');
    await recipeRow(page, 'R01').locator('td').nth(1).click();
    await expect(choice).toContainText(versionLabel(language, 'R01', 3, 'draft'));
    await expect(recipeRow(page, 'R01')).toHaveAttribute('aria-selected', 'true');
    await expect(recipeRow(page, 'R01')).toHaveAttribute('aria-current', 'true');
    await expect(recipeRow(page, 'R02')).not.toHaveAttribute('aria-current', 'true');
    await recipeRow(page, 'R02').focus();
    await page.keyboard.press('Enter');
    await expect(choice).toContainText(versionLabel(language, 'R02', 1, 'approved'));
    await expect(recipeRow(page, 'R02')).toHaveAttribute('aria-current', 'true');
    await expect(recipeRow(page, 'R01')).not.toHaveAttribute('aria-current', 'true');
    await openRecipe(page, 'R01');
    await expect(choice).toContainText(versionLabel(language, 'R01', 3, 'draft'));
    await choice.click();
    await expect(popupOptions(page)).toHaveText([versionLabel(language, 'R01', 3, 'draft'), versionLabel(language, 'R01', 2, 'approved'), versionLabel(language, 'R01', 1, 'approved')]);
    await popupOptions(page).filter({ hasText: versionLabel(language, 'R01', 2, 'approved') }).click();
    await expect(recipeRow(page, 'R01')).toHaveAttribute('aria-selected', 'true');
  });

  test('an Approved Version is read-only and explains why on focus', async ({ page, language }) => {
    await openRecipe(page, 'R11');
    await expect(byId(page, ids.versionChoice)).toContainText(versionLabel(language, 'R11', 2, 'approved'));
    const reason = text(language, 'recipes.approved-read-only');
    const field = setpoint(page, language, ZONE3);
    await expect(field).toHaveAttribute('readonly', '');
    await expect(field).toHaveAttribute('aria-disabled', 'true');
    await expect(field).toHaveAccessibleDescription(reason);
    const before = await field.inputValue();
    await field.focus();
    await expect(page.getByRole('tooltip')).toHaveText(reason);
    await field.pressSequentially('181');
    await field.press('Enter');
    await field.blur();
    await expect(field).toHaveValue(before);
    for (const id of [ids.save, ids.approve, ids.discard]) {
      await expect(byId(page, id)).toHaveAttribute('aria-disabled', 'true');
      await expect(byId(page, id)).toHaveAccessibleDescription(reason);
    }
    await expect(byId(page, ids.addStep)).toHaveAttribute('aria-disabled', 'true');
    await expect(byId(page, ids.newDraft)).toHaveAttribute('aria-disabled', 'false');
  });

  test('New Draft opens an editable Draft and a second New Draft is refused', async ({ page, language }) => {
    await openRecipe(page, 'R11');
    await byId(page, ids.newDraft).click();
    await expect(byId(page, ids.versionChoice)).toContainText(versionLabel(language, 'R11', 3, 'draft'));
    await expect(setpoint(page, language, ZONE3)).not.toHaveAttribute('readonly', '');
    await expect(byId(page, ids.newDraft)).toHaveCount(0);
    await byId(page, ids.versionChoice).click();
    await popupOptions(page).filter({ hasText: versionLabel(language, 'R11', 2, 'approved') }).click();
    const refused = byId(page, ids.newDraft);
    await expect(refused).toHaveAttribute('aria-disabled', 'true');
    await expect(refused).toHaveAccessibleDescription(text(language, plantErrorLabels['draft-exists']));
    await refused.focus();
    await refused.click({ force: true });
    await expect(byId(page, ids.versionChoice)).toContainText(versionLabel(language, 'R11', 2, 'approved'));
    await expect(byId(page, ids.versionChoice)).not.toContainText(versionLabel(language, 'R11', 4, 'draft'));
  });

  test('adds, removes and reorders Steps, keeping focus on the moved Step', async ({ page, language }) => {
    await openRecipe(page, 'R11');
    await byId(page, ids.newDraft).click();
    const kinds = (['preheat', 'ramp', 'run', 'cooldown'] as const).map(kind => text(language, stepKindLabels[kind]));
    const steps = byId(page, ids.step);
    await expect.poll(() => stepNames(page)).toEqual(kinds);
    const firstUp = buttonIn(steps.nth(0), language, 'action.move-up');
    await expect(firstUp).toHaveAttribute('aria-disabled', 'true');
    await expect(firstUp).toHaveAccessibleDescription(text(language, 'recipes.first-step'));
    await expect(buttonIn(steps.nth(3), language, 'action.move-down')).toHaveAccessibleDescription(text(language, 'recipes.last-step'));
    await firstUp.click({ force: true });
    await expect.poll(() => stepNames(page)).toEqual(kinds);
    await buttonIn(steps.nth(3), language, 'action.remove-step').click();
    await expect.poll(() => stepNames(page)).toEqual(kinds.slice(0, 3));
    await expect(byId(page, ids.addStep)).toBeFocused();
    await pick(page, ids.stepChoice, kinds[3]!);
    await byId(page, ids.addStep).click();
    await expect.poll(() => stepNames(page)).toEqual(kinds);
    await expect(steps.nth(3)).toBeFocused();
    await buttonIn(steps.nth(3), language, 'action.move-up').click();
    await expect.poll(() => stepNames(page)).toEqual([kinds[0], kinds[1], kinds[3], kinds[2]]);
    await expect(buttonIn(steps.nth(2), language, 'action.move-up')).toBeFocused();
    await buttonIn(steps.nth(2), language, 'action.move-down').click();
    await expect.poll(() => stepNames(page)).toEqual(kinds);
    const lastDown = buttonIn(steps.nth(3), language, 'action.move-down');
    await expect(lastDown).toBeFocused();
    await expect(lastDown).toHaveAttribute('aria-disabled', 'true');
    // Focused, the open tooltip adds a second reference to the same text, so the description may repeat the reason.
    await expect(lastDown).toHaveAccessibleDescription(new RegExp(`^${text(language, 'recipes.last-step')}`));
  });

  test('commits a typed Parameter on blur or Enter only, never per keystroke', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    const field = setpoint(page, language, ZONE3);
    await expectRule(page, language, 1, 'fail');
    await typeValue(field, '180');
    await expect(field).toHaveValue('180');
    await expect(byId(page, ids.parameterError)).toHaveCount(0);
    await expectRule(page, language, 1, 'fail');
    await field.press('Tab');
    await expectRule(page, language, 1, 'pass');
    await editField(field, '192', 'enter');
    await expectRule(page, language, 1, 'fail');
    await expect(field).toHaveValue('192');
    await expect(byId(page, ids.parameterError)).toHaveCount(0);
  });

  test('reads a decimal comma as a decimal point in pt-BR and keeps the value', async ({ page, language }) => {
    await openRecipe(page, 'R11');
    await byId(page, ids.newDraft).click();
    const field = setpoint(page, language, 'parameter.puller-speed');
    const typed = language === 'pt-BR' ? '2,5' : '2.5';
    await editField(field, typed);
    await expect(byId(page, ids.parameterError)).toHaveCount(0);
    await expect(field).toHaveValue(typed);
    // Leaving and returning to the Draft shows the committed value: 2.5, never 25 or the old value.
    await byId(page, ids.versionChoice).click();
    await popupOptions(page).filter({ hasText: versionLabel(language, 'R11', 2, 'approved') }).click();
    await byId(page, ids.versionChoice).click();
    await popupOptions(page).filter({ hasText: versionLabel(language, 'R11', 3, 'draft') }).click();
    await expect(setpoint(page, language, 'parameter.puller-speed')).toHaveValue(typed);
  });

  test('keeps an out-of-order field error after the revert and clears it on refocus', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    const minimum = parameterField(page, language, ZONE3, 'common.minimum');
    const original = await minimum.inputValue();
    const error = byId(page, ids.parameterError);
    await typeValue(minimum, '999');
    await expect(error).toHaveCount(0);
    await expect(minimum).toHaveAttribute('aria-invalid', 'false');
    await minimum.press('Enter');
    await expect(error).toHaveText(text(language, plantErrorLabels['parameter-order']));
    await expect(error).toHaveAttribute('role', 'status');
    await expect(minimum).toHaveAttribute('aria-invalid', 'true');
    await expect(minimum).toHaveAccessibleDescription(text(language, plantErrorLabels['parameter-order']));
    await minimum.press('Tab');
    await expect(minimum).toHaveValue(original);
    await expect(error).toHaveCount(1);
    await expect(minimum).toHaveAttribute('aria-invalid', 'true');
    await minimum.focus();
    await expect(error).toHaveCount(0);
    await expect(minimum).toHaveAttribute('aria-invalid', 'false');
  });

  test('moves each Dependency Rule between Passing and Failing with literal edits', async ({ page, language }) => {
    // Rule 1 on R01 v3 (Draft). Zone 2 is 176, so 190 is 14 apart and 192 is 16 apart.
    await openRecipe(page, 'R01');
    const zone3 = setpoint(page, language, ZONE3);
    await expectRule(page, language, 1, 'fail');
    await expect(rule(page, 1)).toContainText('198');
    await expect(rule(page, 1)).toContainText(text(language, ZONE3));
    await editField(zone3, '190'); await expectRule(page, language, 1, 'pass');
    await editField(zone3, '192'); await expectRule(page, language, 1, 'fail');
    await expect(rule(page, 1)).toContainText(text(language, ZONE2));
    await editField(zone3, '190'); await expectRule(page, language, 1, 'pass');
    await editField(zone3, '198'); await expectRule(page, language, 1, 'fail');
    await editField(zone3, '190'); await expectRule(page, language, 1, 'pass');
    await editField(parameterField(page, language, ZONE3, 'common.minimum'), '160');
    await editField(zone3, '164'); await expectRule(page, language, 1, 'fail');
    await editField(zone3, '190'); await expectRule(page, language, 1, 'pass');
    for (const n of [3, 4] as const) await expectRule(page, language, n, 'not-applicable');
    // Rule 2 on R06: the limit is 150 + 4 x screw speed, at 10 rpm 190 passes and 190.1 fails.
    await openRecipe(page, 'R06');
    const decimal = (value: string) => (language === 'pt-BR' ? value.replace('.', ',') : value);
    await editField(setpoint(page, language, SCREW), '10');
    await editField(setpoint(page, language, DIE), '190'); await expectRule(page, language, 2, 'pass');
    await editField(setpoint(page, language, DIE), decimal('190.1')); await expectRule(page, language, 2, 'fail');
    await expect(rule(page, 2)).toContainText(text(language, DIE));
    await editField(setpoint(page, language, SCREW), '22'); await expectRule(page, language, 2, 'pass');
    // Rule 3 on R05, inclusive ends, and rule 4 on R10, strictly under 120.
    await openRecipe(page, 'R05');
    const weldTemperature = setpoint(page, language, 'parameter.weld-temperature');
    await editField(weldTemperature, '270'); await expectRule(page, language, 3, 'pass');
    await editField(weldTemperature, '275'); await expectRule(page, language, 3, 'fail');
    await expect(rule(page, 3)).toContainText(text(language, 'parameter.weld-temperature'));
    await editField(weldTemperature, '255'); await expectRule(page, language, 3, 'pass');
    const weldTime = setpoint(page, language, 'parameter.weld-time');
    await editField(parameterField(page, language, 'parameter.weld-time', 'common.minimum'), '19');
    await editField(weldTime, '19'); await expectRule(page, language, 3, 'fail');
    await editField(weldTime, '30'); await expectRule(page, language, 3, 'pass');
    for (const n of [1, 2] as const) await expectRule(page, language, n, 'not-applicable');
    await openRecipe(page, 'R10');
    const cycle = setpoint(page, language, 'parameter.cycle-time');
    await editField(cycle, decimal('119.9')); await expectRule(page, language, 4, 'pass');
    await editField(cycle, '120'); await expectRule(page, language, 4, 'fail');
    await editField(cycle, '119'); await expectRule(page, language, 4, 'pass');
    // Roll forming: nothing applies.
    await openRecipe(page, 'R02');
    for (const n of [1, 2, 3, 4] as const) await expectRule(page, language, n, 'not-applicable');
  });

  test('blocks Save and Approve while a rule fails, naming the failing rules, then saves and approves', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    const blocked = (names: string[]) => `${text(language, plantErrorLabels['rules-failing'])} ${formatList(language, names)}`;
    for (const id of [ids.save, ids.approve]) {
      await expect(byId(page, id)).toHaveAttribute('aria-disabled', 'true');
      await expect(byId(page, id)).not.toHaveAttribute('disabled');
      await expect(byId(page, id)).toHaveAccessibleDescription(blocked([ruleName(language, 1)]));
      await byId(page, id).focus();
      await expect(page.getByRole('tooltip').last()).toHaveText(blocked([ruleName(language, 1)]));
    }
    await byId(page, ids.save).click({ force: true });
    await byId(page, ids.approve).click({ force: true });
    await expect(page.getByRole('status').filter({ hasText: text(language, 'recipes.draft-saved') })).toHaveCount(0);
    await expect(byId(page, ids.approve)).toHaveAttribute('aria-disabled', 'true');
    await editField(setpoint(page, language, DIE), '250');
    await expect(byId(page, ids.save)).toHaveAccessibleDescription(blocked([ruleName(language, 1), ruleName(language, 2)]));
    await expect(byId(page, ids.approve)).toHaveAccessibleDescription(blocked([ruleName(language, 1), ruleName(language, 2)]));
    await repairR01(page, language);
    for (const id of [ids.save, ids.approve]) {
      await expect(byId(page, id)).toHaveAttribute('aria-disabled', 'false');
      await expect(byId(page, id)).not.toHaveAttribute('aria-describedby', /.+/);
    }
    const saved = page.getByRole('status').filter({ hasText: text(language, 'recipes.draft-saved') });
    const unchanged = page.getByRole('status').filter({ hasText: text(language, 'recipes.no-changes') });
    await byId(page, ids.save).click();
    await expect(saved).toBeVisible();
    await expect(unchanged).toHaveCount(0);
    await byId(page, ids.save).click();
    await expect(unchanged).toBeVisible();
    await expect(saved).toHaveCount(0);
    // A Step move is the edit here: editing a Parameter right after Save is mangled by an app defect, which has its own check.
    await buttonIn(byId(page, ids.step).first(), language, 'action.move-down').click();
    await expect(unchanged).toHaveCount(0);
    await byId(page, ids.save).click();
    await expect(saved).toBeVisible();
    await buttonIn(byId(page, ids.step).nth(1), language, 'action.move-up').click();
    await expect(saved).toHaveCount(0);
    await byId(page, ids.approve).click();
    await expect(setpoint(page, language, ZONE3)).toHaveAttribute('readonly', '');
    await expect(byId(page, ids.newDraft)).toBeVisible();
    for (const id of [ids.save, ids.approve, ids.discard]) {
      await expect(byId(page, id)).toHaveAttribute('aria-disabled', 'true');
      await expect(byId(page, id)).toHaveAccessibleDescription(text(language, 'recipes.approved-read-only'));
    }
  });

  test('typing into a Parameter right after Save keeps what was typed', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    await repairR01(page, language);
    await byId(page, ids.save).click();
    await expect(page.getByRole('status').filter({ hasText: text(language, 'recipes.draft-saved') })).toBeVisible();
    const field = setpoint(page, language, ZONE3);
    await typeValue(field, '181');
    await expect(field).toHaveValue('181');
    await field.press('Tab');
    await expect(field).toHaveValue('181');
    await expect(byId(page, ids.parameterError)).toHaveCount(0);
  });

  test('Approve does not need a prior Save', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    await repairR01(page, language);
    await byId(page, ids.approve).click();
    await expect(setpoint(page, language, ZONE3)).toHaveAttribute('readonly', '');
    await expect(byId(page, ids.newDraft)).toBeVisible();
    await expect(recipeRow(page, 'R01').locator('td').nth(5)).toHaveText(text(language, recipeStatusLabels.approved));
  });

  test('Discard asks first, returns focus on Cancel, and goes to the search after confirming', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    await byId(page, ids.discard).focus();
    await byId(page, ids.discard).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(text(language, 'recipes.discard-confirm'));
    await page.keyboard.press('6');
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/recipes/);
    await dialog.getByRole('button', { name: text(language, 'action.cancel'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(byId(page, ids.discard)).toBeFocused();
    await expect(byId(page, ids.version)).toBeVisible();
    await byId(page, ids.discard).click();
    await dialog.getByRole('button', { name: text(language, 'action.recipe-discard'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(byId(page, ids.version)).toHaveCount(0);
    await expect(recipeRow(page, 'R01').locator('td').nth(4)).toHaveText('2');
    await expect(recipeRow(page, 'R01').locator('td').nth(5)).toHaveText(text(language, recipeStatusLabels.approved));
    // Version numbers keep increasing: the next Draft of R01 is v4, not v3.
    await openRecipe(page, 'R01');
    await byId(page, ids.newDraft).click();
    await expect(byId(page, ids.versionChoice)).toContainText(versionLabel(language, 'R01', 4, 'draft'));
  });

  test('Discard confirmation sends focus to the search', async ({ page, language }) => {
    await openRecipe(page, 'R01');
    await byId(page, ids.discard).click();
    await page.getByRole('dialog').getByRole('button', { name: text(language, 'action.recipe-discard'), exact: true }).click();
    await expect(byId(page, ids.version)).toHaveCount(0);
    await expect(byId(page, ids.search)).toBeFocused();
  });

  for (const width of [1280, 1440]) {
    test(`has no horizontal page overflow at ${width} px`, async ({ page }) => {
      await atWidth(page, width, async () => {
        await openRecipe(page, 'R01');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'page horizontal overflow').toBe(0);
      });
    });

    test(`fits the library in 7 columns without horizontal scroll and keeps the Dependency panel in view at ${width} px`, async ({ page, language }) => {
      await atWidth(page, width, async () => {
        await expect(byId(page, ids.library).locator('thead th')).toHaveCount(7);
        const overflow = await byId(page, ids.library).evaluate(table => {
          const clipped: string[] = [];
          for (let element: Element | null = table; element && element.tagName !== 'MAIN'; element = element.parentElement) {
            if (element.scrollWidth > element.clientWidth + 1) clipped.push(`${element.tagName}.${element.className}: ${element.scrollWidth} > ${element.clientWidth}`);
          }
          return clipped;
        });
        expect(overflow).toEqual([]);
        await openRecipe(page, 'R01');
        const panel = page.getByRole('complementary', { name: text(language, 'recipes.dependency-check') });
        await expect(panel).toBeVisible();
        await byId(page, ids.step).last().scrollIntoViewIfNeeded();
        await expect(byId(page, ids.step).last()).toBeInViewport();
        await expect(byId(page, ids.step).first()).not.toBeInViewport();
        for (const id of RULE_IDS) await expect(byId(page, id)).toBeInViewport();
      });
    });
  }

  test('has no English UI text in pt-BR', async ({ page, language }) => {
    test.skip(language !== 'pt-BR');
    await openRecipe(page, 'R01');
    await editField(parameterField(page, language, ZONE3, 'common.minimum'), '999', 'enter');
    const { leaks, unknown } = await portugueseLeaks(page);
    test.info().annotations.push({ type: 'unknown-strings', description: unknown.join(' | ') });
    expect(leaks).toEqual([]);
  });
});
