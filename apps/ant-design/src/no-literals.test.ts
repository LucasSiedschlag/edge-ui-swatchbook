// @vitest-environment happy-dom
import { expect, it } from 'vitest';

const sources = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.*', '!./test-*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const WORD = /[A-Za-z]{2,}/;
const TEXT_PROPS = 'title|label|placeholder|description|alt|okText|cancelText|aria-label|tooltip|header|message|extra|text';

function suspects(source: string): string[] {
  const code = source.split('\n').filter(line => !/^\s*(import|export .* from)\b/.test(line) && !line.includes('new Error(')).join('\n');
  const found: string[] = [];
  // JSX text between tags.
  for (const m of code.matchAll(/>([^<>{}=;]*)</g)) if (WORD.test(m[1]!) && !/^\s*$/.test(m[1]!)) found.push(m[1]!.trim());
  // String props that carry text.
  for (const m of code.matchAll(new RegExp(`\\b(?:${TEXT_PROPS})=(?:"([^"]*)"|'([^']*)')`, 'g'))) if (WORD.test(m[1] ?? m[2] ?? '')) found.push(m[0]);
  // Sentences hidden in plain string literals.
  for (const m of code.matchAll(/(['"`])((?:(?!\1).)*[A-Za-z]{2,} [A-Za-z]{2,}(?:(?!\1).)*)\1/g)) found.push(m[2]!);
  return found;
}

it('finds the source files', () => {
  expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6);
});

it('has no user-facing string literal in the app source', () => {
  const offenders = Object.entries(sources).flatMap(([file, source]) => suspects(source).map(found => `${file}: ${found}`));
  expect(offenders).toEqual([]);
});

it('detects literals in a sample', () => {
  expect(suspects('const a = <b>Hello</b>;')).toHaveLength(1);
  expect(suspects('const a = <B title="Hello" />;')).toHaveLength(1);
  expect(suspects("const a = 'two words';")).toHaveLength(1);
  expect(suspects("const a = <B data-testid=\"deck.pause\" className=\"x\">{t('k')}</B>;")).toHaveLength(0);
});
