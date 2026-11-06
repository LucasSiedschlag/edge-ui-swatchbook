import { describe, expect, it } from 'vitest';
import { isLastStep, nextStep, previousStep, stepForRoute, TOUR_MESSAGES, TOUR_STEPS, tourStepAt } from './tour';

const SCREENS_IN_ORDER = ['deck', 'recipes', 'ledger', 'performance', 'parameters', 'control'];
const ROUTES = ['/deck', '/recipes', '/ledger', '/performance', '/parameters', '/control'];

describe('TOUR_STEPS', () => {
  it('has one step per Screen in order with its route', () => {
    expect(TOUR_STEPS.map((s) => s.screen)).toEqual(SCREENS_IN_ORDER);
    expect(TOUR_STEPS.map((s) => s.route)).toEqual(ROUTES);
  });

  it('takes the title from the Screen name and the note from tour.<screen>.note', () => {
    expect(TOUR_STEPS.map((s) => [s.titleKey, s.noteKey])).toEqual(
      SCREENS_IN_ORDER.map((id) => [`screen.${id}`, `tour.${id}.note`]),
    );
  });
});

describe('TOUR_MESSAGES', () => {
  const en: Record<string, string> = { ...TOUR_MESSAGES.en };
  const pt: Record<string, string> = { ...TOUR_MESSAGES['pt-BR'] };

  it('has exactly the keys used by the steps, in both languages', () => {
    const used = TOUR_STEPS.map((s) => s.noteKey).sort();
    expect(Object.keys(en).sort()).toEqual(used);
    expect(Object.keys(pt).sort()).toEqual(used);
  });

  it('has no empty text and the same placeholders', () => {
    const holders = (t: string) => (t.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const k of Object.keys(en)) {
      expect(en[k]!.trim()).not.toBe('');
      expect(pt[k]!.trim()).not.toBe('');
      expect(holders(pt[k]!)).toEqual(holders(en[k]!));
    }
  });

  it('keeps notes short, at most two sentences', () => {
    for (const step of TOUR_STEPS) {
      for (const text of [en[step.noteKey]!, pt[step.noteKey]!]) {
        expect(text.split(/[.!?](\s|$)/).filter((p) => p.trim().length > 1).length).toBeLessThanOrEqual(2);
        expect(text.length).toBeLessThanOrEqual(260);
      }
    }
  });

  it('never ranks or judges, and never names a Library', () => {
    const banned = [
      /\bbest\b/i, /\bbetter\b/i, /\bworse\b/i, /\bworst\b/i, /\bfaster\b/i, /\bnicer\b/i, /\bprettier\b/i, /\bwinner\b/i,
      /\bmelhor\b/i, /\bmelhores\b/i, /\bpior\b/i, /\bmais rápid/i, /\bmais bonit/i, /\bvencedor/i,
      /ant design/i, /mantine/i, /material/i, /\bmui\b/i, /chakra/i, /shadcn/i, /primereact/i, /blueprint/i, /fluent/i, /carbon/i,
    ];
    for (const lang of [en, pt]) {
      for (const text of Object.values(lang)) for (const re of banned) expect(text).not.toMatch(re);
    }
  });

  it('uses no em or en dashes', () => {
    expect(JSON.stringify(TOUR_MESSAGES)).not.toMatch(new RegExp(String.fromCharCode(91, 0x2013, 0x2014, 93)));
  });

  it('uses the agreed Portuguese terms', () => {
    expect(pt['tour.deck.note']).toMatch(/Parada de emergência/);
    expect(pt['tour.deck.note']).toMatch(/Alarme/);
    expect(pt['tour.deck.note']).toMatch(/Linha/);
    expect(pt['tour.recipes.note']).toMatch(/Rascunho/);
    expect(pt['tour.control.note']).toMatch(/Registro de eventos/);
    expect(pt['tour.control.note']).toMatch(/Reconhecer/);
    expect(pt['tour.parameters.note']).toMatch(/alteração manual de setpoint/);
  });

  it('points at what to look for on each Screen', () => {
    expect(en['tour.deck.note']).toMatch(/Emergency stop/);
    expect(en['tour.recipes.note']).toMatch(/Dependency Rule/);
    expect(en['tour.ledger.note']).toMatch(/drawer/);
    expect(en['tour.performance.note']).toMatch(/Pareto/);
    expect(en['tour.parameters.note']).toMatch(/Setpoint Override/);
    expect(en['tour.control.note']).toMatch(/Event Log/);
  });
});

describe('navigation helpers', () => {
  it('tourStepAt returns the step or undefined out of range', () => {
    expect(tourStepAt(0)?.screen).toBe('deck');
    expect(tourStepAt(5)?.screen).toBe('control');
    expect(tourStepAt(6)).toBeUndefined();
    expect(tourStepAt(-1)).toBeUndefined();
  });

  it('is linear: first has no previous, last has no next', () => {
    expect(previousStep(0)).toBeNull();
    expect(previousStep(1)).toBe(0);
    expect(previousStep(5)).toBe(4);
    expect(nextStep(0)).toBe(1);
    expect(nextStep(4)).toBe(5);
    expect(nextStep(5)).toBeNull();
  });

  it('returns null for out-of-range indexes', () => {
    expect(nextStep(-1)).toBeNull();
    expect(nextStep(9)).toBeNull();
    expect(previousStep(6)).toBeNull();
    expect(previousStep(-1)).toBeNull();
    expect(isLastStep(6)).toBe(false);
  });

  it('isLastStep is true only for the sixth step', () => {
    expect([0, 1, 2, 3, 4, 5].map(isLastStep)).toEqual([false, false, false, false, false, true]);
  });

  it('stepForRoute finds the step index or null', () => {
    expect(stepForRoute('/deck')).toBe(0);
    expect(stepForRoute('/performance')).toBe(3);
    expect(stepForRoute('/control')).toBe(5);
    expect(stepForRoute('/nope')).toBeNull();
    expect(stepForRoute('')).toBeNull();
  });
});
