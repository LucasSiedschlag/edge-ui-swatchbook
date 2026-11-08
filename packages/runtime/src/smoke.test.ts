import { expect, it } from 'vitest';
import { generateMockDataset } from '@swatchbook/core';
import * as runtime from './index';

it('keeps the standalone clock internal so consumers share the provider clock', () => {
  expect(runtime).not.toHaveProperty('useSimClock');
});

it('can import core', () => {
  expect(generateMockDataset().lines).toHaveLength(7);
});
