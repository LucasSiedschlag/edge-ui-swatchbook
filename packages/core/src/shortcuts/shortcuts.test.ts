import { describe, expect, it } from 'vitest';
import { SHORTCUTS, SHORTCUT_HELP, SHORTCUT_MESSAGES, isTextEntryTarget, resolveShortcut } from './shortcuts';

const SCREEN_ORDER = ['deck', 'recipes', 'ledger', 'performance', 'parameters', 'control'];

it.each(SHORTCUTS)('ignores $key when any target or composed-path ancestor is a dialog', ({ key }) => {
  for (const modal of [{ ariaModal: 'true' }, { role: 'dialog' }, { role: 'alertdialog' }]) {
    expect(resolveShortcut({ key, target: modal }, { rowFocused: true })).toBeNull();
    expect(resolveShortcut({ key, target: { tagName: 'SPAN' }, composedPath: () => [{ tagName: 'SPAN' }, modal] }, { rowFocused: true })).toBeNull();
  }
});

describe('SHORTCUTS table', () => {
  it('lists the ten bindings from the screens README', () => {
    expect(SHORTCUTS.map((s) => s.key)).toEqual(['/', 'Enter', 'Escape', 'a', '1', '2', '3', '4', '5', '6']);
  });

  it('has unique keys', () => {
    expect(new Set(SHORTCUTS.map((s) => s.key)).size).toBe(SHORTCUTS.length);
  });

  it('never produces an emergency stop or any plant change besides acknowledge', () => {
    const allowed = ['focus-search', 'open-details', 'close', 'acknowledge', 'go-screen'];
    for (const s of SHORTCUTS) expect(allowed).toContain(s.action.type);
    for (let code = 32; code < 127; code += 1) {
      const key = String.fromCharCode(code);
      for (const shiftKey of [false, true]) {
        const action = resolveShortcut({ key, shiftKey });
        if (action) expect(allowed).toContain(action.type);
      }
    }
    expect(JSON.stringify(SHORTCUTS)).not.toMatch(/emergency|stop/i);
  });
});

describe('resolveShortcut', () => {
  it('resolves every binding', () => {
    expect(resolveShortcut({ key: '/' })).toEqual({ type: 'focus-search' });
    expect(resolveShortcut({ key: 'Enter' }, { rowFocused: true })).toEqual({ type: 'open-details' });
    expect(resolveShortcut({ key: 'Escape' })).toEqual({ type: 'close' });
    expect(resolveShortcut({ key: 'a' })).toEqual({ type: 'acknowledge' });
  });

  it('accepts a capital A for acknowledge', () => {
    expect(resolveShortcut({ key: 'A', shiftKey: true })).toEqual({ type: 'acknowledge' });
  });

  it('maps digits 1 to 6 to the Screens in order', () => {
    ['1', '2', '3', '4', '5', '6'].forEach((key, i) => {
      expect(resolveShortcut({ key })).toEqual({ type: 'go-screen', screen: SCREEN_ORDER[i] });
    });
  });

  it('returns null for 0, 7 and unknown keys', () => {
    for (const key of ['0', '7', '9', 'b', 'Tab', 'F1', ' ', '']) expect(resolveShortcut({ key })).toBeNull();
  });

  it('matches on the character so slash works on ABNT2 with Shift', () => {
    expect(resolveShortcut({ key: '/', shiftKey: true })).toEqual({ type: 'focus-search' });
  });

  it('ignores events with ctrl, meta or alt', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(resolveShortcut({ key: 'a', [mod]: true })).toBeNull();
      expect(resolveShortcut({ key: '1', [mod]: true })).toBeNull();
      expect(resolveShortcut({ key: 'Escape', [mod]: true })).toBeNull();
    }
  });

  it('ignores repeat events for acknowledge only', () => {
    expect(resolveShortcut({ key: 'a', repeat: true })).toBeNull();
    expect(resolveShortcut({ key: 'A', repeat: true })).toBeNull();
    expect(resolveShortcut({ key: '3', repeat: true })).toEqual({ type: 'go-screen', screen: 'ledger' });
  });

  it('is inactive while a text field has focus', () => {
    expect(resolveShortcut({ key: 'a' }, { textFieldFocused: true })).toBeNull();
    expect(resolveShortcut({ key: '1' }, { textFieldFocused: true })).toBeNull();
    expect(resolveShortcut({ key: '/', target: { tagName: 'INPUT', type: 'text' } })).toBeNull();
    expect(resolveShortcut({ key: 'a', target: { tagName: 'INPUT' } })).toBeNull();
    expect(resolveShortcut({ key: 'a', target: { tagName: 'textarea' } })).toBeNull();
    expect(resolveShortcut({ key: '2', target: { tagName: 'SELECT' } })).toBeNull();
    expect(resolveShortcut({ key: 'a', target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
    expect(resolveShortcut({ key: 'Enter', target: { tagName: 'INPUT', type: 'search' } })).toBeNull();
  });

  it('stays active on checkbox, radio and button inputs', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset']) {
      expect(resolveShortcut({ key: 'a', target: { tagName: 'INPUT', type } })).toEqual({ type: 'acknowledge' });
    }
  });

  it('stays active for a null target or a plain element', () => {
    expect(resolveShortcut({ key: 'a', target: null })).toEqual({ type: 'acknowledge' });
    expect(resolveShortcut({ key: 'a', target: { tagName: 'TR' } })).toEqual({ type: 'acknowledge' });
  });

  it('leaves Escape to the focused text field', () => {
    expect(resolveShortcut({ key: 'Escape', target: { tagName: 'INPUT', type: 'text' } })).toBeNull();
    expect(resolveShortcut({ key: 'Escape' }, { textFieldFocused: true })).toBeNull();
    expect(resolveShortcut({ key: 'Escape', target: { tagName: 'TEXTAREA' } })).toBeNull();
  });
});

describe('isTextEntryTarget', () => {
  it('handles null and undefined', () => {
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(undefined)).toBe(false);
  });
  it('detects text entry elements', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'input' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTextEntryTarget({ isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
  });
});

describe('help and messages', () => {
  it('lists help entries with message keys that exist in both languages', () => {
    expect(SHORTCUT_HELP.map((h) => h.keys)).toEqual(['/', 'Enter', 'Esc', 'a', '1-6']);
    for (const h of SHORTCUT_HELP) {
      expect(SHORTCUT_MESSAGES.en[h.action]).toBeTruthy();
      expect(SHORTCUT_MESSAGES['pt-BR'][h.action]).toBeTruthy();
    }
  });

  it('has identical keys, dotted lowercase, same placeholders, no empty text', () => {
    const en = SHORTCUT_MESSAGES.en;
    const pt = SHORTCUT_MESSAGES['pt-BR'];
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).sort()).toEqual([
      'shortcut.acknowledge',
      'shortcut.close',
      'shortcut.focus-search',
      'shortcut.go-screen',
      'shortcut.open-details',
    ]);
    const holders = (t: string) => (t.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(k).toMatch(/^[a-z]+(\.[a-z-]+)+$/);
      expect(en[k]!.trim()).not.toBe('');
      expect(pt[k]!.trim()).not.toBe('');
      expect(holders(pt[k]!)).toEqual(holders(en[k]!));
    }
    expect(en['shortcut.go-screen']).toContain('{number}');
  });

  it('uses no em or en dashes', () => {
    expect(JSON.stringify(SHORTCUT_MESSAGES)).not.toMatch(new RegExp(String.fromCharCode(91, 0x2013, 0x2014, 93)));
  });
});


it('ignores handled and composing events including IME Escape and 229 Enter', () => {
  for (const event of [
    { key: 'Escape', isComposing: true }, { key: 'Enter', keyCode: 229 },
    { key: '/', defaultPrevented: true },
    ...['Process', 'Dead', 'Unidentified'].map(key => ({ key })),
  ]) expect(resolveShortcut(event, { rowFocused: true })).toBeNull();
});

it('inspects the complete path for shadow inputs, custom controls and editable roles', () => {
  for (const target of [
    { tagName: 'INPUT', type: 'date' }, { tagName: 'UI5-INPUT' },
    ...['textbox', 'combobox', 'searchbox', 'spinbutton'].map(role => ({ tagName: 'DIV', role })),
    ...['', 'true', 'plaintext-only'].map(contentEditable => ({ tagName: 'DIV', contentEditable })),
  ]) {
    for (const key of ['/', 'Enter', 'Escape', 'a', '1']) {
      expect(resolveShortcut({ key, target })).toBeNull();
      expect(resolveShortcut({ key, target: { tagName: 'SPAN' }, composedPath: () => [{ tagName: 'SPAN' }, target] })).toBeNull();
    }
  }
  for (const type of ['range', 'color', 'file']) expect(isTextEntryTarget({ tagName: 'INPUT', type })).toBe(false);
});

it('requires a focused row and preserves native activation on buttons and links', () => {
  expect(resolveShortcut({ key: 'Enter' })).toBeNull();
  for (const target of [{ tagName: 'TR' }, { role: 'row' }]) expect(resolveShortcut({ key: 'Enter', target })).toEqual({ type: 'open-details' });
  expect(resolveShortcut({ key: 'Enter', target: { tagName: 'SPAN' }, composedPath: () => [{ role: 'row' }] })).toEqual({ type: 'open-details' });
  for (const tagName of ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']) {
    expect(resolveShortcut({ key: 'Enter', target: { tagName }, composedPath: () => [{ role: 'row' }] }, { rowFocused: true })).toBeNull();
    expect(resolveShortcut({ key: 'Enter', target: { tagName }, composedPath: () => [{ role: 'dialog' }] })).toBeNull();
  }
});

it('accepts AltGr slash on ABNT2 while rejecting command modifiers', () => {
  expect(resolveShortcut({ key: '/', ctrlKey: true, altKey: true, getModifierState: key => key === 'AltGraph' })).toEqual({ type: 'focus-search' });
  expect(resolveShortcut({ key: '/', ctrlKey: true, altKey: true, getModifierState: () => false })).toBeNull();
});

it('does not mistake a lone command modifier for the ctrl+alt AltGr pair', () => {
  for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    expect(resolveShortcut({ key: '/', ...modifiers, getModifierState: () => true })).toBeNull();
  }
});


it.each(SHORTCUTS)('suppresses $key for Drawer descendants and native open dialogs, including shadow paths', ({ key }) => {
  const drawer = { querySelector: () => ({ role: 'dialog' }) };
  const native = { tagName: 'DIALOG', open: true };
  for (const target of [drawer, native]) {
    expect(resolveShortcut({ key, target }, { rowFocused: true })).toBeNull();
    expect(resolveShortcut({ key, target: { tagName: 'SPAN' }, composedPath: () => [{ tagName: 'X-HOST' }, target, { tagName: 'X-OUTER' }] }, { rowFocused: true })).toBeNull();
  }
});
it('ignores mounted hidden dialogs and supports the app modal predicate context', () => {
  for (const hidden of [{ hidden: true }, { ariaHidden: 'true' }, { style: { display: 'none' } }, { inert: true }]) {
    expect(resolveShortcut({ key: 'a', target: { querySelector: () => ({ role: 'dialog', ...hidden }) } })).toEqual({ type: 'acknowledge' });
  }
  expect(resolveShortcut({ key: 'a', target: { tagName: 'DIALOG', open: false } })).toEqual({ type: 'acknowledge' });
  expect(resolveShortcut({ key: 'a' }, { modalOpen: true })).toBeNull();
});

it('recognizes native open attributes and ignores hidden ancestors of mounted dialogs', () => {
  expect(resolveShortcut({ key: 'a', target: { tagName: 'DIALOG', hasAttribute: name => name === 'open' } })).toBeNull();
  expect(resolveShortcut({ key: 'a', target: { role: 'dialog', parentElement: { hidden: true } } })).toEqual({ type: 'acknowledge' });
});
